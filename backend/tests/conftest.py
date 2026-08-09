import os

os.environ.setdefault("ENV", "dev")

from collections.abc import AsyncIterator  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlmodel import SQLModel  # noqa: E402

import src.models  # noqa: E402,F401  (registers every table on the metadata)
from src.api.endpoints.health import router as health_router  # noqa: E402
from src.repository.calls_repository import CallsRepository  # noqa: E402
from src.services.calls_service import CallsService  # noqa: E402


@pytest.fixture
def test_app():
    """Create a lightweight FastAPI app for testing (no DI, no DB)."""
    app = FastAPI()
    app.include_router(health_router)
    return app


@pytest.fixture
async def async_client(test_app):
    """Create an async test client."""
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
async def calls_service() -> AsyncIterator[CallsService]:
    """The real service on a private in-memory database.

    sqlite rather than a fake session on purpose. What is worth testing in this
    slice is a unique constraint, a counter increment, and an ordered page, and
    a fake session would only prove the fake behaves like the fake.
    """
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    @asynccontextmanager
    async def session_factory() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    yield CallsService(CallsRepository(session_factory))
    await engine.dispose()
