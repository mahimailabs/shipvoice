import logging
from functools import lru_cache
from urllib.parse import parse_qsl, quote_plus, urlencode, urlsplit, urlunsplit

from dotenv import load_dotenv
from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from src.core.enums import EnvironmentOption

load_dotenv(override=False)


logger = logging.getLogger(__name__)

# libpq query params that asyncpg.connect() does not accept as kwargs.
# TLS is instead enabled via connect_args (see Config.SQLALCHEMY_CONNECT_ARGS).
_LIBPQ_ONLY_PARAMS = {"sslmode", "channel_binding"}
_SSL_DISABLED = {"disable", "false", "0", "no", "off"}
_SSL_OPTIONAL = {"allow", "prefer"}


def _to_async_url(url: str) -> str:
    """
    Coerce a Postgres URL to the asyncpg driver and drop libpq-only query
    params (sslmode, channel_binding) that asyncpg rejects.
    """
    parts = urlsplit(url)
    base_scheme = parts.scheme.split("+", 1)[0]
    scheme = (
        "postgresql+asyncpg"
        if base_scheme in {"postgres", "postgresql"}
        else parts.scheme
    )
    query = [
        (k, v) for k, v in parse_qsl(parts.query) if k.lower() not in _LIBPQ_ONLY_PARAMS
    ]
    return urlunsplit(
        (scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
    )


def _url_requires_ssl(url: str) -> bool | None:
    """Infer TLS requirement from a URL's sslmode/ssl query param.

    Returns True (require/verify-*), False (disable), or None (unspecified or
    optional modes like allow/prefer).
    """
    params = {k.lower(): v.lower() for k, v in parse_qsl(urlsplit(url).query)}
    mode = params.get("sslmode") or params.get("ssl")
    if mode is None:
        return None
    if mode in _SSL_DISABLED:
        return False
    if mode in _SSL_OPTIONAL:
        return None
    return True


class Config(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    # Dev by default. It used to be PROD, which meant trimming .env silently
    # promoted the backend to production and 403'd the console's own LiveKit
    # editor with no hint that ENV was the cause.
    ENV: EnvironmentOption = EnvironmentOption.DEV
    DEBUG: bool | None = None

    API: str = "/api"
    API_V1_STR: str = "/api/v1"
    API_STR: str = "/api"

    PROJECT_NAME: str = "ShipVoice"

    # The agent's dispatch identity. Must equal the worker's AGENT_NAME and the
    # frontend's VITE_AGENT_NAME exactly, or LiveKit never dispatches the
    # worker into the room and the call sits in "connecting" with no error.
    AGENT_NAME: str = "assistant"
    BUSINESS_NAME: str | None = None

    # Shared with the voice worker. It guards the one endpoint that serves the
    # LiveKit secret, so an empty value disables that endpoint rather than
    # opening it.
    AGENT_SERVICE_TOKEN: str = ""

    # CORS: comma-separated origins. Empty means allow all ("*").
    CORS_ORIGINS_STR: str | None = ""

    # Database
    DATABASE_URL: str | None = None
    # Defaults match the compose 'db' service, so a fresh clone needs none of
    # these in its .env. Override them for anything that is not compose.
    DB_USER: str | None = "postgres"
    DB_HOST: str | None = "db"
    DB_PORT: int | None = 5432
    DB_NAME: str | None = "app"
    DB_PASSWORD: SecretStr | None = SecretStr("postgres")
    DB_SSL: str | None = "disable"
    DB_FORCE_ROLL_BACK: bool = False

    @model_validator(mode="after")
    def set_debug_default(self):
        if self.DEBUG is None:
            self.DEBUG = self.ENV == EnvironmentOption.DEV
        return self

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        if self.DATABASE_URL:
            return _to_async_url(self.DATABASE_URL)

        if not all(
            [self.DB_USER, self.DB_HOST, self.DB_PORT, self.DB_NAME, self.DB_PASSWORD]
        ):
            raise ValueError(
                "Either DATABASE_URL or all DB_* fields (DB_USER, DB_HOST, DB_PORT, DB_NAME, DB_PASSWORD) must be set"
            )

        db_password = quote_plus(self.DB_PASSWORD.get_secret_value())
        return (
            f"postgresql+asyncpg://{quote_plus(self.DB_USER)}:{db_password}@"
            f"{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    @property
    def SQLALCHEMY_CONNECT_ARGS(self) -> dict[str, object]:
        # statement_cache_size=0 keeps asyncpg compatible with transaction
        # poolers (pgbouncer / Neon / Supabase pooler).
        args: dict[str, object] = {"statement_cache_size": 0}

        ssl_required: bool | None = None
        if self.DB_SSL:
            ssl_required = self.DB_SSL.strip().lower() not in _SSL_DISABLED
        elif self.DATABASE_URL:
            ssl_required = _url_requires_ssl(self.DATABASE_URL)

        if ssl_required is True:
            args["ssl"] = True
        elif ssl_required is False:
            args["ssl"] = False

        return args

    @property
    def BACKEND_CORS_ORIGINS(self) -> list[str]:
        # Derived at runtime from the resolved CORS_ORIGINS_STR (not at class
        # definition time). Empty/unset means allow all.
        origins = [
            o.strip() for o in (self.CORS_ORIGINS_STR or "").split(",") if o.strip()
        ]
        return origins or ["*"]

    # ---- LiveKit (room token minting) -------------------------------------
    # Required by POST /api/v1/token. The backend signs room tokens with the
    # same key/secret the agent worker uses, so they MUST match the agent's.
    LIVEKIT_URL: str | None = None
    LIVEKIT_API_KEY: str | None = None
    LIVEKIT_API_SECRET: SecretStr | None = None

    # find query
    PAGE: int = 1
    PAGE_SIZE: int = 10
    ORDERING: str = "-id"


@lru_cache
def get_config() -> Config:
    return Config()


config = get_config()
