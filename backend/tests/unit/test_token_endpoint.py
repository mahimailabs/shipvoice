import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from livekit.api import TokenVerifier

from src.api.endpoints.token import router as token_router
from src.core.container import Container
from src.services.token_service import TokenService

KEY = "devkey"
SECRET = "devsecret-devsecret-devsecret-1234"
URL = "wss://example.livekit.cloud"


class _FixedSettings:
    """Stands in for the settings service: no database, fixed credentials."""

    def __init__(self, credentials: tuple[str, str, str] | None) -> None:
        self._credentials = credentials

    async def credentials(self) -> tuple[str, str, str] | None:
        return self._credentials


@pytest.fixture
def token_app():
    container = Container()
    container.token_service.override(TokenService(_FixedSettings((URL, KEY, SECRET))))
    container.wire(modules=["src.api.endpoints.token"])

    app = FastAPI()
    app.include_router(token_router, prefix="/api/v1")
    try:
        yield app
    finally:
        container.unwire()


@pytest.fixture
async def client(token_app):
    transport = ASGITransport(app=token_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_post_token_returns_201_with_valid_token(client):
    resp = await client.post(
        "/api/v1/token", json={"room_name": "demo", "participant_identity": "bob"}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["server_url"] == URL
    assert body["participant_token"]

    claims = TokenVerifier(KEY, SECRET).verify(body["participant_token"])
    assert claims.identity == "bob"
    assert claims.video.room == "demo"


@pytest.mark.asyncio
async def test_post_token_empty_body_uses_defaults(client):
    resp = await client.post("/api/v1/token", json={})
    assert resp.status_code == 201
    assert resp.json()["participant_token"]
