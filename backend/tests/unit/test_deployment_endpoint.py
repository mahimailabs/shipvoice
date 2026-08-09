"""GET /api/v1/deployment.

The page it feeds is read-only, so the value of this route is entirely in what
it refuses to say. These tests pin that.
"""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.api.endpoints.deployment import router as deployment_router
from src.core.config import Config
from src.core.container import Container
from src.schemas.deployment_schemas import DeploymentRead

SECRET = "livekit-secret-value-that-must-never-be-served"


def _build_app():
    cfg = Config(
        ENV="dev",
        _env_file=None,
        PROJECT_NAME="ShipVoice",
        LIVEKIT_URL="wss://example.livekit.cloud",
        LIVEKIT_API_KEY="devkey",
        LIVEKIT_API_SECRET=SECRET,
    )
    container = Container()
    container.config.override(cfg)
    container.wire(modules=["src.api.endpoints.deployment"])
    app = FastAPI()
    app.include_router(deployment_router, prefix="/api/v1")
    return app, container


async def _get(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get("/api/v1/deployment")


@pytest.mark.asyncio
async def test_reports_the_project_and_environment():
    app, container = _build_app()
    try:
        resp = await _get(app)
        assert resp.status_code == 200
        body = resp.json()
        assert body["project_name"] == "ShipVoice"
        assert body["env"] == "dev"
    finally:
        container.unwire()


@pytest.mark.asyncio
async def test_serves_no_secret():
    """The whole point of the route. A regression here is a credential leak."""
    app, container = _build_app()
    try:
        raw = (await _get(app)).text
        assert SECRET not in raw
        assert "devkey" not in raw
    finally:
        container.unwire()


def test_the_schema_cannot_grow_a_secret_field():
    banned = {
        "livekit_api_key",
        "livekit_api_secret",
        "database_url",
        "db_password",
    }
    assert banned.isdisjoint(DeploymentRead.model_fields.keys())
