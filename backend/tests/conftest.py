import os

os.environ.setdefault("ENV", "dev")

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from src.api.endpoints.health import router as health_router  # noqa: E402


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
