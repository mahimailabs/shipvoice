# Working in this repo

For coding agents. Six facts, then how to run it. Everything here is verified
against the code, not aspirational.

## What this is

A voice AI starter. Three services, each independently runnable:

- `agent/` a LiveKit Agents worker. Deepgram nova-3 speech to text, Cerebras
  `gemma-4-31b`, Inworld `inworld-tts-2` speech, Silero VAD, LiveKit's
  multilingual turn detector.
- `backend/` FastAPI. Mints LiveKit room tokens, stores the LiveKit project,
  describes the agent. Five routes, no authentication.
- `frontend/` the console. React, Vite, one page that matters (Agents) plus a
  Deployment page.

## The six things that will cost you an hour if you do not know them

1. **`docker compose` reads the root `.env` and nothing else.** There are also
   `agent/.env`, `backend/.env` and `frontend/.env`; those are for running a
   service by hand. Writing a value into the wrong one produces a config that
   works one way and not the other.

2. **`AGENT_NAME` and `VITE_AGENT_NAME` must be byte-identical.** LiveKit
   dispatches the worker by exact string match. When they differ the room
   opens, the token is valid, the browser connects, and nothing ever speaks.
   No error is logged anywhere. `scripts/doctor.py` checks this first for a
   reason.

3. **`VITE_*` values are baked into the frontend at image build time.** After
   changing one, `docker compose up -d --build`. A plain `restart` silently
   keeps the old value, which produces failure 2.

4. **Console mode needs no LiveKit, no backend and no database.**
   `cd agent && uv run python main.py console` runs the whole speech to model
   to speech loop in the terminal with just the three provider keys. It is the
   fastest way to prove the agent works before anything else is up.

5. **The backend has no authentication at all.** Every route is open. That is
   deliberate for a tool you run on your own machine and wrong on a public
   address. Never expose it without putting something in front of it.

6. **Never write, echo, `cat` or read back an API key.** Anything you put in a
   tool call is persisted to the coding agent's transcript on disk, where the
   user does not know to look for it. Name the variable and the file, ask the
   human to paste it themselves, then run the doctor to confirm it worked. This
   is the one rule in this file with no exceptions.

## Running it

```bash
cp .env.example .env         # LiveKit and three provider keys
docker compose up --build    # postgres, backend, agent, console
```

Then http://localhost:5173, Agents, open the agent, **Test call**, **Start test call**.

The backend brings the schema to head on startup, so there is no migration
step. If something does not work, do not guess:

```bash
cd agent && uv run python ../scripts/doctor.py --live
```

It names the cause and the fix. Every failure in this stack is quiet, so
reading its output is faster than reading logs.

## Changing the agent

The persona is `agent/prompts/instructions.md`, a plain file with one
`{agent_name}` placeholder. Editing it is the whole process, and there is no
restart: LiveKit runs `entrypoint()` per job, `Assistant.__init__` calls
`load_instructions()`, and that reads the file every time. So a save lands on
the next call. A call already in progress keeps the prompt it started with.

Two ways to edit it, same file:

- The file itself, in your editor.
- The console, on the Agents page, over `GET` and
  `PUT /api/v1/agents/{slug}/prompt`. `{slug}` is `AGENT_NAME`; anything else
  is a 404. The write needs `CONSOLE_WRITES_ENABLED` (compose sets it) and the
  backend's read-write mount of `./agent/prompts` (compose sets that too). It
  is atomic, a temp file in the same directory renamed over the target, so a
  save never leaves the worker reading half a persona. Without the mount the
  editor still loads and every save answers 409 naming the path.

Do not edit `agent/src/prompts/instructions.py`: that holds the packaged
fallback for a clone that has no prompt file. When the file is missing the
console shows an empty editor and says the worker is running that fallback.

## Conventions

- Python: `uv`, `ruff`, `mypy` on `src`. Never `pip`.
- Frontend: `pnpm` only, pinned. The build is `tsc -b && vite build` with
  `noUnusedLocals` and `noUnusedParameters`, so an unused import fails the
  build, not the lint.
- Frontend imports come from `react-router`, never `react-router-dom`.
- No `: JSX.Element` return annotations; that namespace is gone in React 19.
- No em dashes in code, comments, docs or UI copy.
- Tests: `uv run pytest -q` in `agent/` and `backend/`, `pnpm test` in
  `frontend/`.

## What is deliberately not here

Call logging, campaigns, customer records, evaluations, billing and metering
belong to ShipVoice Pro. The console shows them greyed out so the shape of the
full product is visible. Do not build them here: an empty table is worse than
an honest absence.
