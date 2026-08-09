"""The agent's persona, with the file as the source of truth.

There is no row and no revision to poll. The worker builds its Agent inside the
per-job entrypoint, and that constructor reads the prompt file every time, so
the next call after a save gets the new text with nothing restarted. A copy in
Postgres would only add a second answer to the question of what the agent says.
"""

import logging
import os
import stat
import tempfile
from pathlib import Path

from src.core.config import Config
from src.schemas.agents_schemas import AgentPromptRead

logger = logging.getLogger(__name__)

# What the console calls the file, and what every doc in this repo calls it. The
# path on disk is /app/prompts/instructions.md in a container and the repo file
# when the backend runs by hand, and neither reads as an instruction to a human.
DISPLAY_PATH = "agent/prompts/instructions.md"

# A persona is prose. 100 KB is past any prompt worth writing and small enough
# that reading and writing it in the request costs nothing worth measuring.
MAX_BYTES = 100_000

# The one substitution load_instructions() makes in the worker.
PLACEHOLDER = "{agent_name}"

# Mode for a persona file this service creates. NamedTemporaryFile makes 0600,
# which would survive the rename and hand the worker a file it may not be able
# to read. An existing file keeps whatever mode it already had.
NEW_FILE_MODE = 0o644

# Stated once so the refused write and the greyed-out editor say the same thing.
WRITES_DISABLED_REASON = (
    "Editing the prompt over the API is disabled. This backend has no "
    "authentication, so an open write would let anyone who can reach it change "
    "what your agent says. Set CONSOLE_WRITES_ENABLED=true only where that is "
    "safe."
)


class PromptTooLargeError(ValueError):
    """The submitted prompt is over the cap. Nothing was written."""


class PromptWriteFailedError(RuntimeError):
    """The new prompt could not be put in place. The old one is intact."""


def _normalise(content: str) -> str:
    """CRLF to LF, and exactly one trailing newline.

    A browser text area sends CRLF on Windows and usually no final newline. Both
    would survive a round trip through the file and show up as a diff against
    text nobody typed, which makes every save look like a change.
    """
    text = content.replace("\r\n", "\n").replace("\r", "\n")
    return text.rstrip("\n") + "\n"


def _warnings(content: str, *, exists: bool) -> list[str]:
    """Notes for the editor. Nothing here ever refuses a save.

    A prompt is prose, and the worker substitutes with str.replace rather than
    str.format, so a file with no placeholder is legal and a file full of JSON
    braces still loads.
    """
    if not exists:
        # The placeholder note below would be a lie here: there is no file, so
        # the worker is running the packaged default, which does have one.
        return [
            f"No prompt file at {DISPLAY_PATH} yet, so the agent is running the "
            "packaged default from agent/src/prompts/instructions.py. Saving "
            "here creates the file."
        ]
    if "\x00" in content:
        # UTF-16 without a BOM. Every ASCII character becomes 'X\x00', and a NUL
        # is legal UTF-8, so this decodes cleanly into text no model can use and
        # the UnicodeDecodeError path never fires. Only the content shows it.
        return [
            f"{DISPLAY_PATH} contains NUL bytes, which usually means it was "
            "saved as UTF-16 rather than UTF-8. The agent is being given this "
            "text as it is. Re-save the file as UTF-8."
        ]
    if not content.strip():
        # An empty file still loads, so the packaged default does NOT come back:
        # the agent runs with no output rules and no guardrails at all. Clearing
        # the box and saving is one keystroke away and there is no undo, so say
        # what it did rather than reporting a clean save.
        return [
            f"{DISPLAY_PATH} is now empty, so the next call runs with no "
            "instructions at all. An empty file still loads, so the packaged "
            "default does not come back. Paste a prompt and save again."
        ]
    if PLACEHOLDER not in content:
        return [
            f"This prompt has no {PLACEHOLDER}, so the agent's name never "
            "appears in what it is told. That is allowed and this text saves "
            "as it is."
        ]
    return []


class AgentPromptService:
    """Reads and rewrites the one file that decides what the agent says."""

    def __init__(self, config: Config) -> None:
        self._config = config
        # Resolved once. Every message this service produces names an absolute
        # path, because "could not write instructions.md" tells someone with a
        # missing mount nothing they can act on.
        self._path = Path(config.AGENT_PROMPT_FILE).resolve()

    @property
    def path(self) -> Path:
        return self._path

    async def read(self) -> AgentPromptRead:
        try:
            # Read in the request rather than in a thread. This is one small
            # local file and the console asks for it once per page load.
            content = self._path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            # Not UTF-8. PowerShell's '>' and Set-Content write UTF-16LE by
            # default, and this file is meant to be hand-edited, so this is a
            # state a real operator reaches. The worker's own loader cannot read
            # it either, so every call is already failing. This endpoint exists
            # to explain the file's state, and a 500 explains nothing.
            logger.warning("prompt file at %s is not valid UTF-8", self._path)
            return self._describe(
                "",
                exists=True,
                extra_warnings=[
                    f"{DISPLAY_PATH} is not valid UTF-8, so neither this editor "
                    "nor the agent can read it. Re-save it as UTF-8. Saving here "
                    "replaces it with whatever you type."
                ],
                derive_warnings=False,
            )
        except OSError:
            # Missing is a normal state, not a failure. A clone that has not
            # been edited yet has no file and the worker falls back to its
            # packaged default, so the console must get an empty editor and the
            # flag that lets it say so, never a 404.
            logger.info("no prompt file at %s, reporting it as absent", self._path)
            return self._describe("", exists=False)
        return self._describe(content, exists=True)

    async def write(self, content: str) -> AgentPromptRead:
        text = _normalise(content)
        encoded = text.encode("utf-8")
        # Measured after normalising, because that is what lands on disk. It
        # keeps byte_size <= max_bytes true of anything this service ever wrote.
        if len(encoded) > MAX_BYTES:
            raise PromptTooLargeError(
                f"That prompt is {len(encoded)} bytes and the limit is "
                f"{MAX_BYTES}. Nothing was written."
            )

        try:
            self._replace(encoded)
        except OSError as exc:
            raise PromptWriteFailedError(
                f"Could not write {self._path}. The backend needs "
                "./agent/prompts mounted read-write, and that mount being "
                "missing or read-only is the usual cause. The prompt the agent "
                "is running has not changed."
            ) from exc

        logger.info("wrote %d bytes to %s", len(encoded), self._path)
        return self._describe(text, exists=True)

    def _replace(self, data: bytes) -> None:
        """Put the new persona in place, or leave the old one exactly as it was.

        The target is never opened for truncation. The worker re-reads this file
        on every job, so the window in which a half-written file gets picked up
        is every call that starts during the write, and a half-written persona
        is a broken agent. os.replace is atomic, and the temporary file is made
        in the target's own directory because that atomicity only holds within
        one filesystem.

        The directory is never created here. When ./agent/prompts is not mounted
        into this container, creating it would make the save report success into
        a directory the worker does not read.
        """
        handle = tempfile.NamedTemporaryFile(
            mode="wb",
            dir=self._path.parent,
            prefix=".instructions-",
            suffix=".tmp",
            delete=False,
        )
        tmp = Path(handle.name)
        try:
            with handle:
                handle.write(data)
                handle.flush()
                # Before the rename, not after. os.replace orders the directory
                # entry, not the bytes behind it, so a machine that lost power
                # here could otherwise come back to a target pointing at an
                # empty file.
                os.fsync(handle.fileno())
            self._match_target_mode(tmp)
            os.replace(tmp, self._path)
        except OSError:
            # The rename either happened or it did not. Either way no temporary
            # file is left next to the persona for the next reader to wonder at.
            tmp.unlink(missing_ok=True)
            raise

    def _match_target_mode(self, tmp: Path) -> None:
        """Give the replacement the mode the old file had, 0644 for a new one.

        The worker reads this file as another process and possibly as another
        user, so inheriting NamedTemporaryFile's 0600 could hand it a file it
        cannot open, which looks exactly like the agent ignoring every save.

        Best effort on purpose. A filesystem that refuses chmod still took the
        bytes, and failing the save over the mode would be the worse outcome.
        """
        try:
            mode = stat.S_IMODE(self._path.stat().st_mode)
        except OSError:
            mode = NEW_FILE_MODE
        try:
            os.chmod(tmp, mode)
        except OSError:
            logger.warning("could not set the mode on %s", self._path, exc_info=True)

    def _read_only_reason(self) -> str | None:
        """Why a save would be refused, or None when it would go through."""
        if not self._config.CONSOLE_WRITES_ENABLED:
            return WRITES_DISABLED_REASON

        # The directory, not just the file: this writes by creating a sibling
        # and renaming it over the target, so a writable file in a read-only
        # directory still cannot be saved.
        if not os.access(self._path.parent, os.W_OK):
            return (
                f"{self._path.parent} is not writable by the backend. Mount "
                "./agent/prompts into this container read-write to edit the "
                "prompt from the console."
            )
        # The file's own write bit is deliberately NOT checked. _replace() never
        # opens the target: it renames a sibling over it, which needs the
        # directory checked above and nothing from the file. Testing the file
        # here was wrong in both directions. It greyed the editor out on a
        # deployment where saving works (a Linux bind mount where the file
        # carries another uid but the directory is writable), and it told anyone
        # who chmod 444'd the persona that it was protected while a PUT
        # overwrote it anyway. editable now means what it says: this save lands.
        return None

    def _describe(
        self,
        content: str,
        *,
        exists: bool,
        extra_warnings: list[str] | None = None,
        # Off when 'content' is a stand-in rather than the file's text, so the
        # notes derived from it (empty, no placeholder) would describe nothing
        # the file actually says.
        derive_warnings: bool = True,
    ) -> AgentPromptRead:
        reason = self._read_only_reason()
        return AgentPromptRead(
            slug=self._config.AGENT_NAME,
            path=DISPLAY_PATH,
            content=content,
            exists=exists,
            editable=reason is None,
            read_only_reason=reason,
            byte_size=len(content.encode("utf-8")),
            max_bytes=MAX_BYTES,
            warnings=(extra_warnings or [])
            + (_warnings(content, exists=exists) if derive_warnings else []),
        )
