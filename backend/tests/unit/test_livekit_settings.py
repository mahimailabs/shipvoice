"""The LiveKit project resource."""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.api.endpoints.livekit import router as livekit_router
from src.core.config import Config
from src.core.container import Container
from src.schemas.livekit_schemas import LiveKitRead, LiveKitWrite

SECRET = "livekit-secret-nobody-should-ever-see"


class _FakeService:
    """Stands in for the settings service so these tests need no database."""

    def __init__(self) -> None:
        self.written: LiveKitWrite | None = None

    async def read(self) -> LiveKitRead:
        return LiveKitRead(
            url="wss://example.livekit.cloud",
            api_key_hint="...kd91",
            secret_set=True,
            source="database",
            worker_follows=True,
        )

    async def write(self, payload: LiveKitWrite) -> LiveKitRead:
        self.written = payload
        return await self.read()


def _build_app(env: str = "dev", *, writes: bool = True):
    cfg = Config(ENV=env, _env_file=None, CONSOLE_WRITES_ENABLED=writes)
    service = _FakeService()
    container = Container()
    container.config.override(cfg)
    container.livekit_settings_service.override(service)
    container.wire(modules=["src.api.endpoints.livekit"])
    app = FastAPI()
    app.include_router(livekit_router, prefix="/api/v1")
    return app, service, container


async def _client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_read_never_serves_the_secret_or_the_whole_key():
    app, _, container = _build_app()
    try:
        async with await _client(app) as c:
            resp = await c.get("/api/v1/livekit")
        assert resp.status_code == 200
        body = resp.json()
        assert body["secret_set"] is True
        assert "api_secret" not in body
        assert body["api_key_hint"] == "...kd91"
        assert SECRET not in resp.text
    finally:
        container.unwire()


@pytest.mark.asyncio
async def test_write_is_accepted_in_dev():
    app, service, container = _build_app("dev")
    try:
        async with await _client(app) as c:
            resp = await c.put(
                "/api/v1/livekit",
                json={
                    "url": "wss://new.livekit.cloud",
                    "api_key": "APInew",
                    "api_secret": SECRET,
                },
            )
        assert resp.status_code == 200
        assert service.written is not None
        assert service.written.url == "wss://new.livekit.cloud"
    finally:
        container.unwire()


@pytest.mark.asyncio
async def test_write_is_refused_unless_explicitly_enabled():
    """No auth means an open write would let anyone repoint the calls.

    This used to be gated on ENV != dev, which meant changing ENV's default for
    console ergonomics silently flipped an authorization decision from refuse
    to allow.
    """
    app, service, container = _build_app(writes=False)
    try:
        async with await _client(app) as c:
            resp = await c.put(
                "/api/v1/livekit",
                json={
                    "url": "wss://evil.livekit.cloud",
                    "api_key": "x",
                    "api_secret": "y",
                },
            )
        assert resp.status_code == 403
        assert service.written is None
    finally:
        container.unwire()


@pytest.mark.asyncio
async def test_a_url_that_is_not_a_websocket_is_rejected():
    app, _, container = _build_app()
    try:
        async with await _client(app) as c:
            resp = await c.put(
                "/api/v1/livekit",
                json={"url": "https://example.com", "api_key": "x", "api_secret": "y"},
            )
        assert resp.status_code == 422
    finally:
        container.unwire()


@pytest.mark.asyncio
async def test_the_write_gate_does_not_follow_env():
    """Regression guard: ENV must not decide who may rewrite the project."""
    app, service, container = _build_app("prod", writes=True)
    try:
        async with await _client(app) as c:
            resp = await c.put(
                "/api/v1/livekit",
                json={
                    "url": "wss://ok.livekit.cloud",
                    "api_key": "k",
                    "api_secret": "s",
                },
            )
        assert resp.status_code == 200, (
            "ENV=prod must not block an explicitly enabled write"
        )
    finally:
        container.unwire()


def test_the_read_schema_cannot_grow_a_secret_field():
    assert "api_secret" not in LiveKitRead.model_fields
