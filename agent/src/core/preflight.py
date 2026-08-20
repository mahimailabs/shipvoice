"""Refuse to start on LiveKit credentials that cannot work, and say which one.

The worker reads LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET from its
own environment and nowhere else. Nothing fetches them at boot and nothing
watches them: pointing the worker at another LiveKit project is an edit to .env
and a restart, the same way every other change to this agent is.
"""

import os
import sys

_ENV_KEYS = ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET")

# The value shipped in .env.example. Someone who never edited it gets a URL
# that resolves to nothing, which LiveKit reports as an authentication failure.
PLACEHOLDER_URL = "wss://your-project.livekit.cloud"

# The subcommands that actually connect to LiveKit. 'download-files' prefetches
# the VAD and turn-detector models during the Docker build, with no credentials
# and no need of any, and 'console' runs the whole loop against the provider
# APIs over the local mic. Demanding a URL from either breaks the image build
# and the five-minute first run.
CONNECTING_COMMANDS = ("start", "dev", "connect")


def _connects_to_livekit() -> bool:
    return any(cmd in sys.argv for cmd in CONNECTING_COMMANDS)


def require_livekit_or_exit() -> None:
    """Stop before the session on credentials that cannot work.

    Without this the worker loops raw aiohttp 401 tracebacks forever under
    'restart: unless-stopped', and not one line of that output names
    LIVEKIT_URL, LIVEKIT_API_KEY or LIVEKIT_API_SECRET. The browser then
    reports 'invalid API key' for what is usually an unedited URL, which sends
    people to rotate a key that was fine.
    """
    if not _connects_to_livekit():
        return

    missing = [k for k in _ENV_KEYS if not os.environ.get(k)]
    if missing:
        _die(
            f"{', '.join(missing)} {'is' if len(missing) == 1 else 'are'} not set.",
            "Set them in the root .env (the file docker compose reads), or in "
            "agent/.env if you are running the worker by hand.",
        )

    if os.environ.get("LIVEKIT_URL") == PLACEHOLDER_URL:
        _die(
            f"LIVEKIT_URL is still the example value, {PLACEHOLDER_URL}.",
            "Put your own LiveKit project URL there. It is the wss:// address "
            "from your LiveKit Cloud project, or your self-hosted server.",
        )


def _die(problem: str, fix: str) -> None:
    # print(), not logger: this runs before the LiveKit CLI configures logging,
    # so a logger call here would be swallowed at the default WARNING root.
    print(f"\nCannot start the voice worker: {problem}\n{fix}\n", file=sys.stderr)
    raise SystemExit(1)
