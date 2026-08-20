"""GET /api/v1/livekit.

The console's view of the LiveKit project. It is a mirror of the environment,
so what matters here is that it reads, that it reads the right place, and that
it never says the secret out loud.
"""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.api.endpoints.livekit import router as livekit_router
from src.core.config import Config
from src.core.container import Container
from src.schemas.livekit_schemas import LiveKitRead

SECRET = "livekit-secret-nobody-should-ever-see"
KEY = "APIsomethingkd91"


def _build_app(**overrides):
    # Explicit values, not just _env_file=None: src/core/config.py calls
    # load_dotenv() at import, so a developer's real .env is already in
    # os.environ and pydantic-settings would read it.
    cfg = Config(
        ENV="dev",
        _env_file=None,
        **{
            "LIVEKIT_URL": "wss://example.livekit.cloud",
            "LIVEKIT_API_KEY": KEY,
            "LIVEKIT_API_SECRET": SECRET,
            **overrides,
        },
    )
    container = Container()
    container.config.override(cfg)
    container.wire(modules=["src.api.endpoints.livekit"])
    app = FastAPI()
    app.include_router(livekit_router, prefix="/api/v1")
    return app, container


async def _get(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get("/api/v1/livekit")


@pytest.mark.asyncio
async def test_it_reports_the_project_the_backend_booted_with():
    app, container = _build_app()
    try:
        resp = await _get(app)
        assert resp.status_code == 200
        body = resp.json()
        assert body["url"] == "wss://example.livekit.cloud"
        assert body["api_key_hint"] == "...kd91"
        assert body["secret_set"] is True
    finally:
        container.unwire()


@pytest.mark.asyncio
async def test_it_never_serves_the_secret_or_the_whole_key():
    app, container = _build_app()
    try:
        resp = await _get(app)
        assert SECRET not in resp.text
        assert KEY not in resp.text
        assert "api_secret" not in resp.json()
    finally:
        container.unwire()


@pytest.mark.asyncio
async def test_an_unconfigured_project_reads_as_nulls_not_an_error():
    """A fresh clone has none of this set, and the page must still render."""
    app, container = _build_app(
        LIVEKIT_URL=None, LIVEKIT_API_KEY=None, LIVEKIT_API_SECRET=None
    )
    try:
        resp = await _get(app)
        assert resp.status_code == 200
        assert resp.json() == {
            "url": None,
            "api_key_hint": None,
            "secret_set": False,
        }
    finally:
        container.unwire()


def test_the_read_schema_cannot_grow_a_secret_field():
    assert "api_secret" not in LiveKitRead.model_fields
