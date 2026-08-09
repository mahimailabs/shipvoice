"""GET /api/v1/agents, and the guard that keeps it honest."""

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


def _build_app(pattern: str = "sequential"):
    cfg = Config(
        ENV="dev",
        _env_file=None,
        AGENT_NAME="assistant",
        BUSINESS_NAME="Test Business",
        AGENT_PATTERN=pattern,
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
        assert agents[0]["pattern"] == "sequential"
        assert agents[0]["declared_in"] == DECLARED_IN
    finally:
        container.unwire()


@pytest.mark.asyncio
async def test_the_declared_pattern_is_reported():
    app, container = _build_app(pattern="supervisor")
    try:
        resp = await _get_agents(app)
        assert resp.json()["agents"][0]["pattern"] == "supervisor"
    finally:
        container.unwire()


@pytest.mark.asyncio
async def test_a_pattern_this_repo_cannot_run_never_reaches_the_console():
    """The fallback is only worth having if it survives the whole way out."""
    app, container = _build_app(pattern="swarm")
    try:
        resp = await _get_agents(app)
        assert resp.status_code == 200
        assert resp.json()["agents"][0]["pattern"] == "sequential"
    finally:
        container.unwire()


def test_the_pattern_union_and_the_config_that_feeds_it_agree():
    """Two files state the same closed set, and only this notices a drift.

    Grow AGENT_PATTERNS without growing the Literal and the endpoint raises on
    a value config just swore was legal, which reads as a 500 on the Agents
    page rather than as the config change it is.
    """
    from typing import get_args

    from src.core.config import AGENT_PATTERNS
    from src.schemas.agents_schemas import AgentPattern

    assert set(get_args(AgentPattern)) == set(AGENT_PATTERNS)


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
    assert 'cerebras.LLM(model="gemma-4-31b")' in source, (
        f"agent.py changed its LLM; {DECLARED_LLM!r} in agents.py is now a lie"
    )
    assert 'inworld.TTS(model="inworld-tts-2", voice="Ashley")' in source, (
        f"agent.py changed its TTS; {DECLARED_TTS!r} in agents.py is now wrong"
    )


def test_the_declared_strings_name_the_providers_actually_used():
    """The other half of the guard, and it was missing.

    Asserting that agent.py contains the right constructor says nothing about
    what the console reports. DECLARED_TTS sat on 'cartesia' through a whole
    provider swap while the drift test passed, because the test only ever read
    agent.py. Each declared string must name its own provider.
    """
    for declared, provider in (
        (DECLARED_STT, "deepgram"),
        (DECLARED_LLM, "cerebras"),
        (DECLARED_TTS, "inworld"),
    ):
        assert provider in declared.lower(), (
            f"{declared!r} does not name {provider}, so the console is "
            f"reporting a provider this agent does not use"
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
