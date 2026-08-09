# ShipVoice Backend

Mints LiveKit room tokens and gives you a clean, layered FastAPI base
(API → service → repository → model) to build on. Ships a `/token` endpoint plus
an API to service to repository slice you copy for new resources.

## Quickstart

```bash
cp .env.example .env     # set LIVEKIT_* and DB_*
uv sync
# dev convenience: create tables (use migrations for real projects)
uv run python -c "import asyncio; from src.main import db; asyncio.run(db.create_database())"
uv run uvicorn src.main:app --reload     # docs: http://127.0.0.1:8000/docs
```

## Room token

`POST /api/v1/token` follows LiveKit's standard token-endpoint schema, so any
LiveKit client connects with no glue:

```bash
curl -s localhost:8000/api/v1/token -H 'content-type: application/json' \
  -d '{"room_name":"demo","participant_identity":"alice"}'
# -> {"server_url":"wss://...","participant_token":"eyJ..."}
```

Fields (all optional): `room_name`, `participant_identity`, `participant_name`,
`participant_metadata`, `participant_attributes`, `room_config` (agent dispatch).
`LIVEKIT_API_KEY/SECRET` must match the agent's.

There is no auth. Every route is open, which is the right trade for a tool you
run on your own machine and the wrong one on a public address. Read the deploy
section of the root README before exposing it.

## Layout

```
src/
  main.py        app factory (AppCreator)
  core/          config, DI container, database, errors
  api/           routes.py + endpoints/ (health, token, agents, deployment)
  models/ schemas/ repository/ services/   the layering to copy
tests/           pytest
```

## Add a resource

Copy the `User` slice (`models`, `schemas`, `repository`, `services`,
`api/endpoints`), then register it in `core/container.py` and `api/routes.py`.

## Database & migrations

Schema changes use **Alembic** (`alembic.ini`, `migrations/`):

```bash
# after editing a model under src/models/
uv run alembic revision --autogenerate -m "add widgets table"
uv run alembic upgrade head      # apply pending migrations
uv run alembic downgrade -1      # roll back the last migration
```

The `create_database()` shortcut in the quickstart builds tables directly from the
models for quick local dev; use migrations for anything you deploy.

## Commands

```bash
uv run ruff check . && uv run ruff format --check .
uv run mypy src
uv run python -m pytest -q
docker build -t backend . && docker run --rm -p 8000:8000 --env-file .env backend
```
