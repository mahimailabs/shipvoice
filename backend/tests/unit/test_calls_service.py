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


# ---- the rollup behind the Agents page ------------------------------------

# Measured from now, not from START, because the window is measured from now.
# Pinning these to a literal date would pass this week and fail next week.
NOW = datetime.now(UTC)


async def test_the_rollup_counts_only_calls_that_started_inside_the_window(
    calls_service: CallsService,
):
    """The window is the filter, and it is the call's start that it filters on.

    A call still running counts: it started inside the window, and the Agents
    page is showing what this agent has been doing, not what it has finished.
    """
    await calls_service.start_call(
        CallStart(
            room_name="recent",
            agent_name="assistant",
            started_at=NOW - timedelta(days=2),
        )
    )
    await calls_service.start_call(
        CallStart(
            room_name="ancient",
            agent_name="assistant",
            started_at=NOW - timedelta(days=30),
        )
    )

    week = await calls_service.rollup(days=7)

    assert week.days == 7
    assert week.total == 1
    assert [(r.agent_name, r.calls) for r in week.by_agent] == [("assistant", 1)]

    # Widen the window and the older call comes back, which says what was
    # excluded was the window and not the row.
    assert (await calls_service.rollup(days=60)).total == 2


async def test_a_call_whose_agent_nobody_recorded_is_counted_under_unknown(
    calls_service: CallsService,
):
    """A call that happened is not a call that did not.

    Dropping the unnamed ones makes the breakdown disagree with the Calls page
    for no reason the reader can see.
    """
    await calls_service.start_call(
        CallStart(room_name="named", agent_name="assistant", started_at=NOW)
    )
    await calls_service.start_call(CallStart(room_name="anonymous", started_at=NOW))
    # An empty name is not a name either, and it would otherwise print a row
    # with no label on it.
    await calls_service.start_call(
        CallStart(room_name="blank", agent_name="   ", started_at=NOW)
    )

    rollup = await calls_service.rollup()

    assert rollup.total == 3
    assert [(r.agent_name, r.calls) for r in rollup.by_agent] == [
        ("unknown", 2),
        ("assistant", 1),
    ]


async def test_an_agent_actually_called_unknown_merges_with_the_unnamed(
    calls_service: CallsService,
):
    """Otherwise the console prints two rows under one label and neither is
    wrong, which is the worst kind of wrong."""
    await calls_service.start_call(
        CallStart(room_name="a", agent_name="unknown", started_at=NOW)
    )
    await calls_service.start_call(CallStart(room_name="b", started_at=NOW))

    rollup = await calls_service.rollup()

    assert [(r.agent_name, r.calls) for r in rollup.by_agent] == [("unknown", 2)]
    assert rollup.total == 2


async def test_the_rollup_is_biggest_first_and_breaks_a_tie_on_the_name(
    calls_service: CallsService,
):
    for i in range(3):
        await calls_service.start_call(
            CallStart(room_name=f"busy-{i}", agent_name="busy", started_at=NOW)
        )
    await calls_service.start_call(
        CallStart(room_name="zulu-1", agent_name="zulu", started_at=NOW)
    )
    await calls_service.start_call(
        CallStart(room_name="alpha-1", agent_name="alpha", started_at=NOW)
    )

    rollup = await calls_service.rollup()

    assert [(r.agent_name, r.calls) for r in rollup.by_agent] == [
        ("busy", 3),
        # Equal counts settle on the name. Left to the database's own order
        # these two would swap between requests and the legend would reshuffle
        # itself under someone reading it.
        ("alpha", 1),
        ("zulu", 1),
    ]


async def test_the_rollup_splits_the_same_calls_by_channel(
    calls_service: CallsService,
):
    for room in ("web-1", "web-2"):
        await calls_service.start_call(
            CallStart(room_name=room, channel="web", started_at=NOW)
        )
    await calls_service.start_call(
        CallStart(room_name="sip-1", channel="sip", started_at=NOW)
    )

    rollup = await calls_service.rollup()

    assert [(r.channel, r.calls) for r in rollup.by_channel] == [("web", 2), ("sip", 1)]
    # Both breakdowns describe the same calls, so both add up to the total. The
    # console draws all three together and they have to agree.
    assert sum(r.calls for r in rollup.by_channel) == rollup.total == 3
    assert sum(r.calls for r in rollup.by_agent) == rollup.total


# ---- the live numbers behind the Overview page ----------------------------

# Today's UTC midnight, the boundary calls_today is measured from. Read once
# here for the same reason NOW is: the service reads its own, and pinning a
# literal date would pass today and fail tomorrow.
TODAY_START = NOW.replace(hour=0, minute=0, second=0, microsecond=0)


async def test_the_overview_of_an_empty_log_is_zeroes_and_nulls(
    calls_service: CallsService,
):
    """A fresh clone renders the Overview before it has taken a call.

    Every count is a zero, and the two window numbers are a pair of zeroes
    rather than a rate: nothing here divides, so nothing here can divide by
    the zero an empty window hands it.
    """
    overview = await calls_service.overview()

    assert overview.calls_today == 0
    assert overview.metered_minutes == 0
    assert overview.active == 0
    assert (overview.failed.count, overview.failed.of) == (0, 0)
    assert overview.failed.window_hours == 24
    # Never reported is not a time and not zero seconds ago.
    assert overview.last_report.at is None
    assert overview.last_report.seconds_ago is None


async def test_calls_today_counts_from_utc_midnight(calls_service: CallsService):
    """Today is the UTC day, and the boundary is the call's start.

    A second either side of midnight decides it, so both sides are here: the
    off-by-one that counts yesterday's last call is invisible on any day the
    deployment was quiet overnight.
    """
    await calls_service.start_call(
        CallStart(room_name="first-of-the-day", started_at=TODAY_START)
    )
    await calls_service.start_call(
        CallStart(
            room_name="last-of-yesterday", started_at=TODAY_START - timedelta(seconds=1)
        )
    )
    await calls_service.start_call(
        CallStart(room_name="yesterday", started_at=NOW - timedelta(days=1))
    )

    overview = await calls_service.overview()

    assert overview.calls_today == 1
    # The other two are in the log, they are just not today. A filter that
    # dropped rows rather than excluding them would look identical here.
    assert (await calls_service.list_calls()).total == 3


async def test_the_overview_counts_the_calls_still_in_flight(
    calls_service: CallsService,
):
    """Active is what the Health panel reads, counted inside the same window."""
    await calls_service.start_call(CallStart(room_name="running", started_at=NOW))
    await calls_service.start_call(CallStart(room_name="done", started_at=NOW))
    await calls_service.finish_call(
        CallFinish(room_name="done", ended_at=NOW + timedelta(seconds=90))
    )
    await calls_service.start_call(CallStart(room_name="broken", started_at=NOW))
    await calls_service.finish_call(
        CallFinish(
            room_name="broken", status="failed", ended_at=NOW + timedelta(seconds=40)
        )
    )

    overview = await calls_service.overview()

    assert overview.active == 1
    # 130 seconds measured across the log, to one decimal. The running call
    # has no duration yet and contributes nothing rather than a zero.
    assert overview.metered_minutes == 2.2


async def test_the_failed_rate_is_a_count_over_the_calls_in_the_same_window(
    calls_service: CallsService,
):
    """count and of are one window's worth, so the pair is a rate.

    A failure counted against a population from some other window is the one
    way this number can read fine and be wrong, so the call outside the window
    is here to be excluded from both halves and not just from one.
    """
    for room in ("failed-1", "failed-2"):
        await calls_service.start_call(
            CallStart(room_name=room, started_at=NOW - timedelta(hours=1))
        )
        await calls_service.finish_call(CallFinish(room_name=room, status="failed"))
    await calls_service.start_call(
        CallStart(room_name="fine", started_at=NOW - timedelta(hours=1))
    )
    await calls_service.finish_call(CallFinish(room_name="fine"))
    await calls_service.start_call(
        CallStart(
            room_name="failed-the-day-before", started_at=NOW - timedelta(hours=30)
        )
    )
    await calls_service.finish_call(
        CallFinish(room_name="failed-the-day-before", status="failed")
    )

    overview = await calls_service.overview()

    assert (overview.failed.count, overview.failed.of) == (2, 3)
    assert overview.failed.window_hours == 24


async def test_the_last_report_is_the_newest_start_not_the_newest_end(
    calls_service: CallsService,
):
    """The seam is proved alive by what the worker last sent.

    It sends the start the moment it picks up, so a long call still running is
    fresher news than an older one that has just ended. Reading the newest end
    would show a stale heartbeat on a deployment that is busy right now.
    """
    await calls_service.start_call(
        CallStart(room_name="older", started_at=NOW - timedelta(minutes=10))
    )
    await calls_service.start_call(
        CallStart(room_name="newer", started_at=NOW - timedelta(minutes=1))
    )
    await calls_service.finish_call(CallFinish(room_name="older", ended_at=NOW))

    overview = await calls_service.overview()

    assert overview.last_report.at == NOW - timedelta(minutes=1)
    assert overview.last_report.seconds_ago is not None
    # A real age measured against the request's own clock, not a stored one.
    assert 60 <= overview.last_report.seconds_ago < 300


async def test_a_worker_clock_running_ahead_does_not_age_a_call_backwards(
    calls_service: CallsService,
):
    """started_at is the worker's clock, and it drifts from this backend's.

    A worker a few seconds ahead reports a call that has not happened yet.
    That is skew, and the honest reading of it is 0s ago, not a negative age
    the page renders as a bug in itself.
    """
    await calls_service.start_call(
        CallStart(
            room_name="from-the-future",
            started_at=datetime.now(UTC) + timedelta(hours=1),
        )
    )

    overview = await calls_service.overview()

    assert overview.last_report.seconds_ago == 0
    # Still reported, and still stamped with the time the worker claimed.
    assert overview.last_report.at is not None


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


async def test_a_call_left_open_by_a_dead_worker_stops_counting_as_in_flight(
    calls_service: CallsService,
):
    """'active' is only cleared by a finish report, which a killed worker never sends.

    Unbounded, that one row would be reported as a call in flight for the life
    of the deployment.
    """
    await calls_service.start_call(
        CallStart(room_name="stale", started_at=NOW - timedelta(hours=30))
    )
    await calls_service.start_call(
        CallStart(room_name="live", started_at=NOW - timedelta(minutes=2))
    )

    overview = await calls_service.overview()

    assert overview.active == 1
