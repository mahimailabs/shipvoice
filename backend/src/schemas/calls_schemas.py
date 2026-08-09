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
