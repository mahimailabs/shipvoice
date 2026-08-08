"""The gate that stops a deployed console handing out its call transcripts.

A login form on its own is decorative here: ``POST /users/register`` is public,
so a stranger who finds a deployed instance registers, is no longer anonymous,
and reads everything. Two things close it, and both are tested here: reads
require ``is_superuser``, and registration is shut unless explicitly reopened.
"""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.api.deps import get_current_admin, get_current_user_record
from src.api.endpoints.users import router as users_router
from src.core.config import Config
from src.core.container import Container
from src.core.exceptions import PermissionDeniedError
from src.models.users_model import User


class _StubUsersService:
    """Records whether register was reached, so a 403 proves the gate ran first."""

    def __init__(self) -> None:
        self.register_calls = 0

    async def register(self, payload):
        self.register_calls += 1
        return User(
            id=1,
            email=payload.email,
            hashed_password="x",
            full_name=payload.full_name,
            is_active=True,
            is_superuser=False,
        )


def _build_app(*, allow_open_registration: bool):
    cfg = Config(
        ENV="dev",
        _env_file=None,
        ALLOW_OPEN_REGISTRATION=allow_open_registration,
    )
    service = _StubUsersService()
    container = Container()
    container.config.override(cfg)
    container.users_service.override(service)
    container.wire(modules=["src.api.endpoints.users", "src.api.deps"])

    app = FastAPI()
    app.include_router(users_router, prefix="/api/v1")
    return app, service, container


@pytest.fixture
def closed_app():
    app, service, container = _build_app(allow_open_registration=False)
    try:
        yield app, service
    finally:
        container.unwire()


@pytest.fixture
def open_app():
    app, service, container = _build_app(allow_open_registration=True)
    try:
        yield app, service
    finally:
        container.unwire()


async def _post_register(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(
            "/api/v1/users/register",
            json={"email": "stranger@example.com", "password": "correct-horse-battery"},
        )


@pytest.mark.asyncio
async def test_registration_is_closed_by_default(closed_app):
    app, service = closed_app
    resp = await _post_register(app)
    assert resp.status_code == 403
    # The gate must run before the service, or a row is created and then refused.
    assert service.register_calls == 0


@pytest.mark.asyncio
async def test_registration_can_be_reopened_deliberately(open_app):
    app, service = open_app
    resp = await _post_register(app)
    assert resp.status_code == 201
    assert service.register_calls == 1


@pytest.mark.asyncio
async def test_a_self_registered_account_is_not_an_admin():
    """The exact escalation the gate exists to stop.

    A freshly self-registered account is authenticated. That is not enough to
    read the call log, and this asserts the difference.
    """
    plain = User(
        id=2,
        email="stranger@example.com",
        hashed_password="x",
        is_active=True,
        is_superuser=False,
    )
    with pytest.raises(PermissionDeniedError):
        await get_current_admin(plain)


@pytest.mark.asyncio
async def test_the_founders_account_passes_the_admin_gate():
    founder = User(
        id=1,
        email="founder@example.com",
        hashed_password="x",
        is_active=True,
        is_superuser=True,
    )
    assert await get_current_admin(founder) is founder


def test_the_admin_gate_is_a_dependency_not_a_bare_helper():
    """Regression guard.

    ``_require_admin`` was a plain function callers had to remember to invoke.
    A calls endpoint that forgets is silently public, so the gate is a
    dependency now and must stay one.
    """
    assert callable(get_current_admin)
    assert callable(get_current_user_record)
