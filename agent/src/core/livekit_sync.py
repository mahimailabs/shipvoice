"""Take the LiveKit project from the backend instead of this process's env."""

import logging
import os
import signal
import sys
import threading
import time

import httpx

logger = logging.getLogger("agent.livekit_sync")

_ENV_KEYS = ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET")


def _endpoint(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/api/v1/internal/livekit"


def _fetch(base_url: str, token: str, timeout: float = 5.0) -> dict | None:
    try:
        response = httpx.get(
            _endpoint(base_url),
            headers={"Authorization": f"Bearer {token}"},
            timeout=timeout,
        )
    except httpx.HTTPError as exc:
        logger.warning("could not reach the backend for LiveKit config: %s", exc)
        return None

    if response.status_code == 403:
        logger.error(
            "backend refused the service token: BACKEND_API_TOKEN must equal the backend's AGENT_SERVICE_TOKEN"
        )
        return None
    if response.status_code != 200:
        logger.warning(
            "backend returned %s for LiveKit config, staying on the environment",
            response.status_code,
        )
        return None
    payload: dict = response.json()
    return payload


def bootstrap(base_url: str | None, token: str | None) -> str | None:
    """Adopt the backend's LiveKit project. Returns the revision, or None."""
    if not base_url or not token:
        logger.info("LiveKit sync is off, using the environment")
        return None

    payload = _fetch(base_url, token)
    if not payload:
        return None

    os.environ["LIVEKIT_URL"] = payload["url"]
    os.environ["LIVEKIT_API_KEY"] = payload["api_key"]
    os.environ["LIVEKIT_API_SECRET"] = payload["api_secret"]
    logger.info("LiveKit project taken from the backend: %s", payload["url"])
    return str(payload["revision"])


def watch(
    base_url: str | None,
    token: str | None,
    revision: str | None,
    interval_seconds: float = 15.0,
) -> None:
    """Restart this worker when the stored project changes.

    Runs on a daemon thread so it can never hold up shutdown.
    """
    if not base_url or not token:
        return

    # revision is None when the boot fetch failed: an unreachable backend, a
    # refused token, or a database that was not up yet. Returning here would
    # make one transient outage disable the watcher for the life of the worker,
    # silently, while the console kept promising that edits reach it. So the
    # watcher starts anyway and adopts whatever the first successful poll finds.
    known: str | None = revision

    def _loop() -> None:
        nonlocal known
        while True:
            time.sleep(interval_seconds)
            payload = _fetch(base_url, token)
            if not payload:
                continue
            if known is None:
                known = str(payload["revision"])
                # Only restart if the backend disagrees with what we booted on.
                # Otherwise this is just the late arrival of a fetch that failed
                # at startup, and there is nothing to adopt.
                if payload["url"] == os.environ.get("LIVEKIT_URL") and payload[
                    "api_key"
                ] == os.environ.get("LIVEKIT_API_KEY"):
                    logger.info("backend reachable again, project unchanged")
                    continue
                logger.warning(
                    "backend reachable again and its LiveKit project differs, "
                    "restarting to adopt it"
                )
                os.kill(os.getpid(), signal.SIGTERM)
                return
            if str(payload["revision"]) == known:
                continue
            logger.warning(
                "LiveKit project changed in the console, draining and restarting so calls are placed on the new project"
            )
            # SIGTERM rather than exit(): it is what LiveKit's own draining is
            # wired to, so in-flight calls finish instead of being cut.
            os.kill(os.getpid(), signal.SIGTERM)
            return

    threading.Thread(target=_loop, name="livekit-sync", daemon=True).start()
    logger.info("watching the backend for LiveKit project changes")


PLACEHOLDER_URL = "wss://your-project.livekit.cloud"


def env_is_complete() -> bool:
    return all(os.environ.get(k) for k in _ENV_KEYS)


def require_livekit_or_exit() -> None:
    """Refuse to start on credentials that cannot work, and say which one.

    Without this the worker loops raw aiohttp 401 tracebacks forever under
    'restart: unless-stopped', and not one line of that output names
    LIVEKIT_URL, LIVEKIT_API_KEY or LIVEKIT_API_SECRET. The browser then
    reports 'invalid API key' for what is usually an unedited URL, which sends
    people to rotate a key that was fine.
    """
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


def start_livekit_sync() -> None:
    """Adopt the backend's LiveKit project, then watch it. Entrypoint only.

    Call this from a '__main__' guard. LiveKit re-imports the agent module in
    every job subprocess, so running any of this at import time gives each of
    them its own poller, each fetching the LiveKit secret on a timer, and none
    of them able to restart anything: job processes set SIGTERM to SIG_IGN.
    """
    import sys as _sys

    # 'download-files' prefetches models during the Docker build with no
    # credentials, and 'console' runs the whole loop against the provider APIs
    # only. Neither touches LiveKit.
    if not any(cmd in _sys.argv for cmd in ("start", "dev", "connect")):
        return

    from src.core.config import config

    revision = bootstrap(config.BACKEND_API_URL, config.BACKEND_API_TOKEN)
    require_livekit_or_exit()
    watch(
        config.BACKEND_API_URL,
        config.BACKEND_API_TOKEN,
        revision,
        config.LIVEKIT_SYNC_INTERVAL_SECONDS,
    )
