"""The call log's wire contract.

The console's types.ts is the other half of this file. Field names and shapes
here match it exactly, so changing one without the other breaks the pages.

There are no cost, billed, kept, or margin fields, and none may be added. Free
records what happened on a call. What it cost is the paid product.
"""

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

CallChannel = Literal["web", "sip"]
CallStatus = Literal["active", "completed", "failed"]
TurnRole = Literal["user", "agent"]


def _as_utc(value: datetime | None) -> datetime | None:
    """Stamp UTC on a naive timestamp instead of shipping an ambiguous one.

    Every writer in this repo stores datetime.now(UTC), so a naive value coming
    back is a driver that dropped the offset, not an unknown zone. Without this
    the console's new Date() reads the string as local time and the transcript
    drifts by the reader's timezone.
    """
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


class CallRead(BaseModel):
    """One call, as the console sees it."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    room_name: str
    caller: str | None
    channel: CallChannel
    agent_name: str | None
    business_name: str | None
    status: CallStatus
    started_at: datetime
    ended_at: datetime | None
    duration_seconds: int | None
    turn_count: int

    @field_validator("started_at", "ended_at")
    @classmethod
    def stamp_utc(cls, v: datetime | None) -> datetime | None:
        return _as_utc(v)


class CallListResponse(BaseModel):
    calls: list[CallRead]
    # Every call matching the filter, not the size of this page. The console
    # prints it next to the page it is showing.
    total: int


class TurnRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: TurnRole
    text: str
    spoken_at: datetime

    @field_validator("spoken_at")
    @classmethod
    def stamp_utc(cls, v: datetime) -> datetime:
        stamped = _as_utc(v)
        assert stamped is not None
        return stamped


class CallDetailResponse(BaseModel):
    call: CallRead
    transcript: list[TurnRead]


class CallSummaryResponse(BaseModel):
    total_calls: int
    # Derived from duration_seconds, so calls still in flight contribute
    # nothing rather than a zero.
    total_minutes: float
    total_turns: int


class AgentCallCount(BaseModel):
    """How many calls one agent took inside the window."""

    # A plain string, not the agent's slug and not an enum. A call whose agent
    # nobody recorded is grouped under the literal "unknown" rather than being
    # dropped, because a call that happened is not a call that did not.
    agent_name: str
    calls: int


class ChannelCallCount(BaseModel):
    """How many calls arrived on one channel inside the window."""

    # str rather than CallChannel. The list route validates what it serves and
    # a value it does not know is a 422 the caller can fix. A rollup is a count
    # of what is already in the log, and refusing to serve the count because
    # one old row says something unexpected takes the whole page down.
    channel: str
    calls: int


class CallRollupResponse(BaseModel):
    """Calls in a recent window, split by agent and by channel.

    Counts only. Which agent took the calls, and where they came from. What
    those minutes cost is the paid product, same as everywhere else here.
    """

    # Echoed back so the console can label its own chart without assuming the
    # window it asked for is the window it got.
    days: int
    # Every call in the window. by_agent and by_channel each add up to it.
    total: int
    by_agent: list[AgentCallCount]
    by_channel: list[ChannelCallCount]


class FailedCallRate(BaseModel):
    """Failed calls inside one window, and the calls they came out of."""

    count: int
    # Every call that started in the same window, failed or not. The count and
    # the population it is a rate over are read together on purpose: shipping
    # a percentage instead would hide whether the window held three calls or
    # three hundred, and the reader cannot tell a bad night from a bad agent
    # without it.
    of: int
    # Echoed back so the console labels its own row instead of hardcoding 24h
    # and drifting the day this constant changes.
    window_hours: int


class LastReport(BaseModel):
    """When the worker last reported a call to this backend.

    The heartbeat of the agent-to-backend seam. The worker posts the start of
    a call the moment it picks up, so the newest start is the newest proof the
    seam is alive. Both fields are null on an empty log: never is not a time,
    and it is not zero seconds ago either.
    """

    at: datetime | None
    # Whole seconds, and never negative. The worker stamps started_at from its
    # own clock, so one running a little ahead of this backend reports a call
    # that has not happened yet. That is skew, not a call from the future.
    seconds_ago: int | None

    @field_validator("at")
    @classmethod
    def stamp_utc(cls, v: datetime | None) -> datetime | None:
        return _as_utc(v)


class CallOverviewResponse(BaseModel):
    """The live numbers on the Overview page.

    Only what this deployment measures itself. Everything else the page shows
    is either a sample it labels as one or a dash, and none of it comes from
    here.
    """

    # Calls that started since UTC midnight. See CallsService.overview for why
    # the day is UTC and not the reader's.
    calls_today: int
    # Duration summed across the whole log, in minutes to one decimal. Minutes
    # measured, not minutes billed: what a minute is worth is the paid product.
    metered_minutes: float
    # Calls still open, within the same window as 'failed'. 'active' is only
    # cleared by a finish report, so a worker killed mid-call leaves a row that
    # never closes. Unbounded, that row would be counted as in flight forever.
    active: int
    failed: FailedCallRate
    last_report: LastReport


class CallStart(BaseModel):
    """The worker reporting that a call began."""

    room_name: str = Field(min_length=1)
    caller: str | None = None
    channel: CallChannel = "web"
    agent_name: str | None = None
    business_name: str | None = None
    # Optional so a worker that batches its reports can say when the call
    # actually started rather than when the request arrived.
    started_at: datetime | None = None


class TurnAppend(BaseModel):
    """One line of transcript."""

    room_name: str = Field(min_length=1)
    role: TurnRole
    text: str
    spoken_at: datetime | None = None


class CallFinish(BaseModel):
    """The worker reporting that a call ended."""

    room_name: str = Field(min_length=1)
    # A finished call is completed or failed. It cannot go back to active.
    status: Literal["completed", "failed"] = "completed"
    ended_at: datetime | None = None
    # Optional: the backend derives it from started_at when the worker does not
    # send one. A worker that knows better, for instance one that excludes time
    # spent waiting to connect, can send its own.
    duration_seconds: int | None = Field(default=None, ge=0)
