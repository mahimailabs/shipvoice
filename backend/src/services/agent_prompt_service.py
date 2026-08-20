"""The agent's persona, read from the one file that decides what it says.

Read only. The buyer changes the prompt by opening the file and editing it, and
git is the history. That is why this service reports the path: the console
shows where to edit rather than offering a box to edit in.

There is no row and no revision to poll. The worker builds its Agent inside the
per-job entrypoint, and that constructor reads the prompt file every time, so
the next call after an edit speaks the new text. A copy in Postgres would only
add a second answer to the question of what the agent says.
"""

import logging
from pathlib import Path

from src.core.config import Config
from src.schemas.agents_schemas import AgentPromptRead

logger = logging.getLogger(__name__)

# What the console calls the file, and what every doc in this repo calls it. The
# path on disk is /app/prompts/instructions.md in a container and the repo file
# when the backend runs by hand, and neither reads as an instruction to a human.
DISPLAY_PATH = "agent/prompts/instructions.md"

# The one substitution load_instructions() makes in the worker.
PLACEHOLDER = "{agent_name}"


def _warnings(content: str, *, exists: bool) -> list[str]:
    """Notes about the file the worker is reading right now.

    A prompt is prose, and the worker substitutes with str.replace rather than
    str.format, so a file with no placeholder is legal and a file full of JSON
    braces still loads. Nothing here is a rule; every line describes a state
    somebody may not have meant to leave the file in.
    """
    if not exists:
        # The placeholder note below would be a lie here: there is no file, so
        # the worker is running the packaged default, which does have one.
        return [
            f"No prompt file at {DISPLAY_PATH} yet, so the agent is running the "
            "packaged default from agent/src/prompts/instructions.py. Create "
            "the file to change what it says."
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
        # An empty file still loads, so the packaged default does NOT come
        # back: the agent runs with no output rules and no guardrails at all.
        return [
            f"{DISPLAY_PATH} is empty, so calls run with no instructions at "
            "all. An empty file still loads, so the packaged default does not "
            "come back."
        ]
    if PLACEHOLDER not in content:
        return [
            f"This prompt has no {PLACEHOLDER}, so the agent's name never "
            "appears in what it is told. That is allowed."
        ]
    return []


class AgentPromptService:
    """Reads the one file that decides what the agent says."""

    def __init__(self, config: Config) -> None:
        self._config = config
        # Resolved once. Every message this service produces names an absolute
        # path, because "could not read instructions.md" tells someone with a
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
                    f"{DISPLAY_PATH} is not valid UTF-8, so neither this "
                    "console nor the agent can read it. Re-save it as UTF-8."
                ],
                derive_warnings=False,
            )
        except OSError:
            # Missing is a normal state, not a failure. A clone that has not
            # been edited yet has no file and the worker falls back to its
            # packaged default, so the console must get an empty panel and the
            # flag that lets it say so, never a 404.
            logger.info("no prompt file at %s, reporting it as absent", self._path)
            return self._describe("", exists=False)
        return self._describe(content, exists=True)

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
        return AgentPromptRead(
            slug=self._config.AGENT_NAME,
            path=DISPLAY_PATH,
            content=content,
            exists=exists,
            byte_size=len(content.encode("utf-8")),
            warnings=(extra_warnings or [])
            + (_warnings(content, exists=exists) if derive_warnings else []),
        )
