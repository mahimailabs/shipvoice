#!/usr/bin/env python3
"""Say which of the things is wrong, in one line, with the fix.

Every failure in this stack is quiet. A mismatched agent name mints a valid
token, opens a real room, and produces no error anywhere: the call just sits
there. An unedited LIVEKIT_URL surfaces in the browser as "invalid API key". A
provider key that is merely wrong looks exactly like a provider that is down.

So this exists to name the cause. Run it after setup, and any time the answer
to "why is it not talking" is not obvious.

    uv run python scripts/doctor.py          # config and credentials
    uv run python scripts/doctor.py --live   # also probe the running stack

Only stdlib plus httpx, which the agent already depends on. It must run before
anything else is installed or working.
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    import httpx
except ModuleNotFoundError:  # pragma: no cover - depends on the caller's venv
    print(
        "doctor needs httpx. Run it through the agent's environment:\n"
        "  cd agent && uv run python ../scripts/doctor.py",
        file=sys.stderr,
    )
    raise SystemExit(2) from None

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"
PLACEHOLDER_URL = "wss://your-project.livekit.cloud"

OK, WARN, BAD = "ok", "warn", "bad"


@dataclass
class Result:
    state: str
    check: str
    detail: str
    fix: str = ""


def read_env(path: Path) -> dict[str, str]:
    """Parse a .env without needing python-dotenv."""
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


# ---------------------------------------------------------------- config ---


def check_env_file(env: dict[str, str]) -> list[Result]:
    if not ENV_PATH.exists():
        return [
            Result(
                BAD,
                ".env",
                "missing",
                "cp .env.example .env, then fill in the values it asks for",
            )
        ]
    return [Result(OK, ".env", f"{len(env)} values", "")]


def check_agent_name(env: dict[str, str]) -> list[Result]:
    """The quietest failure in the stack, so it is checked before anything else."""
    agent = env.get("AGENT_NAME", "assistant")
    front = env.get("VITE_AGENT_NAME", agent)
    if agent != front:
        return [
            Result(
                BAD,
                "agent name",
                f"AGENT_NAME={agent!r} but VITE_AGENT_NAME={front!r}",
                "Make them identical in .env. LiveKit matches this as an exact "
                "string: when they differ the room opens, the token is valid, "
                "and nothing ever speaks.",
            )
        ]
    return [Result(OK, "agent name", f"{agent} on both sides", "")]


def check_livekit_url(env: dict[str, str]) -> list[Result]:
    url = env.get("LIVEKIT_URL", "")
    if not url:
        return [Result(BAD, "LIVEKIT_URL", "not set", "Set it in .env")]
    if url == PLACEHOLDER_URL:
        return [
            Result(
                BAD,
                "LIVEKIT_URL",
                "still the example value",
                "Put your own project URL in .env. Left as-is the browser "
                "reports 'invalid API key', which sends you to rotate a key "
                "that was never the problem.",
            )
        ]
    if not url.startswith(("ws://", "wss://")):
        return [
            Result(
                BAD,
                "LIVEKIT_URL",
                f"{url} is not a websocket URL",
                "It starts with wss://",
            )
        ]
    out = [Result(OK, "LIVEKIT_URL", url, "")]
    # The worker requires all three. Checking only the URL meant a stranger who
    # pasted one value got a green run and the line "Everything required is
    # set", then a worker that exits and crash-loops.
    for var in ("LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
        if env.get(var):
            out.append(Result(OK, var, "set", ""))
        else:
            out.append(
                Result(BAD, var, "not set", "Set it in .env, from your LiveKit project")
            )
    return out


def check_service_token(env: dict[str, str]) -> list[Result]:
    a, b = env.get("AGENT_SERVICE_TOKEN", ""), env.get("BACKEND_API_TOKEN", "")
    if not a and not b:
        return [
            Result(
                WARN,
                "service token",
                "unset, so the worker will not follow console changes",
                "Optional. Set both to the same value from: openssl rand -hex 32",
            )
        ]
    if a != b:
        return [
            Result(
                BAD,
                "service token",
                "AGENT_SERVICE_TOKEN and BACKEND_API_TOKEN differ",
                "They are one secret with two names. Make them identical.",
            )
        ]
    if "change-me" in a:
        return [
            Result(
                BAD,
                "service token",
                "still the example placeholder",
                "It guards the endpoint that serves your LiveKit secret. "
                "Replace it: openssl rand -hex 32",
            )
        ]
    return [Result(OK, "service token", "set and matching", "")]


# ------------------------------------------------------------ providers ---

PROVIDERS = [
    (
        "DEEPGRAM_API_KEY",
        "Deepgram (speech to text)",
        "https://api.deepgram.com/v1/projects",
        lambda k: {"Authorization": f"Token {k}"},
        "https://console.deepgram.com",
    ),
    (
        "CEREBRAS_API_KEY",
        "Cerebras (the LLM)",
        "https://api.cerebras.ai/v1/models",
        lambda k: {"Authorization": f"Bearer {k}"},
        "https://cloud.cerebras.ai",
    ),
    (
        "INWORLD_API_KEY",
        "Inworld (text to speech)",
        "https://api.inworld.ai/tts/v1/voices",
        lambda k: {"Authorization": f"Basic {k}"},
        "https://platform.inworld.ai",
    ),
]


def check_providers(env: dict[str, str], live: bool) -> list[Result]:
    out: list[Result] = []
    for var, label, probe_url, headers, console in PROVIDERS:
        key = env.get(var) or os.environ.get(var, "")
        if not key:
            out.append(Result(BAD, label, f"{var} not set", f"Get one at {console}"))
            continue
        if not live:
            out.append(Result(OK, label, f"{var} set ({len(key)} chars)", ""))
            continue
        try:
            r = httpx.get(probe_url, headers=headers(key), timeout=12.0)
        except httpx.HTTPError as exc:
            # A network problem is not a bad key, and saying so stops someone
            # regenerating a key that was fine.
            out.append(
                Result(
                    WARN, label, f"could not reach the API: {exc}", "Check your network"
                )
            )
            continue
        if r.status_code in (401, 403):
            out.append(
                Result(
                    BAD,
                    label,
                    f"{var} rejected ({r.status_code})",
                    f"Check it at {console}",
                )
            )
        elif r.status_code >= 500:
            out.append(
                Result(
                    WARN,
                    label,
                    f"provider returned {r.status_code}",
                    "Their side, not yours",
                )
            )
        else:
            out.append(Result(OK, label, "key accepted", ""))
    return out


# ----------------------------------------------------------------- live ---


def check_stack(env: dict[str, str]) -> list[Result]:
    base = env.get("VITE_API_BASE_URL", "http://localhost:8000")
    out: list[Result] = []

    try:
        r = httpx.get(f"{base}/health", timeout=8.0)
        out.append(
            Result(
                OK if r.status_code == 200 else BAD,
                "backend",
                f"/health {r.status_code}",
                "",
            )
            if r.status_code == 200
            else Result(
                BAD,
                "backend",
                f"/health returned {r.status_code}",
                "docker compose logs backend",
            )
        )
    except httpx.HTTPError:
        return out + [
            Result(
                BAD,
                "backend",
                f"nothing answering at {base}",
                "docker compose up -d, then run this again",
            )
        ]

    # One round trip that proves the database, the credentials and the signing.
    try:
        r = httpx.post(
            f"{base}/api/v1/token", json={"room_name": "doctor"}, timeout=12.0
        )
    except httpx.HTTPError as exc:
        return out + [Result(BAD, "token", f"request failed: {exc}", "")]

    if r.status_code == 201:
        out.append(
            Result(OK, "token", "minted, so credentials and signing are good", "")
        )
    elif r.status_code == 503:
        out.append(
            Result(
                BAD,
                "token",
                "LiveKit is not configured",
                "Set LIVEKIT_* in .env and restart",
            )
        )
    else:
        out.append(
            Result(
                BAD,
                "token",
                f"{r.status_code}: {r.text[:120]}",
                "docker compose logs backend",
            )
        )

    try:
        r = httpx.get(f"{base}/api/v1/agents", timeout=8.0)
        if r.status_code == 200:
            agents = r.json().get("agents", [])
            name = agents[0]["agent_name"] if agents else "?"
            out.append(Result(OK, "agent", f"backend reports {name!r}", ""))
        else:
            out.append(
                Result(WARN, "agent", f"/api/v1/agents returned {r.status_code}", "")
            )
    except httpx.HTTPError:
        out.append(Result(WARN, "agent", "could not read /api/v1/agents", ""))

    return out


def check_worker_running() -> list[Result]:
    """Is the worker process actually up? Docker only, best effort."""
    import shutil
    import subprocess

    if not shutil.which("docker"):
        return []
    try:
        proc = subprocess.run(
            ["docker", "compose", "ps", "--services", "--status", "running"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=25,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    running = {s.strip() for s in proc.stdout.splitlines() if s.strip()}
    if not running:
        return [
            Result(WARN, "stack", "no compose services running", "docker compose up -d")
        ]
    missing = {"db", "backend", "agent", "frontend"} - running
    if missing:
        return [
            Result(
                BAD,
                "stack",
                f"not running: {', '.join(sorted(missing))}",
                f"docker compose logs {sorted(missing)[0]}",
            )
        ]
    return [Result(OK, "stack", "db, backend, agent and frontend are up", "")]


# ---------------------------------------------------------------- output ---

GLYPH = {OK: "  ok  ", WARN: " warn ", BAD: " FAIL "}


def report(results: list[Result]) -> int:
    width = max((len(r.check) for r in results), default=10)
    for r in results:
        print(f"[{GLYPH[r.state]}] {r.check.ljust(width)}  {r.detail}")
        if r.fix and r.state != OK:
            for line in _wrap(r.fix, 74):
                print(f"{' ' * (width + 11)}{line}")

    bad = [r for r in results if r.state == BAD]
    print()
    if bad:
        print(f"{len(bad)} thing{'s' if len(bad) > 1 else ''} to fix, listed above.")
        return 1
    if any(r.state == WARN for r in results):
        print("Everything required is set. The warnings above are optional.")
        return 0
    print("All good. Open http://localhost:5173 and start a test call.")
    return 0


def _wrap(text: str, width: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return lines


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--live",
        action="store_true",
        help="also probe the provider APIs and the running stack",
    )
    args = parser.parse_args()

    env = read_env(ENV_PATH)
    results = check_env_file(env)
    if ENV_PATH.exists():
        results += check_agent_name(env)
        results += check_livekit_url(env)
        results += check_service_token(env)
        results += check_providers(env, args.live)
        if args.live:
            results += check_worker_running()
            results += check_stack(env)

    if not args.live:
        print(
            "Checking configuration. Add --live to probe the providers and the stack.\n"
        )
    return report(results)


if __name__ == "__main__":
    raise SystemExit(main())
