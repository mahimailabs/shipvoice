"""The routes the console calls, and the token the worker needs to write.

The service under these routes is the real one on sqlite (the calls_service
fixture), so what these tests check is the wiring: paths, filters, status
codes, and who is allowed to post.
"""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.api.endpoints.calls import router as calls_router
from src.api.endpoints.internal_calls import router as internal_calls_router
from src.core.config import Config
from src.core.container import Container

TOKEN = "service-token-the-worker-was-given"

WIRED = [
    "src.api.endpoints.calls",
    "src.api.endpoints.internal_calls",
    # require_service_token is defined there, and @inject resolves its Provide
    # markers against the module it was defined in, not the one that reuses it.
    "src.api.endpoints.internal_livekit",
]


def _build_app(service, *, token: str = TOKEN):
    cfg = Config(ENV="dev", _env_file=None, AGENT_SERVICE_TOKEN=token)
    container = Container()
    container.config.override(cfg)
    container.calls_service.override(service)
    container.wire(modules=WIRED)

    app = FastAPI()
    app.include_router(calls_router, prefix="/api/v1")
    app.include_router(internal_calls_router, prefix="/api/v1")
    return app, container


def _client(app) -> AsyncClient:
    # follow_redirects stays off: a 307 on the list route is a failure, not a
    # detail for the test client to paper over.
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _auth(token: str = TOKEN) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---- the console's four read routes --------------------------------------


async def test_the_list_route_answers_on_the_path_the_console_asks_for(
    calls_service,
):
    """The console requests /api/v1/calls/ with the slash.

    Declaring the route without it makes every page load a 307 followed by a
    second request, cross-origin, on a backend with no auth to keep warm.
    """
    app, container = _build_app(calls_service)
    try:
        assert "/api/v1/calls/" in {getattr(r, "path", "") for r in app.routes}
        async with _client(app) as c:
            resp = await c.get("/api/v1/calls/?limit=50&offset=0")
        assert resp.status_code == 200
        assert resp.json() == {"calls": [], "total": 0}
    finally:
        container.unwire()


async def test_the_list_route_applies_the_console_s_filters(calls_service):
    app, container = _build_app(calls_service)
    try:
        async with _client(app) as c:
            for room, channel in (("web-1", "web"), ("sip-1", "sip")):
                started = await c.post(
                    "/api/v1/internal/agent/calls/start",
                    json={"room_name": room, "channel": channel},
                    headers=_auth(),
                )
                assert started.status_code == 200

            everything = await c.get("/api/v1/calls/")
            assert everything.json()["total"] == 2

            sip = await c.get("/api/v1/calls/?channel=sip")
            body = sip.json()
            assert body["total"] == 1
            assert body["calls"][0]["room_name"] == "sip-1"

            completed = await c.get("/api/v1/calls/?status=completed")
            assert completed.json() == {"calls": [], "total": 0}
    finally:
        container.unwire()


async def test_a_channel_nobody_supports_is_refused_not_ignored(calls_service):
    """Answering an unknown filter with the whole log looks like it worked."""
    app, container = _build_app(calls_service)
    try:
        async with _client(app) as c:
            resp = await c.get("/api/v1/calls/?channel=telegram")
        assert resp.status_code == 422
    finally:
        container.unwire()


async def test_summary_is_not_swallowed_by_the_call_id_route(calls_service):
    """Routes match in declaration order and an int path parameter does not
    fall through when it fails to parse. Declared the other way round,
    /calls/summary answers 422 and the Overview totals go blank."""
    app, container = _build_app(calls_service)
    try:
        async with _client(app) as c:
            resp = await c.get("/api/v1/calls/summary")
        assert resp.status_code == 200
        assert resp.json() == {
            "total_calls": 0,
            "total_minutes": 0.0,
            "total_turns": 0,
        }
    finally:
        container.unwire()


async def test_rollup_is_not_swallowed_by_the_call_id_route(calls_service):
    """The same trap /summary is in, and the same order fixes it. Declared
    after /{call_id}, this answers 422 and the Agents page loses its counts."""
    app, container = _build_app(calls_service)
    try:
        async with _client(app) as c:
            resp = await c.get("/api/v1/calls/rollup")
        assert resp.status_code == 200
        # An empty log is empty lists, never a missing key: three pages read
        # this and none of them should have to guard the shape.
        assert resp.json() == {
            "days": 7,
            "total": 0,
            "by_agent": [],
            "by_channel": [],
        }
    finally:
        container.unwire()


async def test_the_rollup_answers_in_the_window_the_console_asked_for(calls_service):
    app, container = _build_app(calls_service)
    try:
        async with _client(app) as c:
            await c.post(
                "/api/v1/internal/agent/calls/start",
                json={
                    "room_name": "room-1",
                    "channel": "sip",
                    "agent_name": "assistant",
                },
                headers=_auth(),
            )

            body = (await c.get("/api/v1/calls/rollup?days=30")).json()
            assert body == {
                "days": 30,
                "total": 1,
                "by_agent": [{"agent_name": "assistant", "calls": 1}],
                "by_channel": [{"channel": "sip", "calls": 1}],
            }

            # A window nobody can mean is refused rather than quietly widened
            # into one the caller did not ask for.
            assert (await c.get("/api/v1/calls/rollup?days=0")).status_code == 422
    finally:
        container.unwire()


async def test_overview_is_not_swallowed_by_the_call_id_route(calls_service):
    """The third route in the same trap as /summary and /rollup. Declared after
    /{call_id}, this answers 422 and the Overview page's live numbers go blank
    while every other page on the console still works."""
    app, container = _build_app(calls_service)
    try:
        async with _client(app) as c:
            resp = await c.get("/api/v1/calls/overview")
        assert resp.status_code == 200
        # The whole shape on an empty log, keys and all. The page reads every
        # one of these and none of them should have to be guarded.
        assert resp.json() == {
            "calls_today": 0,
            "metered_minutes": 0.0,
            "active": 0,
            "failed": {"count": 0, "of": 0, "window_hours": 24},
            "last_report": {"at": None, "seconds_ago": None},
        }
    finally:
        container.unwire()


async def test_the_overview_reports_what_the_worker_actually_sent(calls_service):
    """End to end over the wire: the worker writes, the console reads."""
    app, container = _build_app(calls_service)
    try:
        async with _client(app) as c:
            for room in ("room-1", "room-2"):
                await c.post(
                    "/api/v1/internal/agent/calls/start",
                    json={"room_name": room},
                    headers=_auth(),
                )
            await c.post(
                "/api/v1/internal/agent/calls/finish",
                json={"room_name": "room-2", "status": "failed"},
                headers=_auth(),
            )

            body = (await c.get("/api/v1/calls/overview")).json()

        assert body["calls_today"] == 2
        assert body["active"] == 1
        assert body["failed"] == {"count": 1, "of": 2, "window_hours": 24}
        # A heartbeat with a real timestamp on it, seconds old rather than null.
        assert body["last_report"]["at"] is not None
        assert body["last_report"]["seconds_ago"] == 0
    finally:
        container.unwire()


async def test_a_call_that_is_not_in_the_log_is_a_404(calls_service):
    """The console tells these two apart: 404 means this call is not in the
    log, anything else means the log itself did not answer."""
    app, container = _build_app(calls_service)
    try:
        async with _client(app) as c:
            assert (await c.get("/api/v1/calls/4242")).status_code == 404
            assert (await c.delete("/api/v1/calls/4242")).status_code == 404
    finally:
        container.unwire()


async def test_a_call_can_be_read_in_full_and_then_deleted(calls_service):
    app, container = _build_app(calls_service)
    try:
        async with _client(app) as c:
            started = await c.post(
                "/api/v1/internal/agent/calls/start",
                json={"room_name": "room-1", "caller": "+15195550123"},
                headers=_auth(),
            )
            call_id = started.json()["id"]
            await c.post(
                "/api/v1/internal/agent/calls/turn",
                json={"room_name": "room-1", "role": "user", "text": "hello"},
                headers=_auth(),
            )

            detail = await c.get(f"/api/v1/calls/{call_id}")
            assert detail.status_code == 200
            body = detail.json()
            assert body["call"]["caller"] == "+15195550123"
            assert [t["text"] for t in body["transcript"]] == ["hello"]

            deleted = await c.delete(f"/api/v1/calls/{call_id}")
            assert deleted.status_code == 204
            assert (await c.get(f"/api/v1/calls/{call_id}")).status_code == 404
    finally:
        container.unwire()


# ---- ingestion, and the token that guards it ------------------------------


@pytest.mark.parametrize(
    "path,payload",
    [
        ("start", {"room_name": "room-1"}),
        ("turn", {"room_name": "room-1", "role": "user", "text": "hello"}),
        ("finish", {"room_name": "room-1"}),
    ],
)
async def test_ingestion_refuses_a_request_with_no_token(calls_service, path, payload):
    app, container = _build_app(calls_service)
    try:
        async with _client(app) as c:
            resp = await c.post(f"/api/v1/internal/agent/calls/{path}", json=payload)
            assert resp.status_code in (401, 403), resp.text
            # Nothing was written on the way to being refused.
            assert (await c.get("/api/v1/calls/")).json()["total"] == 0
    finally:
        container.unwire()


async def test_ingestion_refuses_the_wrong_token(calls_service):
    app, container = _build_app(calls_service)
    try:
        async with _client(app) as c:
            resp = await c.post(
                "/api/v1/internal/agent/calls/start",
                json={"room_name": "room-1"},
                headers=_auth("not-the-token"),
            )
            assert resp.status_code == 403
            assert (await c.get("/api/v1/calls/")).json()["total"] == 0
    finally:
        container.unwire()


async def test_an_unset_service_token_closes_the_route_rather_than_opening_it(
    calls_service,
):
    """AGENT_SERVICE_TOKEN is empty in a fresh clone.

    Comparing against an empty expected value would accept an empty bearer, so
    an unconfigured backend would take writes from anyone who could reach it.
    """
    app, container = _build_app(calls_service, token="")
    try:
        async with _client(app) as c:
            for attempt in (_auth(""), _auth("anything"), _auth(TOKEN)):
                resp = await c.post(
                    "/api/v1/internal/agent/calls/start",
                    json={"room_name": "room-1"},
                    headers=attempt,
                )
                # An empty bearer never reaches the check: the scheme refuses
                # it first. Everything else is told the route is off rather
                # than being compared against an empty expected value.
                assert resp.status_code in (401, 403, 503), resp.text
                assert resp.status_code != 200
            assert (await c.get("/api/v1/calls/")).json()["total"] == 0
    finally:
        container.unwire()


async def test_the_worker_can_report_a_whole_call(calls_service):
    app, container = _build_app(calls_service)
    try:
        async with _client(app) as c:
            await c.post(
                "/api/v1/internal/agent/calls/start",
                json={
                    "room_name": "room-1",
                    "channel": "sip",
                    "caller": "+15195550123",
                    "started_at": "2026-08-09T12:00:00Z",
                },
                headers=_auth(),
            )
            # The same room again: a restarted worker must not be punished.
            again = await c.post(
                "/api/v1/internal/agent/calls/start",
                json={"room_name": "room-1", "channel": "sip"},
                headers=_auth(),
            )
            assert again.status_code == 200

            await c.post(
                "/api/v1/internal/agent/calls/turn",
                json={"room_name": "room-1", "role": "user", "text": "hello"},
                headers=_auth(),
            )
            finished = await c.post(
                "/api/v1/internal/agent/calls/finish",
                json={
                    "room_name": "room-1",
                    "status": "completed",
                    "ended_at": "2026-08-09T12:02:00Z",
                },
                headers=_auth(),
            )

            assert finished.status_code == 200
            body = finished.json()
            assert body["status"] == "completed"
            assert body["duration_seconds"] == 120
            assert body["turn_count"] == 1

            summary = (await c.get("/api/v1/calls/summary")).json()
            assert summary == {
                "total_calls": 1,
                "total_minutes": 2.0,
                "total_turns": 1,
            }
    finally:
        container.unwire()


async def test_a_turn_count_sent_on_finish_is_ignored_not_rejected(calls_service):
    """The worker keeps its own count and sends it. Two rules follow.

    It must not be a 422, or the shipped reporter cannot close a call. And it
    must not be believed either: the counter here is incremented per turn the
    backend actually stored, so trusting the worker's number would let a
    dropped turn produce a call whose count disagrees with its own transcript.
    """
    app, container = _build_app(calls_service)
    try:
        async with _client(app) as c:
            await c.post(
                "/api/v1/internal/agent/calls/start",
                json={"room_name": "room-1"},
                headers=_auth(),
            )
            await c.post(
                "/api/v1/internal/agent/calls/turn",
                json={"room_name": "room-1", "role": "user", "text": "hello"},
                headers=_auth(),
            )
            finished = await c.post(
                "/api/v1/internal/agent/calls/finish",
                json={
                    "room_name": "room-1",
                    "status": "completed",
                    "duration_seconds": 30,
                    "turn_count": 99,
                },
                headers=_auth(),
            )

        assert finished.status_code == 200, finished.text
        assert finished.json()["turn_count"] == 1
    finally:
        container.unwire()


async def test_reporting_a_turn_for_an_unknown_room_is_a_404_over_http(calls_service):
    app, container = _build_app(calls_service)
    try:
        async with _client(app) as c:
            resp = await c.post(
                "/api/v1/internal/agent/calls/turn",
                json={"room_name": "never-started", "role": "user", "text": "hello"},
                headers=_auth(),
            )
        assert resp.status_code == 404
    finally:
        container.unwire()


async def test_no_cost_field_reaches_the_console_over_the_wire(calls_service):
    """The schema guard covers the shape. This covers what is actually sent."""
    app, container = _build_app(calls_service)
    try:
        async with _client(app) as c:
            await c.post(
                "/api/v1/internal/agent/calls/start",
                json={"room_name": "room-1"},
                headers=_auth(),
            )
            listed = (await c.get("/api/v1/calls/")).json()
            summary = (await c.get("/api/v1/calls/summary")).json()

        banned = ("cost", "billed", "kept", "margin", "price", "usd")
        for payload in (listed, summary):
            rendered = str(payload).lower()
            assert not any(word in rendered for word in banned), payload
    finally:
        container.unwire()
