<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.webp">
  <source media="(prefers-color-scheme: light)" srcset="assets/banner-light.webp">
  <img src="assets/banner-light.webp" alt="LiveKit Voice AI Starter" width="100%" />
</picture>

<h1 align="center">LiveKit Voice AI Starter</h1>

<p align="center">
  <b>Talk to an AI agent in your browser, in minutes.</b><br/>
  A full-stack, production-minded starter for real-time voice agents: a LiveKit
  voice worker, a FastAPI token server, and a React frontend built on LiveKit's
  Agents UI, wired together and ready to extend.
</p>

<p align="center">
  <!--<a href="https://your-demo-url"><img src="assets/badges/live-demo.svg" alt="Live Demo" height="30"></a>-->
  <a href="https://livekit.io"><img src="assets/badges/livekit.svg" alt="LiveKit" height="30"></a>
  <img src="assets/badges/voice-first.svg" alt="Voice First" height="30">
  <a href="https://www.python.org"><img src="assets/badges/python.svg" alt="Python" height="30"></a>
  <a href="https://fastapi.tiangolo.com"><img src="assets/badges/fastapi.svg" alt="FastAPI" height="30"></a>
  <a href="https://react.dev"><img src="assets/badges/react.svg" alt="React" height="30"></a>
  <a href="https://www.typescriptlang.org"><img src="assets/badges/typescript.svg" alt="TypeScript" height="30"></a>
  <a href="https://tailwindcss.com"><img src="assets/badges/tailwind.svg" alt="Tailwind CSS" height="30"></a>
</p>

<p align="center">
  <a href="LICENSE"><img src="assets/badges/license-mit.svg" alt="MIT License" height="30"></a>
  <a href="../../issues"><img src="assets/badges/prs-welcome.svg" alt="PRs welcome" height="30"></a>
</p>

---

Most voice-AI demos are a single script. This is the whole loop, structured the
way you'd actually ship it, and split into three pieces you can run, deploy, and
swap independently.

## What's inside

| Package         | What it is                                                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`agent/`**    | A LiveKit voice worker: Deepgram `nova-3` STT, OpenAI `gpt-4.1-mini`, Cartesia TTS, Silero VAD, and the LiveKit multilingual turn detector. Web and SIP, explicit dispatch. |
| **`backend/`**  | A FastAPI service that mints LiveKit room tokens (`POST /api/v1/token`), with a clean API → service → repository layout you copy to add resources.                          |
| **`frontend/`** | React + Vite + Tailwind using LiveKit's Agents UI components: audio visualizer, live transcript, and text chat.                                                             |

Typed end to end, tested, linted, with CI and a pre-commit hook across all three.

## How it fits together

```
  React app  ──POST /api/v1/token──▶  Backend  ──signs token──▶  React joins room
      │                                                               │
      └───────────────── connects to LiveKit room ◀──────────────────┘
                                   │
                  agent_name dispatches  ──▶  Agent worker joins
                                   │
                         mic ▶ STT ▶ LLM ▶ TTS ▶ speaker  (over WebRTC)
```

The backend and agent share the same LiveKit credentials, so a backend-minted
token is valid for the room the agent joins. Works against self-hosted LiveKit
or LiveKit Cloud.

## Run with Docker

The fastest path. One command brings up Postgres, the backend, the agent, and the
frontend together:

```bash
cp .env.example .env     # fill in LIVEKIT_* + OPENAI/DEEPGRAM/CARTESIA
docker compose up --build
```

Open `http://localhost:5173` and click **Start conversation**. Uses an external
LiveKit project (a free LiveKit Cloud project works). The voice demo needs no
database; for the auth/User endpoints, run once:
`docker compose exec backend alembic upgrade head`.

## Run manually

You'll need a LiveKit project (URL + API key/secret) and provider keys
(OpenAI, Deepgram, Cartesia). Run each in its own terminal:

```bash
# 1. Backend: token server (http://localhost:8000)
cd backend && cp .env.example .env   # add LIVEKIT_* + JWT_SECRET_KEY
uv sync && uv run uvicorn src.main:app --reload

# 2. Agent: voice worker
cd agent && cp .env.example .env      # add LIVEKIT_*, OPENAI/DEEPGRAM/CARTESIA keys
uv sync && uv run python main.py dev

# 3. Frontend: web client (http://localhost:5173)
cd frontend && cp .env.example .env   # point VITE_TOKEN_ENDPOINT at the backend
pnpm install && pnpm dev
```

Open `http://localhost:5173`, click **Start conversation**, allow the mic, and talk.

> No frontend yet? Talk to the agent from your terminal with
> `cd agent && uv run python main.py console`.

## Stack

| Layer           | Default                                                                       |
| --------------- | ----------------------------------------------------------------------------- |
| STT / LLM / TTS | Deepgram `nova-3` · OpenAI `gpt-4.1-mini` · Cartesia (all swappable)          |
| Realtime        | LiveKit Agents (`livekit-agents`), WebRTC, Silero VAD, turn detector          |
| Backend         | FastAPI, async SQLModel/Postgres, dependency-injector, PyJWT, `livekit-api`   |
| Frontend        | React 19, Vite, TypeScript, Tailwind v4, shadcn + LiveKit Agents UI           |
| Tooling         | uv, ruff, mypy, pytest · ESLint, Vitest · pre-commit, GitHub Actions, Codecov |

## Highlights

- **One command per service** to run locally; one `.env.example` each.
- **Web and telephony** (SIP) on the same agent, via a single participant branch.
- **Swappable providers** and self-hosted ↔ LiveKit Cloud with a one-line change.
- **Zero-downtime deploys**: the worker drains in-flight calls on SIGTERM (blue/green on Fly), so a deploy mid-call finishes the call instead of dropping it.
- **Standard token endpoint** so LiveKit client SDKs connect with zero glue.
- **Copy-to-extend** patterns: a `User` slice in the backend, a bare `Assistant` in the agent.

## Docs

Each package has its own README with details:
[`agent/`](agent/README.md) · [`backend/`](backend/README.md) · [`frontend/`](frontend/README.md)

## License

MIT. See [`LICENSE`](LICENSE).
