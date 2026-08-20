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
    BUSINESS_NAME: str | None = None
    ENV: str = "dev"
    PROJECT_NAME: str = "Voice Agent"

    # Where this worker posts its call reports, and the token it posts with.
    # Reporting is the only thing the worker asks the backend for: its LiveKit
    # project comes from LIVEKIT_* in this process's own environment.
    BACKEND_API_URL: str | None = None
    BACKEND_API_TOKEN: str | None = None

    # Whether the worker posts each call's start, its turns and its end to the
    # backend, which is what fills the console's Calls page. Off unless someone
    # says otherwise, off in console mode whatever this says, and off anyway
    # without BACKEND_API_URL and BACKEND_API_TOKEN.
    BACKEND_REPORTING_ENABLED: bool = False

    # Optional error tracking.
    SENTRY_DSN: str | None = None


@lru_cache
def get_config() -> Config:
    return Config()


config = get_config()
