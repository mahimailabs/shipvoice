"""Report a call's lifecycle and its turns to the backend.

Opt in, and never load bearing. Every request is wrapped, so a backend that is
down, slow or refusing the token costs the caller nothing: the report is logged
and dropped. A voice call must not fail because a log write did.

Nothing here records what a call cost. Free records what happened on a call;
what it cost belongs to the paid product.
"""

import asyncio
import logging
import time
from datetime import UTC, datetime

import httpx

from src.core.config import config

logger = logging.getLogger("agent.call_reporter")

ENDPOINT = "/api/v1/internal/agent/calls"
TIMEOUT_SECONDS = 5.0

# How many unsent reports may pile up while the backend is unreachable. Each
# failed post costs a whole timeout, so a long call against a dead backend
# would otherwise grow this without bound.
QUEUE_LIMIT = 500

# The roles the console shows. Everything else a session emits (system,
# developer) is machinery, not conversation, and is not a turn.
ROLES = {"user": "user", "assistant": "agent"}


class CallReporter:
    """Posts one call's start, its turns and its finish to the backend.

    Reports are queued and sent by a single background task, so nothing here
    ever runs on the audio path, and the backend still sees them in order.
    """

    def __init__(
        self,
        base_url: str | None,
        token: str | None,
        *,
        enabled: bool = True,
        timeout: float = TIMEOUT_SECONDS,
    ) -> None:
        self._base_url = (base_url or "").rstrip("/")
        self._token = token or ""
        # An unset URL or token is off, not broken: reporting is opt in and the
        # backend refuses an empty token anyway.
        self._enabled = bool(enabled and self._base_url and self._token)
        self._timeout = timeout
        self._queue: asyncio.Queue[tuple[str, dict] | None] = asyncio.Queue(
            maxsize=QUEUE_LIMIT
        )
        self._worker: asyncio.Task | None = None
        self._client: httpx.AsyncClient | None = None
        self._room_name: str | None = None
        self._turns = 0
        self._dropped = 0
        self._started_at: float | None = None

    @classmethod
    def from_config(cls, *, console_mode: bool = False) -> "CallReporter":
        """Build the reporter this worker's environment asks for.

        Console mode never reports: it is the run that needs no backend, no
        database and no token, and it must stay that way.
        """
        return cls(
            config.BACKEND_API_URL,
            config.BACKEND_API_TOKEN,
            enabled=config.BACKEND_REPORTING_ENABLED and not console_mode,
        )

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def start(
        self,
        *,
        room_name: str,
        caller: str | None,
        channel: str,
        agent_name: str | None = None,
        business_name: str | None = None,
    ) -> None:
        """Open the call record. Call this once the caller is known."""
        if not self._enabled:
            return
        self._room_name = room_name
        self._started_at = time.monotonic()
        self._ensure_worker()
        self._enqueue(
            "start",
            {
                "room_name": room_name,
                "caller": caller,
                "channel": channel,
                "agent_name": agent_name,
                "business_name": business_name,
            },
        )

    def note_turn(
        self, role: str, text: str, spoken_at: datetime | None = None
    ) -> None:
        """Record one spoken turn.

        Synchronous and non-blocking on purpose: this is called from a session
        event handler, which is the audio path.
        """
        if not self._enabled or not self._room_name:
            return
        mapped = ROLES.get(role)
        if mapped is None or not text:
            return
        self._turns += 1
        self._enqueue(
            "turn",
            {
                "room_name": self._room_name,
                "role": mapped,
                "text": text,
                "spoken_at": (spoken_at or datetime.now(UTC)).isoformat(),
            },
        )

    async def finish(self, status: str = "completed") -> None:
        """Close the call record, then drain whatever is still queued.

        Safe to call from a LiveKit shutdown callback: it never raises and it
        will not wait longer than twice the request timeout.
        """
        if not self._enabled or not self._room_name:
            await self._aclose()
            return
        duration: int | None = None
        if self._started_at is not None:
            duration = max(0, round(time.monotonic() - self._started_at))
        self._ensure_worker()
        self._enqueue(
            "finish",
            {
                "room_name": self._room_name,
                "status": status,
                "duration_seconds": duration,
                "turn_count": self._turns,
            },
        )
        await self._flush()
        await self._aclose()

    # ---- internals --------------------------------------------------------

    def _ensure_worker(self) -> None:
        if self._worker is None:
            self._worker = asyncio.create_task(self._drain(), name="call-reporter")

    def _enqueue(self, path: str, payload: dict) -> None:
        try:
            self._queue.put_nowait((path, payload))
        except asyncio.QueueFull:
            self._dropped += 1
            logger.warning(
                "the call report queue is full, dropping a %s report (%d dropped so far)",
                path,
                self._dropped,
            )

    async def _drain(self) -> None:
        while True:
            item = await self._queue.get()
            if item is None:
                return
            path, payload = item
            await self._post(path, payload)

    async def _post(self, path: str, payload: dict) -> None:
        try:
            client = self._get_client()
            response = await client.post(
                f"{self._base_url}{ENDPOINT}/{path}",
                json=payload,
                headers={"Authorization": f"Bearer {self._token}"},
            )
        except Exception as exc:
            # Deliberately broad. Anything raised here, a DNS failure, a
            # timeout, a closed loop, must not reach the call.
            logger.warning("could not report the call %s: %s", path, exc)
            return

        if response.status_code == 403:
            logger.error(
                "backend refused the service token: BACKEND_API_TOKEN must equal the backend's AGENT_SERVICE_TOKEN"
            )
        elif response.status_code >= 400:
            logger.warning(
                "backend returned %s for the call %s report", response.status_code, path
            )

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self._timeout)
        return self._client

    async def _flush(self) -> None:
        """Send what is still queued before the process goes away."""
        worker = self._worker
        if worker is None:
            return
        try:
            await asyncio.wait_for(self._stop(worker), timeout=self._timeout * 2)
        except TimeoutError:
            logger.warning("gave up waiting on the last call reports")
            worker.cancel()
        except Exception as exc:
            logger.warning("could not flush the call reports: %s", exc)
            worker.cancel()

    async def _stop(self, worker: asyncio.Task) -> None:
        await self._queue.put(None)
        await worker

    async def _aclose(self) -> None:
        client, self._client = self._client, None
        if client is None:
            return
        try:
            await client.aclose()
        except Exception as exc:
            logger.debug("closing the report client failed: %s", exc)
