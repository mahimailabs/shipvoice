import logging
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.core.config import Config
from src.models.livekit_model import LiveKitSettings
from src.schemas.livekit_schemas import LiveKitRead, LiveKitWrite

logger = logging.getLogger(__name__)


def _hint(api_key: str | None) -> str | None:
    """Last four characters, enough to tell two projects apart."""
    if not api_key:
        return None
    return f"...{api_key[-4:]}" if len(api_key) > 4 else "..."


class LiveKitSettingsService:
    """The LiveKit project, with the database as the source of truth."""

    def __init__(
        self,
        session_factory: Callable[..., AbstractAsyncContextManager[AsyncSession]],
        config: Config,
    ) -> None:
        self._session_factory = session_factory
        self._config = config

    async def _row(self, session: AsyncSession) -> LiveKitSettings | None:
        # col() keeps mypy happy: SQLModel types the attribute as int | None,
        # which order_by does not accept directly.
        result = await session.execute(
            select(LiveKitSettings).order_by(col(LiveKitSettings.id))
        )
        return result.scalars().first()

    async def seed_from_env(self) -> None:
        """Insert the env values once, on a database that has never had a row.

        Never overwrites. Someone who changed the project in the console and
        then restarted must not silently get the old .env back.
        """
        url = self._config.LIVEKIT_URL
        key = self._config.LIVEKIT_API_KEY
        secret = (
            self._config.LIVEKIT_API_SECRET.get_secret_value()
            if self._config.LIVEKIT_API_SECRET
            else None
        )
        if not (url and key and secret):
            logger.info("LiveKit env is incomplete, nothing to seed")
            return

        async with self._session_factory() as session:
            if await self._row(session) is not None:
                return
            session.add(LiveKitSettings(url=url, api_key=key, api_secret=secret))
            await session.commit()
            logger.info("Seeded LiveKit settings from the environment")

    async def credentials(self) -> tuple[str, str, str] | None:
        """(url, key, secret) for signing, or None when unconfigured."""
        async with self._session_factory() as session:
            row = await self._row(session)
        if row:
            return row.url, row.api_key, row.api_secret

        # No row yet: fall back to env so a backend pointed at a database it
        # cannot reach on boot still mints tokens.
        url = self._config.LIVEKIT_URL
        key = self._config.LIVEKIT_API_KEY
        secret = (
            self._config.LIVEKIT_API_SECRET.get_secret_value()
            if self._config.LIVEKIT_API_SECRET
            else None
        )
        return (url, key, secret) if (url and key and secret) else None

    async def revision(self) -> str:
        """Changes whenever the stored project changes.

        Derived from updated_at rather than a counter so it needs no extra
        column and cannot drift from the row it describes.
        """
        async with self._session_factory() as session:
            row = await self._row(session)
        return row.updated_at.isoformat() if row else "environment"

    async def read(self) -> LiveKitRead:
        async with self._session_factory() as session:
            row = await self._row(session)
        if row:
            return LiveKitRead(
                url=row.url,
                api_key_hint=_hint(row.api_key),
                secret_set=bool(row.api_secret),
                source="database",
            )
        return LiveKitRead(
            url=self._config.LIVEKIT_URL,
            api_key_hint=_hint(self._config.LIVEKIT_API_KEY),
            secret_set=self._config.LIVEKIT_API_SECRET is not None,
            source="environment",
        )

    async def write(self, payload: LiveKitWrite) -> LiveKitRead:
        async with self._session_factory() as session:
            row = await self._row(session)
            if row is None:
                if not payload.api_secret:
                    raise ValueError("api_secret is required the first time")
                session.add(
                    LiveKitSettings(
                        url=payload.url,
                        api_key=payload.api_key,
                        api_secret=payload.api_secret,
                    )
                )
            else:
                row.url = payload.url
                row.api_key = payload.api_key
                # Blank means keep. The console cannot read the secret back, so
                # it must be able to change the url or key without resending it.
                if payload.api_secret:
                    row.api_secret = payload.api_secret
                session.add(row)
            await session.commit()
        return await self.read()
