import logging
from functools import lru_cache

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv(override=False)

logger = logging.getLogger(__name__)


class Config(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", case_sensitive=True)

    # Identity. AGENT_NAME is also the dispatch name the frontend must request.
    AGENT_NAME: str = "assistant"
    ENV: str = "dev"
    PROJECT_NAME: str = "Voice Agent"

    BACKEND_API_URL: str | None = None
    BACKEND_API_TOKEN: str | None = None
    LIVEKIT_SYNC_INTERVAL_SECONDS: float = 15.0

    # Optional error tracking.
    SENTRY_DSN: str | None = None


@lru_cache
def get_config() -> Config:
    return Config()


config = get_config()
