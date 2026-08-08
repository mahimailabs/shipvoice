"""Take the LiveKit project from the backend instead of this process's env.

The console can change the LiveKit project. The worker connects with its own
credentials, so without this the two silently diverge: tokens get signed for one
project while the worker waits on another, every call connects to silence, and
nothing logs an error anywhere. That failure is close to undiagnosable, which is
why the worker follows the backend rather than being warned about it in a UI.

Two parts:

  bootstrap()  before the LiveKit CLI reads the environment, fetch the project
               and write it into os.environ. The env is still the fallback, so a
               worker whose backend is down keeps running on what it has.

  watch()      poll for a revision change and, when it happens, raise SIGTERM on
               ourselves. LiveKit's own signal handling drains in-flight calls
               first, and the supervisor (compose 'restart: unless-stopped', or
               Fly) starts us again on the new project.

Restarting is the honest move: the worker registers with LiveKit once, at
startup, so there is no way to swap credentials underneath a live connection.
"""

import logging
import os
import signal
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
            "backend refused the service token: BACKEND_API_TOKEN must equal "
            "the backend's AGENT_SERVICE_TOKEN"
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
    """Adopt the backend's LiveKit project. Returns the revision, or None.

    Never raises. A worker that cannot reach its backend must still start on the
    credentials it already has, because refusing to run would turn a console
    being down into every call failing.
    """
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
    if not base_url or not token or revision is None:
        return

    def _loop() -> None:
        while True:
            time.sleep(interval_seconds)
            payload = _fetch(base_url, token)
            if not payload:
                continue
            if str(payload["revision"]) == revision:
                continue
            logger.warning(
                "LiveKit project changed in the console, draining and restarting "
                "so calls are placed on the new project"
            )
            # SIGTERM rather than exit(): it is what LiveKit's own draining is
            # wired to, so in-flight calls finish instead of being cut.
            os.kill(os.getpid(), signal.SIGTERM)
            return

    threading.Thread(target=_loop, name="livekit-sync", daemon=True).start()
    logger.info("watching the backend for LiveKit project changes")


def env_is_complete() -> bool:
    return all(os.environ.get(k) for k in _ENV_KEYS)
