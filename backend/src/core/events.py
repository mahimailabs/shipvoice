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
    cfg = AlembicConfig(str(ini))
    # env.py calls fileConfig(), whose disable_existing_loggers default sets
    # disabled=True on every logger that already exists. configure_logging()
    # ran moments ago, so without this the app silences its own logging for the
    # life of the process. migrations/env.py honours this flag.
    cfg.attributes["configure_logger"] = False
    # env.py reads the database URL from the app config, so nothing to pass.
    command.upgrade(cfg, "head")


async def _prepare_database(container) -> None:
    """Bring the schema up to head, once, however many workers boot.

    Gunicorn runs several workers and each one executes this. Alembic is not
    safe to run concurrently against one database, so a Postgres advisory lock
    serialises it: the first worker migrates, the rest find it done.

    The database holds the call log and nothing else. No configuration is
    seeded here, because none of it lives in a table: the LiveKit project comes
    from the environment and the agent's prompt is a file.

    Nothing in here is allowed to stop the app booting. A backend that refuses
    to start because Postgres is slow is worse than one that serves tokens
    until the database catches up.
    """
    database = container.database()

    async with database.session() as session:
        await session.execute(
            text("SELECT pg_advisory_lock(:k)"), {"k": _STARTUP_LOCK_KEY}
        )
        try:
            await asyncio.to_thread(_upgrade_to_head)
            logger.info("Schema is at head")
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
            # The voice path does not read the database at all: room tokens are
            # signed from the environment, so a call still connects from here.
            # Only the call log is unavailable until the schema lands.
            logger.warning(
                "Could not prepare the database. The call log will be "
                "unavailable; run 'alembic upgrade head' once Postgres is up.",
                exc_info=True,
            )

    logger.info("Startup event completed")

    yield

    if hasattr(app.state, "container"):
        app.state.container.shutdown_resources()
        logger.info("Container resources shutdown")

    logger.info("Shutdown event completed")
