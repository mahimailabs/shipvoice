from datetime import UTC, datetime

from sqlalchemy import DateTime
from sqlmodel import Field

from src.models.base_model import BaseModel


def _now() -> datetime:
    return datetime.now(UTC)


class Call(BaseModel, table=True):
    """One conversation this deployment handled.

    The free console records what happened on a call: who called, on which
    channel, how long it ran, and how many turns were spoken. What the call
    cost is not recorded here and must not be added. Metering minutes and
    pricing them is the paid product's job, and a nullable cost column on a
    public table is an invitation to start filling it in.
    """

    __tablename__ = "call"

    # The room is the call's identity. The worker knows it before it knows
    # anything else, and it is what makes reporting idempotent across a
    # restart, so it is unique rather than merely indexed.
    room_name: str = Field(unique=True, index=True, nullable=False)
    caller: str | None = Field(default=None, nullable=True)
    channel: str = Field(default="web", nullable=False)
    agent_name: str | None = Field(default=None, nullable=True)
    business_name: str | None = Field(default=None, nullable=True)
    status: str = Field(default="active", nullable=False)
    started_at: datetime = Field(
        default_factory=_now,
        sa_type=DateTime(timezone=True),
        nullable=False,
    )
    ended_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),
        nullable=True,
    )
    # Null while the call is still running. The console renders a dash for it
    # rather than a zero, because an unmeasured call is not a zero-second call.
    duration_seconds: int | None = Field(default=None, nullable=True)
    turn_count: int = Field(default=0, nullable=False)


class Turn(BaseModel, table=True):
    """One thing said on a call, by the caller or by the agent."""

    __tablename__ = "turn"

    call_id: int = Field(foreign_key="call.id", index=True, nullable=False)
    role: str = Field(nullable=False)
    text: str = Field(nullable=False)
    spoken_at: datetime = Field(
        default_factory=_now,
        sa_type=DateTime(timezone=True),
        nullable=False,
    )
