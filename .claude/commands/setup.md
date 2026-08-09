---
description: Set up this repo and get a voice agent talking
---

Get this clone from nothing to a spoken reply. Keep it short; `scripts/doctor.py`
does the diagnosing, so you do not have to.

## 1. Ask one question

"In one sentence, what should this agent do? (Enter for a general assistant.)"

Ask nothing else. There is no sign-in, LiveKit credentials go in `.env`, and
everything else has a default.

## 2. Get `.env` filled in

If `.env` is missing, `cp .env.example .env`.

Then run `cd agent && uv run python ../scripts/doctor.py` and read it. If it
names anything missing, tell the human exactly which variables to paste into
`.env`, and where each comes from:

- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` from https://cloud.livekit.io
- `DEEPGRAM_API_KEY` from https://console.deepgram.com
- `CEREBRAS_API_KEY` from https://cloud.cerebras.ai
- `INWORLD_API_KEY` from https://platform.inworld.ai

Then wait for them to say it is done.

**Do not ask for a key, do not read one back, do not echo one, and never write
one into a file yourself.** Everything in this conversation is saved to the
Claude Code transcript on disk. The human pastes their own keys; you never see
them. If the doctor says a key is rejected, say which one and let them fix it.

If `AGENT_SERVICE_TOKEN` is empty, you may generate that one yourself, since it
is not anyone's credential: `openssl rand -hex 32`, written to both
`AGENT_SERVICE_TOKEN` and `BACKEND_API_TOKEN`.

## 3. Write the persona

Unless they pressed Enter, rewrite `agent/prompts/instructions.md` for what they
described. Keep the `{agent_name}` placeholder, keep the output rules (plain
text, one to three sentences, one question at a time), and keep it short: it is
a voice prompt, not a manual.

## 4. Start it and check

```bash
docker compose up -d --build
cd agent && uv run python ../scripts/doctor.py --live
```

Report what the doctor says. If everything passes, tell them to open
http://localhost:5173, go to **Agents**, open the agent, then **Test call** and
**Start test call**.

If something fails, the doctor already named the cause and the fix. Do that,
run it again, and do not start guessing at logs.
