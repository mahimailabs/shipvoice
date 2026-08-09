import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from sqlalchemy import text

from src.core.logging_conf import configure_logging

logger = logging.getLogger(__name__)

# Arbitrary but stable: every worker process must pick the same number for the
# advisory lock to mean anything.
_STARTUP_LOCK_KEY = 8_675_309


def _upgrade_to_head() -> None:
    """Bring the schema up to head. Blocking, so callers run it in a thread."""
    from alembic import command
    from alembic.config import Config as AlembicConfig

    ini = Path(__file__).resolve().parents[2] / "alembic.ini"
    # migrations/env.py reads the URL from the app config itself, so there is
    # nothing to pass here.
    command.upgrade(AlembicConfig(str(ini)), "head")


async def _prepare_database(container) -> None:
    """Migrate, then seed the LiveKit project, under one lock.

    Gunicorn runs several workers and each one executes this. Alembic is not
    safe to run concurrently against one database, and the seed's
    check-then-insert is not atomic either, which is how a single-row table
    ended up with two rows. A Postgres advisory lock serialises both: the first
    worker does the work, the rest find it done.

    Nothing in here is allowed to stop the app booting. A backend that refuses
    to start because Postgres is slow is worse than one that serves tokens from
    the environment until the database catches up.
    """
    database = container.database()

    async with database.session() as session:
        await session.execute(
            text("SELECT pg_advisory_lock(:k)"), {"k": _STARTUP_LOCK_KEY}
        )
        try:
            await asyncio.to_thread(_upgrade_to_head)
            logger.info("Schema is at head")
            await container.livekit_settings_service().seed_from_env()
        finally:
            await session.execute(
                text("SELECT pg_advisory_unlock(:k)"), {"k": _STARTUP_LOCK_KEY}
            )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging()

    if hasattr(app.state, "container"):
        app.state.container.init_resources()
        logger.info("Container resources initialized")

        try:
            await _prepare_database(app.state.container)
        except Exception:
            # The service layer falls back to the environment for LiveKit
            # credentials when it cannot read the table, so the voice path
            # still works from here.
            logger.warning(
                "Could not prepare the database. The API will run on the "
                "environment; run 'alembic upgrade head' once Postgres is up.",
                exc_info=True,
            )

    logger.info("Startup event completed")

    yield

    if hasattr(app.state, "container"):
        app.state.container.shutdown_resources()
        logger.info("Container resources shutdown")

    logger.info("Shutdown event completed")
