"""The call log's rules, against a real database.

The service fixture is sqlite-backed (see tests/conftest.py), so idempotency,
the turn counter, and ordering are exercised for real rather than asserted
against a stub.
"""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException

from src.models.calls_model import Call, Turn
from src.schemas.calls_schemas import CallFinish, CallStart, TurnAppend
from src.services.calls_service import CallsService

START = datetime(2026, 8, 9, 12, 0, tzinfo=UTC)


def _start(room: str, **kwargs) -> CallStart:
    kwargs.setdefault("started_at", START)
    return CallStart(room_name=room, **kwargs)


async def test_the_start_of_a_call_is_recorded_as_active(calls_service: CallsService):
    call = await calls_service.start_call(
        _start("room-1", caller="+15195550123", channel="sip", agent_name="assistant")
    )

    assert call.status == "active"
    assert call.caller == "+15195550123"
    assert call.channel == "sip"
    assert call.turn_count == 0
    # Nothing has been measured yet, and an unmeasured call is not a zero.
    assert call.duration_seconds is None
    assert call.ended_at is None


async def test_reporting_the_same_room_twice_does_not_duplicate_the_call(
    calls_service: CallsService,
):
    """A worker that restarts mid-call reports its room again.

    That has to answer with the call already in the log. A 500 would make the
    worker retry forever, and a second row would split one conversation's
    transcript across two calls the console shows as unrelated.
    """
    first = await calls_service.start_call(_start("room-1", caller="+15195550123"))
    await calls_service.append_turn(
        TurnAppend(room_name="room-1", role="user", text="hello")
    )

    second = await calls_service.start_call(_start("room-1", caller="+15195550123"))

    assert second.id == first.id
    # The re-report must not reset what the first half of the call recorded.
    assert second.turn_count == 1
    assert (await calls_service.list_calls()).total == 1


async def test_a_turn_lands_on_the_transcript_and_bumps_the_counter(
    calls_service: CallsService,
):
    call = await calls_service.start_call(_start("room-1"))

    await calls_service.append_turn(
        TurnAppend(room_name="room-1", role="user", text="is anyone there")
    )
    latest = await calls_service.append_turn(
        TurnAppend(room_name="room-1", role="agent", text="yes, how can I help")
    )

    assert latest.turn_count == 2
    detail = await calls_service.get_call_with_turns(call.id)
    assert [t.role for t in detail.transcript] == ["user", "agent"]
    assert detail.transcript[0].text == "is anyone there"
    # The column the console prints and the transcript under it agree.
    assert detail.call.turn_count == len(detail.transcript)


async def test_a_turn_for_a_room_nobody_started_is_refused(
    calls_service: CallsService,
):
    with pytest.raises(HTTPException) as caught:
        await calls_service.append_turn(
            TurnAppend(room_name="never-started", role="user", text="hello")
        )

    assert caught.value.status_code == 404
    assert "never-started" in str(caught.value.detail)


async def test_finishing_a_call_derives_its_duration(calls_service: CallsService):
    await calls_service.start_call(_start("room-1"))

    finished = await calls_service.finish_call(
        CallFinish(room_name="room-1", ended_at=START + timedelta(seconds=95))
    )

    assert finished.status == "completed"
    assert finished.duration_seconds == 95
    assert finished.ended_at == START + timedelta(seconds=95)


async def test_a_worker_may_send_the_duration_it_measured_itself(
    calls_service: CallsService,
):
    """The wall clock and the audio are not the same number.

    A worker that excludes time spent waiting to connect knows better than the
    subtraction here, so its value wins.
    """
    await calls_service.start_call(_start("room-1"))

    finished = await calls_service.finish_call(
        CallFinish(
            room_name="room-1",
            status="failed",
            ended_at=START + timedelta(seconds=95),
            duration_seconds=12,
        )
    )

    assert finished.status == "failed"
    assert finished.duration_seconds == 12


async def test_a_clock_that_ran_backwards_does_not_yield_a_negative_duration(
    calls_service: CallsService,
):
    await calls_service.start_call(_start("room-1"))

    finished = await calls_service.finish_call(
        CallFinish(room_name="room-1", ended_at=START - timedelta(seconds=30))
    )

    assert finished.duration_seconds == 0


async def test_finishing_a_room_nobody_started_is_refused(calls_service: CallsService):
    with pytest.raises(HTTPException) as caught:
        await calls_service.finish_call(CallFinish(room_name="never-started"))

    assert caught.value.status_code == 404


async def test_the_list_is_newest_first_and_pages(calls_service: CallsService):
    for i in range(5):
        await calls_service.start_call(
            CallStart(room_name=f"room-{i}", started_at=START + timedelta(minutes=i))
        )

    page = await calls_service.list_calls(limit=2, offset=0)

    assert [c.room_name for c in page.calls] == ["room-4", "room-3"]
    # total counts the log, not the page, or the console's "showing 2 of 5"
    # would always read "2 of 2".
    assert page.total == 5
    assert [
        c.room_name for c in (await calls_service.list_calls(limit=2, offset=2)).calls
    ] == [
        "room-2",
        "room-1",
    ]


async def test_the_channel_and_status_filters_narrow_the_list(
    calls_service: CallsService,
):
    await calls_service.start_call(_start("web-active", channel="web"))
    await calls_service.start_call(_start("sip-active", channel="sip"))
    await calls_service.start_call(_start("sip-done", channel="sip"))
    await calls_service.finish_call(CallFinish(room_name="sip-done"))

    by_channel = await calls_service.list_calls(channel="sip")
    assert {c.room_name for c in by_channel.calls} == {"sip-active", "sip-done"}
    assert by_channel.total == 2

    by_status = await calls_service.list_calls(status="active")
    assert {c.room_name for c in by_status.calls} == {"web-active", "sip-active"}

    both = await calls_service.list_calls(channel="sip", status="completed")
    assert [c.room_name for c in both.calls] == ["sip-done"]
    assert both.total == 1


async def test_deleting_a_call_takes_its_transcript_with_it(
    calls_service: CallsService,
):
    """Leaving the turns behind would orphan rows against a live foreign key."""
    call = await calls_service.start_call(_start("room-1"))
    await calls_service.append_turn(
        TurnAppend(room_name="room-1", role="user", text="hello")
    )

    await calls_service.delete_call(call.id)

    assert (await calls_service.list_calls()).total == 0
    assert (await calls_service.summary()).total_turns == 0
    with pytest.raises(HTTPException) as caught:
        await calls_service.get_call_with_turns(call.id)
    assert caught.value.status_code == 404


async def test_deleting_a_call_that_is_already_gone_is_a_404(
    calls_service: CallsService,
):
    with pytest.raises(HTTPException) as caught:
        await calls_service.delete_call(4242)

    assert caught.value.status_code == 404


async def test_the_summary_counts_minutes_only_from_measured_calls(
    calls_service: CallsService,
):
    await calls_service.start_call(_start("done"))
    await calls_service.append_turn(
        TurnAppend(room_name="done", role="user", text="hello")
    )
    await calls_service.finish_call(
        CallFinish(room_name="done", ended_at=START + timedelta(seconds=90))
    )
    # Still in flight: it has no duration, so it contributes no minutes.
    await calls_service.start_call(_start("running"))

    summary = await calls_service.summary()

    assert summary.total_calls == 2
    assert summary.total_minutes == 1.5
    assert summary.total_turns == 1


async def test_an_empty_log_reports_zeroes_rather_than_failing(
    calls_service: CallsService,
):
    summary = await calls_service.summary()

    assert (summary.total_calls, summary.total_minutes, summary.total_turns) == (
        0,
        0,
        0,
    )


# ---- the line free does not cross ----------------------------------------

# Substrings, not exact names. The field that would appear here is not called
# "cost", it is called "estimated_cost_usd" and it arrives nullable with a
# comment saying it is just a placeholder.
BANNED = (
    "cost",
    "billed",
    "kept",
    "margin",
    "price",
    "pricing",
    "revenue",
    "usd",
    "charge",
)


def _offending(names) -> list[str]:
    return [n for n in names if any(word in n.lower() for word in BANNED)]


def test_no_cost_shaped_field_exists_on_any_calls_schema():
    """Free records what happened on a call. What it cost is the paid product.

    A nullable cost column in a public schema is an invitation to fill it in,
    so the guard is on the shape, not on whether anything populates it.
    """
    from pydantic import BaseModel as PydanticBaseModel

    from src.schemas import calls_schemas

    checked = 0
    for name in dir(calls_schemas):
        obj = getattr(calls_schemas, name)
        if isinstance(obj, type) and issubclass(obj, PydanticBaseModel):
            checked += 1
            assert not _offending(obj.model_fields.keys()), (
                f"{name} grew a cost-shaped field; metering belongs to Pro"
            )
    assert checked >= 8, "the schema sweep stopped finding schemas"


def test_no_cost_shaped_column_exists_on_the_call_tables():
    for table in (Call, Turn):
        assert not _offending(table.__table__.columns.keys()), (
            f"{table.__name__} grew a cost-shaped column; metering belongs to Pro"
        )


def test_the_tables_still_match_the_shipped_migration():
    """0002_calls.py is hand written, so nothing catches drift but this.

    Adding a column to the model without a migration works locally, because
    tests create the schema from the metadata, and then fails on a real
    deployment where alembic owns the schema. If this fails, write 0003.
    """
    assert set(Call.__table__.columns.keys()) == {
        "id",
        "uuid",
        "created_at",
        "updated_at",
        "room_name",
        "caller",
        "channel",
        "agent_name",
        "business_name",
        "status",
        "started_at",
        "ended_at",
        "duration_seconds",
        "turn_count",
    }
    assert set(Turn.__table__.columns.keys()) == {
        "id",
        "uuid",
        "created_at",
        "updated_at",
        "call_id",
        "role",
        "text",
        "spoken_at",
    }
