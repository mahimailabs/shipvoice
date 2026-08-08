"""GET /api/v1/agents, and the guard that keeps it honest.

The provider strings this endpoint reports are compiled into the worker, not
configured, so the backend cannot observe them. It declares them instead, and
the drift test below reads the worker's source and fails if they stop matching.
Without it, the console would keep confidently reporting a model the agent
stopped using.
"""

import pathlib

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.api.endpoints.agents import (
    DECLARED_IN,
    DECLARED_LLM,
    DECLARED_STT,
    DECLARED_TTS,
    PROMPT_PATH,
)
from src.api.endpoints.agents import (
    router as agents_router,
)
from src.core.config import Config
from src.core.container import Container

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]


def _build_app():
    cfg = Config(
        ENV="dev",
        _env_file=None,
        AGENT_NAME="assistant",
        BUSINESS_NAME="Test Business",
    )
    container = Container()
    container.config.override(cfg)
    container.wire(modules=["src.api.endpoints.agents"])

    app = FastAPI()
    app.include_router(agents_router, prefix="/api/v1")
    # Bypass the JWT decode; this suite is about the endpoint and its gate.
    return app, container


async def _get_agents(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get("/api/v1/agents")


@pytest.mark.asyncio
async def test_lists_the_single_configured_agent():
    app, container = _build_app()
    try:
        resp = await _get_agents(app)
        assert resp.status_code == 200
        agents = resp.json()["agents"]
        # Free runs one worker serving one agent. Several agents is Pro.
        assert len(agents) == 1
        assert agents[0]["agent_name"] == "assistant"
        assert agents[0]["active"] is True
        assert agents[0]["declared_in"] == DECLARED_IN
    finally:
        container.unwire()


@pytest.mark.asyncio
async def test_listing_agents_needs_no_account():
    """The console has no sign-in, so this route must stay open.

    It exposes the agent name and the provider names, both already published in
    this repo's source and README. If you gate it, gate the console too or the
    Agents page goes blank with a 403 nobody can act on.
    """
    app, container = _build_app()
    try:
        resp = await _get_agents(app)
        assert resp.status_code == 200
    finally:
        container.unwire()


def test_no_cost_field_leaks_into_the_agent_schema():
    """Free reports what an agent is, never what it costs."""
    from src.schemas.agents_schemas import AgentSummary

    banned = {"cost", "cost_usd", "billed", "billed_usd", "kept", "kept_usd", "margin"}
    assert banned.isdisjoint(AgentSummary.model_fields.keys())


@pytest.mark.skipif(
    not (REPO_ROOT / "agent" / "src" / "agent.py").exists(),
    reason="agent source not present (backend deployed on its own)",
)
def test_declared_providers_still_match_the_worker():
    """Drift guard. The console must not report a model the agent stopped using."""
    source = (REPO_ROOT / "agent" / "src" / "agent.py").read_text()

    assert 'deepgram.STT(model="nova-3")' in source, (
        f"agent.py changed its STT; {DECLARED_STT!r} in agents.py is now a lie"
    )
    assert 'openai.LLM(model="gpt-4.1-mini")' in source, (
        f"agent.py changed its LLM; {DECLARED_LLM!r} in agents.py is now a lie"
    )
    # Cartesia is constructed with no model argument, so the plugin default
    # applies and naming one would be a guess. If a model is pinned later,
    # this fails and the declared string has to be updated to match.
    assert "cartesia.TTS()" in source, (
        f"agent.py pinned a Cartesia model; {DECLARED_TTS!r} is now wrong"
    )


@pytest.mark.skipif(
    not (REPO_ROOT / "agent").exists(),
    reason="agent source not present (backend deployed on its own)",
)
def test_the_prompt_path_points_at_a_file_that_exists():
    """The console tells the buyer where to edit their agent's prompt.

    This shipped once pointing at a path that did not exist, which sends
    someone to create a file the worker never reads.
    """
    assert (REPO_ROOT / PROMPT_PATH).exists(), (
        f"agents.py advertises {PROMPT_PATH!r} and nothing is there"
    )
