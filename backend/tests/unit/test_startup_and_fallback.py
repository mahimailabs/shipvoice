"""The first boot of a fresh clone.

This is the bug that made goal 1 impossible: the token endpoint answered 500
with a raw UndefinedTableError, because _row raised before the env fallback
below it could run. The fallback existed and was unreachable.
"""

import pytest
from sqlalchemy.exc import ProgrammingError

from src.core.config import Config
from src.services.livekit_settings_service import LiveKitSettingsService

URL = "wss://from-env.livekit.cloud"


def _config() -> Config:
    return Config(
        ENV="dev",
        _env_file=None,
        LIVEKIT_URL=URL,
        LIVEKIT_API_KEY="envkey",
        LIVEKIT_API_SECRET="envsecret",
    )


class _MissingTable:
    """A session factory whose SELECT fails the way an unmigrated database does."""

    def __call__(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def execute(self, *a, **kw):
        raise ProgrammingError("SELECT ...", {}, Exception("relation does not exist"))


class _NoDatabase:
    """A session factory that cannot even connect."""

    def __call__(self):
        raise ProgrammingError("connect", {}, Exception("could not connect"))


@pytest.mark.asyncio
async def test_an_unmigrated_database_still_mints_tokens():
    service = LiveKitSettingsService(_MissingTable(), _config())
    assert await service.credentials() == (URL, "envkey", "envsecret")


@pytest.mark.asyncio
async def test_an_unreachable_database_still_mints_tokens():
    service = LiveKitSettingsService(_NoDatabase(), _config())
    assert await service.credentials() == (URL, "envkey", "envsecret")


@pytest.mark.asyncio
async def test_read_reports_the_environment_as_the_source():
    service = LiveKitSettingsService(_MissingTable(), _config())
    out = await service.read()
    assert out.source == "environment"
    assert out.url == URL


@pytest.mark.asyncio
async def test_revision_does_not_explode_without_a_table():
    service = LiveKitSettingsService(_MissingTable(), _config())
    assert await service.revision() == "environment"


@pytest.mark.asyncio
async def test_no_credentials_anywhere_still_returns_none_not_an_error():
    # Explicit Nones, not just _env_file=None: src/core/config.py calls
    # load_dotenv() at import, so the developer's real .env is already in
    # os.environ and pydantic-settings would read it.
    bare = Config(
        ENV="dev",
        _env_file=None,
        LIVEKIT_URL=None,
        LIVEKIT_API_KEY=None,
        LIVEKIT_API_SECRET=None,
    )
    service = LiveKitSettingsService(_MissingTable(), bare)
    assert await service.credentials() is None
