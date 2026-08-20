"""The persona file as a read, and the file path the console shows instead.

Every test points AGENT_PROMPT_FILE at tmp_path. The real file is what the
worker speaks from, and a suite that touched it would change the agent.

There are no write tests here because there is no write. The buyer edits
agent/prompts/instructions.md, the worker re-reads it on the next job, and git
is the version history. What this suite pins is that the console can read that
file in every state a hand-edited file turns up in, and can say where it is.
"""

from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.api.endpoints.agents import router as agents_router
from src.core.config import Config
from src.core.container import Container
from src.services.agent_prompt_service import DISPLAY_PATH

ORIGINAL = "You are {agent_name}, a friendly voice assistant.\n"


def _build_app(prompt_file: Path):
    cfg = Config(
        ENV="dev",
        _env_file=None,
        AGENT_NAME="assistant",
        AGENT_PROMPT_FILE=prompt_file,
    )
    container = Container()
    container.config.override(cfg)
    container.wire(modules=["src.api.endpoints.agents"])

    app = FastAPI()
    app.include_router(agents_router, prefix="/api/v1")
    return app, container


async def _client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.fixture
def prompt_file(tmp_path: Path) -> Path:
    path = tmp_path / "instructions.md"
    path.write_text(ORIGINAL, encoding="utf-8")
    return path


@pytest.mark.asyncio
async def test_read_serves_the_file_on_disk(prompt_file: Path):
    app, container = _build_app(prompt_file)
    try:
        async with await _client(app) as c:
            resp = await c.get("/api/v1/agents/assistant/prompt")
        assert resp.status_code == 200
        body = resp.json()
        assert body["content"] == ORIGINAL
        assert body["exists"] is True
        assert body["byte_size"] == len(ORIGINAL.encode("utf-8"))
        assert body["warnings"] == []
        # The display path, not this machine's tmp_path. The console prints it,
        # and it is the whole answer to "how do I change what the agent says".
        assert body["path"] == DISPLAY_PATH
        assert body["slug"] == "assistant"
    finally:
        container.unwire()


@pytest.mark.asyncio
async def test_reading_the_prompt_leaves_the_file_exactly_as_it_was(prompt_file: Path):
    """The console never writes, and this is that rule at the file layer.

    A read that rewrote the file (to normalise it, say) would put the console
    back in the business of owning the prompt, and would show up as a diff
    against text nobody typed.
    """
    before = prompt_file.stat().st_mtime_ns
    app, container = _build_app(prompt_file)
    try:
        async with await _client(app) as c:
            await c.get("/api/v1/agents/assistant/prompt")
            await c.get("/api/v1/agents/assistant/prompt")
        assert prompt_file.read_text(encoding="utf-8") == ORIGINAL
        assert prompt_file.stat().st_mtime_ns == before
        # And nothing was created beside it either.
        assert list(prompt_file.parent.iterdir()) == [prompt_file]
    finally:
        container.unwire()


@pytest.mark.asyncio
async def test_a_missing_prompt_file_reads_as_empty_not_as_404(tmp_path: Path):
    """A clone that has never been edited has no file, and that is normal.

    404 here would send the console to an error state for the exact case it
    exists to explain: the worker is running its packaged default, and the
    page should say so and name the file to create.
    """
    app, container = _build_app(tmp_path / "instructions.md")
    try:
        async with await _client(app) as c:
            resp = await c.get("/api/v1/agents/assistant/prompt")
        assert resp.status_code == 200
        body = resp.json()
        assert body["exists"] is False
        assert body["content"] == ""
        assert body["byte_size"] == 0
        assert any("packaged default" in w for w in body["warnings"])
    finally:
        container.unwire()


@pytest.mark.asyncio
async def test_an_unknown_slug_is_404(prompt_file: Path):
    app, container = _build_app(prompt_file)
    try:
        async with await _client(app) as c:
            resp = await c.get("/api/v1/agents/receptionist/prompt")
        assert resp.status_code == 404
        # The reader gets told what this deployment does run, not just that
        # their guess was wrong.
        assert "assistant" in resp.json()["detail"]
    finally:
        container.unwire()


@pytest.mark.asyncio
async def test_a_prompt_without_the_placeholder_is_reported_not_refused(
    prompt_file: Path,
):
    """load_instructions uses str.replace, so a prompt with no placeholder runs.

    Calling it an error would be inventing a rule the worker does not have.
    """
    prompt_file.write_text(
        "You are a friendly voice assistant. Keep it short.\n", encoding="utf-8"
    )
    app, container = _build_app(prompt_file)
    try:
        async with await _client(app) as c:
            resp = await c.get("/api/v1/agents/assistant/prompt")
        assert resp.status_code == 200
        assert any("{agent_name}" in w for w in resp.json()["warnings"])
    finally:
        container.unwire()


async def test_an_empty_prompt_says_the_agent_has_no_instructions(prompt_file: Path):
    """An empty file still loads, so the packaged default does NOT come back."""
    prompt_file.write_text("   ", encoding="utf-8")
    app, container = _build_app(prompt_file)
    try:
        async with await _client(app) as client:
            response = await client.get("/api/v1/agents/assistant/prompt")
        assert response.status_code == 200
        assert any("no instructions at all" in w for w in response.json()["warnings"])
    finally:
        container.unwire()


async def test_a_prompt_file_that_is_not_utf8_explains_itself_instead_of_500ing(
    prompt_file: Path,
):
    """PowerShell's '>' writes UTF-16LE, and this file is meant to be hand-edited.

    The worker cannot read it either, so every call is already failing. This
    endpoint is the one surface that exists to explain the file's state.
    """
    # With the BOM, which is what PowerShell actually writes. 0xff is not legal
    # UTF-8, so the decode raises.
    prompt_file.write_bytes("You are {agent_name}.".encode("utf-16"))
    app, container = _build_app(prompt_file)
    try:
        async with await _client(app) as client:
            response = await client.get("/api/v1/agents/assistant/prompt")

        assert response.status_code == 200
        body = response.json()
        assert body["exists"] is True
        assert body["content"] == ""
        assert any("not valid UTF-8" in w for w in body["warnings"])
        # The empty-file note would be a second, contradictory diagnosis: the
        # file is not empty, it is unreadable.
        assert not any("is empty" in w for w in body["warnings"])
    finally:
        container.unwire()


async def test_utf16_without_a_bom_is_caught_by_its_nul_bytes(prompt_file: Path):
    """The sibling case, and the sneakier one.

    Pure ASCII as UTF-16LE carries no BOM and every NUL is legal UTF-8, so this
    decodes without raising and only the content gives it away.
    """
    prompt_file.write_bytes("You are {agent_name}.".encode("utf-16-le"))
    app, container = _build_app(prompt_file)
    try:
        async with await _client(app) as client:
            response = await client.get("/api/v1/agents/assistant/prompt")

        assert response.status_code == 200
        assert any("NUL bytes" in w for w in response.json()["warnings"])
    finally:
        container.unwire()


def test_the_default_prompt_file_points_at_the_file_the_worker_reads():
    """Running the backend by hand must find the persona with no env set.

    The default is derived from this package's location, so a change to the repo
    layout that moves one of them without the other is caught here rather than
    by a console naming a file nothing speaks from.
    """
    cfg = Config(ENV="dev", _env_file=None)
    repo_root = Path(__file__).resolve().parents[3]
    assert cfg.AGENT_PROMPT_FILE == repo_root / DISPLAY_PATH


@pytest.mark.skipif(
    not (Path(__file__).resolve().parents[3] / "agent").exists(),
    reason="agent source not present (backend deployed on its own)",
)
def test_the_worker_reads_the_prompt_on_every_job():
    """An edit reaches the next call without a restart, so it is asserted.

    Assistant() is built inside the per-job entrypoint and its constructor calls
    load_instructions(), which reads the file. Cache the text at import time in
    either place and editing the file stops reaching calls until the worker is
    restarted, silently.
    """
    agent_src = Path(__file__).resolve().parents[3] / "agent" / "src"
    loader = (agent_src / "prompts" / "instructions.py").read_text()
    assistant = (agent_src / "agents" / "assistant.py").read_text()

    assert "PROMPT_PATH.read_text(" in loader, (
        "load_instructions no longer reads the file on each call, so editing "
        "the prompt would need a worker restart"
    )
    assert "load_instructions(" in assistant, (
        "Assistant no longer loads the prompt in __init__, so a per-job build "
        "would not pick up an edit"
    )


def test_every_read_field_is_required():
    """The console renders one panel from one response.

    An optional field would let a partial response render half a UI with no way
    to tell "not set" from "not sent".
    """
    from src.schemas.agents_schemas import AgentPromptRead

    assert all(f.is_required() for f in AgentPromptRead.model_fields.values())
