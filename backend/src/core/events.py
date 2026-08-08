import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.core.logging_conf import configure_logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging()

    # Initialize container resources
    if hasattr(app.state, "container"):
        app.state.container.init_resources()
        logger.info("Container resources initialized")

        # Seed the LiveKit project from the environment, once, on a database
        # that has never had a row. This is what makes .env the way you
        # bootstrap a fresh clone and the database the source of truth after.
        # A database that is not up yet must not stop the app booting: token
        # minting falls back to the environment until it is.
        try:
            await app.state.container.livekit_settings_service().seed_from_env()
        except Exception:
            logger.warning(
                "Could not seed LiveKit settings, continuing on the environment",
                exc_info=True,
            )

    logger.info("Startup event completed")

    yield

    # Shutdown container resources
    if hasattr(app.state, "container"):
        app.state.container.shutdown_resources()
        logger.info("Container resources shutdown")

    logger.info("Shutdown event completed")
