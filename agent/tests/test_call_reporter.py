"""The worker recording its calls, and the ways that must not cost a call."""

import asyncio
import json

import httpx
import pytest

from src.services import call_reporter
from src.services.call_reporter import CallReporter

BASE_URL = "http://backend:8000"
TOKEN = "service-token"

_REAL_CLIENT = httpx.AsyncClient


def _fake_transport(sink, *, status=200, raises=False):
    """Patch httpx so posts land in ``sink`` instead of on the network."""

    def handler(request: httpx.Request) -> httpx.Response:
        if raises:
            raise httpx.ConnectError("no route to host")
        body = json.loads(request.content) if request.content else {}
        sink.append(
            {
                "path": request.url.path,
                "payload": body,
                "auth": request.headers.get("authorization"),
            }
        )
        return httpx.Response(status, json={})

    def factory(**kwargs):
        return _REAL_CLIENT(transport=httpx.MockTransport(handler), **kwargs)

    return factory


@pytest.fixture
def sent(monkeypatch):
    sink: list[dict] = []
    monkeypatch.setattr(call_reporter.httpx, "AsyncClient", _fake_transport(sink))
    return sink


async def _one_call(reporter: CallReporter, *, status: str = "completed") -> None:
    await reporter.start(
        room_name="room-7",
        caller="+15195550123",
        channel="sip",
        agent_name="assistant",
        business_name="Test Business",
    )
    reporter.note_turn("user", "is anyone there")
    reporter.note_turn("assistant", "yes, how can I help")
    await reporter.finish(status)


async def test_a_whole_call_is_reported_in_order(sent):
    await _one_call(CallReporter(BASE_URL, TOKEN))

    assert [r["path"].rsplit("/", 1)[-1] for r in sent] == [
        "start",
        "turn",
        "turn",
        "finish",
    ]
    assert all(r["auth"] == f"Bearer {TOKEN}" for r in sent)
    assert sent[0]["path"] == "/api/v1/internal/agent/calls/start"

    start = sent[0]["payload"]
    assert start["room_name"] == "room-7"
    assert start["caller"] == "+15195550123"
    assert start["channel"] == "sip"
    assert start["agent_name"] == "assistant"
    assert start["business_name"] == "Test Business"


async def test_the_agents_own_turns_are_labelled_agent(sent):
    """The console's transcript has two roles, and 'assistant' is not one."""
    await _one_call(CallReporter(BASE_URL, TOKEN))

    roles = [r["payload"]["role"] for r in sent if r["path"].endswith("/turn")]
    assert roles == ["user", "agent"]
    for turn in (r for r in sent if r["path"].endswith("/turn")):
        assert turn["payload"]["room_name"] == "room-7"
        assert turn["payload"]["text"]
        assert turn["payload"]["spoken_at"]


async def test_finish_sends_the_duration_and_the_turn_count(sent):
    await _one_call(CallReporter(BASE_URL, TOKEN))

    finish = sent[-1]["payload"]
    assert finish["room_name"] == "room-7"
    assert finish["status"] == "completed"
    assert finish["turn_count"] == 2
    assert isinstance(finish["duration_seconds"], int)
    assert finish["duration_seconds"] >= 0


async def test_a_failed_call_is_reported_as_failed(sent):
    await _one_call(CallReporter(BASE_URL, TOKEN), status="failed")
    assert sent[-1]["payload"]["status"] == "failed"


async def test_reporting_is_a_no_op_when_disabled(sent):
    await _one_call(CallReporter(BASE_URL, TOKEN, enabled=False))
    assert sent == []


@pytest.mark.parametrize(
    ("base_url", "token"),
    [(None, TOKEN), (BASE_URL, None), (None, None), ("", "")],
)
async def test_reporting_is_a_no_op_without_a_url_or_a_token(sent, base_url, token):
    """Opt in means opt in. Half-configured is off, not broken."""
    reporter = CallReporter(base_url, token)
    assert reporter.enabled is False
    await _one_call(reporter)
    assert sent == []


async def test_an_unreachable_backend_never_reaches_the_call(monkeypatch):
    """The whole point: a log write failing must not fail a voice call."""
    sink: list[dict] = []
    monkeypatch.setattr(
        call_reporter.httpx, "AsyncClient", _fake_transport(sink, raises=True)
    )
    await _one_call(CallReporter(BASE_URL, TOKEN))


async def test_a_refused_token_never_reaches_the_call(monkeypatch):
    sink: list[dict] = []
    monkeypatch.setattr(
        call_reporter.httpx, "AsyncClient", _fake_transport(sink, status=403)
    )
    await _one_call(CallReporter(BASE_URL, TOKEN))


async def test_a_backend_error_never_reaches_the_call(monkeypatch):
    sink: list[dict] = []
    monkeypatch.setattr(
        call_reporter.httpx, "AsyncClient", _fake_transport(sink, status=500)
    )
    await _one_call(CallReporter(BASE_URL, TOKEN))


async def test_turns_are_not_dropped_when_the_call_ends(sent):
    """note_turn returns before the post happens, so finish must drain them."""
    reporter = CallReporter(BASE_URL, TOKEN)
    await reporter.start(room_name="room-9", caller=None, channel="web")
    for i in range(20):
        reporter.note_turn("user", f"turn {i}")
    await reporter.finish()

    assert len([r for r in sent if r["path"].endswith("/turn")]) == 20
    assert sent[-1]["payload"]["turn_count"] == 20


async def test_a_turn_with_no_call_started_is_ignored(sent):
    """A stray event before start() has no call to attach to."""
    reporter = CallReporter(BASE_URL, TOKEN)
    reporter.note_turn("user", "hello")
    await reporter.finish()
    assert sent == []


async def test_system_prompts_are_not_turns(sent):
    reporter = CallReporter(BASE_URL, TOKEN)
    await reporter.start(room_name="room-3", caller=None, channel="web")
    reporter.note_turn("system", "you are a helpful assistant")
    reporter.note_turn("user", "")
    await reporter.finish()

    assert [r["path"].rsplit("/", 1)[-1] for r in sent] == ["start", "finish"]
    assert sent[-1]["payload"]["turn_count"] == 0


class _HangingClient:
    """A backend that accepts the connection and then never answers."""

    def __init__(self, **kwargs) -> None:
        self.closed = False

    async def post(self, *args, **kwargs):
        await asyncio.sleep(30)

    async def aclose(self) -> None:
        self.closed = True


async def test_a_hanging_backend_does_not_hang_the_shutdown(monkeypatch):
    """finish() runs on the shutdown callback, so it must always come back."""
    monkeypatch.setattr(call_reporter.httpx, "AsyncClient", _HangingClient)

    reporter = CallReporter(BASE_URL, TOKEN, timeout=0.01)
    await reporter.start(room_name="room-1", caller=None, channel="web")
    reporter.note_turn("user", "hello")
    await asyncio.wait_for(reporter.finish(), timeout=5)


async def test_a_dead_backend_cannot_grow_the_queue_without_bound(monkeypatch):
    """Every failed post costs a timeout, so unsent reports have a ceiling."""
    monkeypatch.setattr(call_reporter.httpx, "AsyncClient", _HangingClient)
    monkeypatch.setattr(call_reporter, "QUEUE_LIMIT", 3)

    reporter = CallReporter(BASE_URL, TOKEN, timeout=0.01)
    await reporter.start(room_name="room-1", caller=None, channel="web")
    for i in range(50):
        reporter.note_turn("user", f"turn {i}")
    await asyncio.wait_for(reporter.finish(), timeout=5)


async def test_no_cost_field_leaks_into_a_report(sent):
    """Free records what happened on a call, never what it cost."""
    banned = {
        "cost",
        "cost_usd",
        "estimated_cost_usd",
        "billed",
        "billed_usd",
        "kept",
        "kept_usd",
        "margin",
        "price",
        "usage",
    }
    await _one_call(CallReporter(BASE_URL, TOKEN))
    assert sent, "nothing was reported, so this guard proved nothing"
    for report in sent:
        assert banned.isdisjoint(report["payload"].keys()), report


def test_console_mode_never_reports(monkeypatch):
    """Console mode is the run that needs no backend and no token."""
    monkeypatch.setattr(call_reporter.config, "BACKEND_API_URL", BASE_URL)
    monkeypatch.setattr(call_reporter.config, "BACKEND_API_TOKEN", TOKEN)
    monkeypatch.setattr(call_reporter.config, "BACKEND_REPORTING_ENABLED", True)

    assert CallReporter.from_config(console_mode=True).enabled is False
    assert CallReporter.from_config(console_mode=False).enabled is True


def test_reporting_is_off_unless_it_is_turned_on(monkeypatch):
    monkeypatch.setattr(call_reporter.config, "BACKEND_API_URL", BASE_URL)
    monkeypatch.setattr(call_reporter.config, "BACKEND_API_TOKEN", TOKEN)
    monkeypatch.setattr(call_reporter.config, "BACKEND_REPORTING_ENABLED", False)

    assert CallReporter.from_config().enabled is False


def test_the_entrypoint_closes_every_call_it_opens():
    """agent.py is excluded from coverage, so guard the wiring by reading it.

    finish() has to run on the shutdown callback specifically. Anywhere else
    and a dropped call leaves a row stuck on 'active' in the console forever.
    """
    import pathlib

    source = (
        pathlib.Path(__file__).resolve().parents[1] / "src" / "agent.py"
    ).read_text()

    assert "reporter.start(" in source, "no call is ever opened"
    assert "register_event_handlers(session, reporter)" in source, (
        "turns never reach the reporter"
    )
    shutdown = source.split("async def _on_shutdown()")[1].split(
        "ctx.add_shutdown_callback"
    )[0]
    assert "reporter.finish(" in shutdown, (
        "finish() must run on the shutdown callback, which is the only path "
        "that always runs"
    )
