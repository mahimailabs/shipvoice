# ShipVoice Agent

A minimal LiveKit voice agent: joins a room (web or SIP), greets, and converses.
Deepgram `nova-3` → OpenAI `gpt-4.1-mini` → Cartesia, with Silero VAD and the
multilingual turn detector. Explicit dispatch via `agent_name`.

## Quickstart

```bash
cp .env.example .env     # LIVEKIT_*, OPENAI/DEEPGRAM/CARTESIA keys
uv sync
uv run python main.py download-files   # prefetch VAD + turn-detector models
uv run python main.py console          # talk via local mic, no frontend needed
uv run python main.py dev              # connect to LiveKit
```

## Layout

```
src/
  agent.py                  entrypoint: connect, build session, run Assistant
  agents/assistant.py       the conversational agent (extend here)
  prompts/instructions.py   system prompt
  core/config.py            settings (AGENT_NAME, ENV, SENTRY_DSN)
  core/events.py            session event handlers + usage summary
  utils/room.py             web vs SIP participant detection
```

## Dispatch

Registers as `AGENT_NAME` (default `assistant`). Web clients trigger it via the
token's `room_config` (the backend `/token` passes it through); SIP via a LiveKit
dispatch rule. Shares `LIVEKIT_API_KEY/SECRET` with the backend.

## Extend

Add tools with `@function_tool` on `Assistant`, or hand off to an `AgentTask`.
Swap providers in `src/agent.py`. For web mic cleanup, add
`livekit-plugins-noise-cancellation` (see the commented note in `agent.py`).

## Commands

```bash
uv run ruff check src/
uv run mypy src/
uv run python -m pytest -q
```
