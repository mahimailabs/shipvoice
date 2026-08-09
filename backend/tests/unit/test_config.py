import logging

from src.core.config import (
    Config,
    _to_async_url,
    _url_requires_ssl,
)


def test_neon_url_coerced_to_asyncpg_and_libpq_params_stripped():
    url = "postgresql://u:p@ep-x.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
    assert _to_async_url(url) == "postgresql+asyncpg://u:p@ep-x.aws.neon.tech/neondb"


def test_postgres_scheme_alias_coerced():
    assert (
        _to_async_url("postgres://u:p@h:5432/db")
        == "postgresql+asyncpg://u:p@h:5432/db"
    )


def test_existing_asyncpg_url_preserved():
    url = "postgresql+asyncpg://u:p@h:5432/db"
    assert _to_async_url(url) == url


def test_non_ssl_query_params_are_kept():
    out = _to_async_url("postgresql://u:p@h/db?application_name=app&sslmode=require")
    assert "application_name=app" in out
    assert "sslmode" not in out


def test_ssl_requirement_inference():
    assert _url_requires_ssl("postgresql://u:p@h/db?sslmode=require") is True
    assert _url_requires_ssl("postgresql://u:p@h/db?sslmode=verify-full") is True
    assert _url_requires_ssl("postgresql://u:p@h/db?sslmode=disable") is False
    assert _url_requires_ssl("postgresql://u:p@h/db?sslmode=prefer") is None
    assert _url_requires_ssl("postgresql://u:p@h/db") is None


def test_prod_accepts_strong_jwt_secret():
    cfg = Config(ENV="prod", JWT_SECRET_KEY="x" * 40)
    assert cfg.ENV.value == "prod"


def test_the_declared_pattern_defaults_to_the_one_this_repo_runs():
    assert Config(ENV="dev", _env_file=None).AGENT_PATTERN == "sequential"


def test_a_pattern_this_repo_supports_is_kept():
    assert (
        Config(ENV="dev", _env_file=None, AGENT_PATTERN="supervisor").AGENT_PATTERN
        == "supervisor"
    )
    # Case and a stray space are the same answer, not a third pattern.
    assert (
        Config(ENV="dev", _env_file=None, AGENT_PATTERN=" Supervisor ").AGENT_PATTERN
        == "supervisor"
    )


def test_an_unknown_pattern_falls_back_instead_of_reaching_the_console(caplog):
    """Two values are legal here because two are implemented.

    Echoing a third through would print a pattern on the Agents page that
    nothing in this repo runs, so a misspelt env var would read as a feature.
    It falls back, and it says so rather than falling back in silence.
    """
    with caplog.at_level(logging.WARNING, logger="src.core.config"):
        cfg = Config(ENV="dev", _env_file=None, AGENT_PATTERN="swarm")

    assert cfg.AGENT_PATTERN == "sequential"
    assert "swarm" in caplog.text


def test_cors_origins_default_to_wildcard():
    cfg = Config(ENV="dev", _env_file=None, CORS_ORIGINS_STR="")
    assert cfg.BACKEND_CORS_ORIGINS == ["*"]


def test_cors_origins_parsed_from_env_value():
    # Regression: BACKEND_CORS_ORIGINS must reflect the resolved CORS_ORIGINS_STR,
    # not the empty class default.
    cfg = Config(
        ENV="dev",
        _env_file=None,
        CORS_ORIGINS_STR="https://app.example.com, http://localhost:3000",
    )
    assert cfg.BACKEND_CORS_ORIGINS == [
        "https://app.example.com",
        "http://localhost:3000",
    ]
