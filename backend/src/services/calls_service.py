"""The call log's rules.

What a duration is, what happens when a room is reported twice, and what the
console is allowed to read back. Cost is not one of those things: the free
console reports what happened on a call, never what it cost.
"""

import logging
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta

from src.core.exceptions import DuplicatedError, NotFoundError
from src.models.calls_model import Call
from src.repository.calls_repository import CallsRepository
from src.schemas.calls_schemas import (
    AgentCallCount,
    CallDetailResponse,
    CallFinish,
    CallListResponse,
    CallOverviewResponse,
    CallRead,
    CallRollupResponse,
    CallStart,
    CallSummaryResponse,
    ChannelCallCount,
    FailedCallRate,
    LastReport,
    TurnAppend,
    TurnRead,
)

logger = logging.getLogger(__name__)

# The console asks for 50. The cap stops one request asking for the whole log.
MAX_PAGE_SIZE = 200

# The console asks for 7. A year is the far end of what a rollup means.
MAX_ROLLUP_DAYS = 365

# What a call groups under when nobody recorded which agent took it. A call
# that happened is not a call that did not, so it is counted under a name
# rather than dropped.
UNKNOWN_GROUP = "unknown"

# The window the Overview's failed rate is measured over, and the number the
# console prints beside it. One constant, so the label cannot drift from the
# window it describes.
FAILED_WINDOW_HOURS = 24


def _tally(rows: Iterable[tuple[str | None, int]]) -> list[tuple[str, int]]:
    """Fold (name, count) rows into a stable, biggest-first list.

    Folded rather than mapped one to one, because the missing name resolves to
    a real string: a log holding both nulls and an agent literally called
    "unknown" must answer with one row, not two rows the console prints twice.
    """
    totals: dict[str, int] = {}
    for name, count in rows:
        key = (name or "").strip() or UNKNOWN_GROUP
        totals[key] = totals.get(key, 0) + count
    # The name breaks the tie. Two agents on the same count would otherwise
    # swap places between requests and reorder the chart under the reader.
    return sorted(totals.items(), key=lambda item: (-item[1], item[0]))


def _aware(value: datetime) -> datetime:
    """Treat a naive timestamp as UTC.

    Every writer here stores datetime.now(UTC). A driver that hands the value
    back without an offset would otherwise make the subtraction below raise
    TypeError on the one call that matters, the finished one.
    """
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


class CallsService:
    def __init__(self, repository: CallsRepository) -> None:
        self._repository = repository

    # ---- ingestion (the worker) -------------------------------------------

    async def start_call(self, payload: CallStart) -> CallRead:
        """Record the start of a call. Idempotent on room_name.

        A worker that restarts mid-call reports the same room again. That must
        answer with the call already in the log, not a 500 and not a second row
        that splits one conversation's transcript in two.
        """
        existing = await self._repository.get_by_room(payload.room_name)
        if existing is not None:
            return CallRead.model_validate(existing)

        created = await self._repository.insert(
            Call(
                room_name=payload.room_name,
                caller=payload.caller,
                channel=payload.channel,
                agent_name=payload.agent_name,
                business_name=payload.business_name,
                status="active",
                started_at=payload.started_at or datetime.now(UTC),
            )
        )
        if created is None:
            # Two workers reported the same room at once and the other won.
            # Re-read rather than fail: they are describing the same call.
            existing = await self._repository.get_by_room(payload.room_name)
            if existing is None:
                raise DuplicatedError(
                    detail=(
                        f"Room {payload.room_name!r} was reported twice at once "
                        "and then removed. Report it again."
                    )
                )
            return CallRead.model_validate(existing)
        return CallRead.model_validate(created)

    async def append_turn(self, payload: TurnAppend) -> CallRead:
        call = await self._repository.append_turn(
            room_name=payload.room_name,
            role=payload.role,
            text=payload.text,
            spoken_at=payload.spoken_at or datetime.now(UTC),
        )
        if call is None:
            raise NotFoundError(detail=self._unknown_room(payload.room_name))
        return CallRead.model_validate(call)

    async def finish_call(self, payload: CallFinish) -> CallRead:
        call = await self._repository.get_by_room(payload.room_name)
        if call is None:
            raise NotFoundError(detail=self._unknown_room(payload.room_name))

        ended_at = payload.ended_at or datetime.now(UTC)
        duration = payload.duration_seconds
        if duration is None:
            elapsed = (_aware(ended_at) - _aware(call.started_at)).total_seconds()
            # Clamped: a worker whose clock ran backwards should report an
            # instant call, not a negative one the console renders as "-0m".
            duration = max(0, int(elapsed))

        finished = await self._repository.finish(
            room_name=payload.room_name,
            status=payload.status,
            ended_at=ended_at,
            duration_seconds=duration,
        )
        if finished is None:
            raise NotFoundError(detail=self._unknown_room(payload.room_name))
        return CallRead.model_validate(finished)

    # ---- reads (the console) ----------------------------------------------

    async def list_calls(
        self,
        limit: int = 50,
        offset: int = 0,
        channel: str | None = None,
        status: str | None = None,
    ) -> CallListResponse:
        rows, total = await self._repository.page(
            limit=min(max(limit, 1), MAX_PAGE_SIZE),
            offset=max(offset, 0),
            channel=channel,
            status=status,
        )
        return CallListResponse(
            calls=[CallRead.model_validate(row) for row in rows], total=total
        )

    async def get_call_with_turns(self, call_id: int) -> CallDetailResponse:
        found = await self._repository.get_with_turns(call_id)
        if found is None:
            raise NotFoundError(detail=f"No call {call_id} in the log.")
        call, turns = found
        return CallDetailResponse(
            call=CallRead.model_validate(call),
            transcript=[TurnRead.model_validate(turn) for turn in turns],
        )

    async def rollup(self, days: int = 7) -> CallRollupResponse:
        """Calls in the last `days`, split by agent and by channel.

        The window is measured back from now, so seven days means the last
        seven times twenty four hours and not the last seven dates on a
        calendar. A call that started before it is out, however recently it
        ended: the log's own clock is when a call began.
        """
        days = min(max(days, 1), MAX_ROLLUP_DAYS)
        since = datetime.now(UTC) - timedelta(days=days)
        agent_rows, channel_rows = await self._repository.counts_since(since)

        by_agent = _tally(agent_rows)
        by_channel = _tally(channel_rows)
        return CallRollupResponse(
            days=days,
            # Added up from the rows rather than counted in its own query. Two
            # queries can straddle a call that lands between them, and a total
            # the breakdowns do not sum to is worse than a total one second
            # stale: the console draws all three together.
            total=sum(count for _, count in by_agent),
            by_agent=[
                AgentCallCount(agent_name=name, calls=count) for name, count in by_agent
            ],
            by_channel=[
                ChannelCallCount(channel=name, calls=count)
                for name, count in by_channel
            ],
        )

    async def overview(self) -> CallOverviewResponse:
        """The live numbers on the Overview page.

        Today is the UTC day. This backend stores UTC and the request says
        nothing about where the reader is sitting, so a local midnight would
        be a guess wearing the clothes of a fact: pick the server's zone and a
        reader four hours west sees a day that ended before their evening did.
        UTC is at least a day the reader can name and check.

        Nothing here divides. The failed count ships with the population it
        came out of and the console does the arithmetic it wants, which is
        also why a window holding no calls at all is a pair of zeroes rather
        than a rate nobody can compute.
        """
        # One clock for the whole answer. Reading now() again per number would
        # let the window and the heartbeat disagree about when the page was.
        now = datetime.now(UTC)
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        window_start = now - timedelta(hours=FAILED_WINDOW_HOURS)

        counts = await self._repository.overview_counts(day_start, window_start)

        return CallOverviewResponse(
            calls_today=counts.started_today,
            # Rounded here rather than in the page, so two readers of the same
            # deployment never disagree about the number.
            metered_minutes=round(counts.total_seconds / 60, 1),
            active=counts.active,
            failed=FailedCallRate(
                count=counts.failed_in_window,
                of=counts.started_in_window,
                window_hours=FAILED_WINDOW_HOURS,
            ),
            last_report=self._last_report(counts.last_started_at, now),
        )

    @staticmethod
    def _last_report(last_started_at: datetime | None, now: datetime) -> LastReport:
        """The metering seam's heartbeat, or nulls when nothing has run here.

        A fresh clone has never been reported to, and that is not an error and
        not zero seconds ago. The page prints nothing rather than a time that
        would read as a call.
        """
        if last_started_at is None:
            return LastReport(at=None, seconds_ago=None)
        elapsed = (now - _aware(last_started_at)).total_seconds()
        # Clamped. The worker and this backend keep separate clocks, and one
        # running a second ahead stamps a start in the future, which would
        # otherwise print as a call reported minus one seconds ago.
        return LastReport(at=last_started_at, seconds_ago=max(0, int(elapsed)))

    async def summary(self) -> CallSummaryResponse:
        calls, seconds, turns = await self._repository.totals()
        return CallSummaryResponse(
            total_calls=calls,
            total_minutes=round(seconds / 60, 2),
            total_turns=turns,
        )

    @staticmethod
    def _unknown_room(room_name: str) -> str:
        return (
            f"No call in the log for room {room_name!r}. Report the start of "
            "the call before its turns or its end."
        )
