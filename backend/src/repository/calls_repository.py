"""Persistence for the call log.

SQL lives here. Decisions (what a duration is, what happens when a room is
reported twice) live in the service. Anything that has to be one transaction,
such as writing a turn and bumping the call's counter, is one method here.
"""

import logging
from collections.abc import Callable, Sequence
from contextlib import AbstractAsyncContextManager
from datetime import datetime
from typing import NamedTuple

from sqlalchemy import ColumnElement
from sqlalchemy import select as sa_select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import case, col, delete, func, select

from src.models.calls_model import Call, Turn

logger = logging.getLogger(__name__)


class OverviewCounts(NamedTuple):
    """One read of the call log, for the Overview page's live numbers.

    Named rather than a six-wide tuple because the caller would otherwise have
    to count positions to tell the two window counts apart, and getting that
    pair the wrong way round produces a failure rate above 100% that still
    looks like a number.
    """

    started_today: int
    total_seconds: int
    active: int
    failed_in_window: int
    started_in_window: int
    last_started_at: datetime | None


def _count_where(condition: ColumnElement[bool]) -> ColumnElement[int]:
    """Count the rows matching `condition` inside a wider aggregate.

    COUNT over a CASE rather than COUNT with a FILTER clause: FILTER wants
    sqlite 3.30, and this has to answer the same on the sqlite the tests run
    on and the Postgres a deployment runs on. COUNT skips the nulls the CASE
    leaves behind and returns 0 rather than NULL over an empty table, so no
    branch here has to coalesce.
    """
    return func.count(case((condition, 1)))


class CallsRepository:
    def __init__(
        self,
        session_factory: Callable[..., AbstractAsyncContextManager[AsyncSession]],
    ) -> None:
        self._session_factory = session_factory

    @staticmethod
    async def _by_room(session: AsyncSession, room_name: str) -> Call | None:
        result = await session.execute(
            select(Call).where(col(Call.room_name) == room_name)
        )
        return result.scalars().first()

    async def get_by_room(self, room_name: str) -> Call | None:
        async with self._session_factory() as session:
            return await self._by_room(session, room_name)

    async def insert(self, call: Call) -> Call | None:
        """The stored call, or None when that room is already in the log.

        None rather than an exception because a duplicate room is not an error
        here: it is a worker that restarted mid-call, and the caller re-reads.
        """
        async with self._session_factory() as session:
            session.add(call)
            try:
                await session.commit()
            except IntegrityError:
                await session.rollback()
                return None
            await session.refresh(call)
            return call

    async def append_turn(
        self, room_name: str, role: str, text: str, spoken_at: datetime
    ) -> Call | None:
        """Write the turn and bump the call's counter, or None if no such call.

        One transaction on purpose. A transcript line that lands without its
        counter makes the console's turn column disagree with the transcript
        under it, and nobody can tell which one is lying.
        """
        async with self._session_factory() as session:
            call = await self._by_room(session, room_name)
            if call is None or call.id is None:
                return None
            session.add(
                Turn(call_id=call.id, role=role, text=text, spoken_at=spoken_at)
            )
            call.turn_count += 1
            session.add(call)
            await session.commit()
            await session.refresh(call)
            return call

    async def finish(
        self,
        room_name: str,
        status: str,
        ended_at: datetime,
        duration_seconds: int | None,
    ) -> Call | None:
        async with self._session_factory() as session:
            call = await self._by_room(session, room_name)
            if call is None:
                return None
            call.status = status
            call.ended_at = ended_at
            call.duration_seconds = duration_seconds
            session.add(call)
            await session.commit()
            await session.refresh(call)
            return call

    async def page(
        self,
        limit: int,
        offset: int,
        channel: str | None = None,
        status: str | None = None,
    ) -> tuple[Sequence[Call], int]:
        """One page of calls, newest first, plus the total the filter matches."""
        async with self._session_factory() as session:
            query = select(Call)
            if channel is not None:
                query = query.where(col(Call.channel) == channel)
            if status is not None:
                query = query.where(col(Call.status) == status)

            counted = await session.execute(
                select(func.count()).select_from(query.subquery())
            )
            total = int(counted.scalar() or 0)

            # id breaks the tie: two calls can start in the same millisecond,
            # and an unstable order makes paging skip and repeat rows.
            rows = await session.execute(
                query.order_by(col(Call.started_at).desc(), col(Call.id).desc())
                .limit(limit)
                .offset(offset)
            )
            return rows.scalars().all(), total

    async def get_with_turns(self, call_id: int) -> tuple[Call, Sequence[Turn]] | None:
        async with self._session_factory() as session:
            call = await session.get(Call, call_id)
            if call is None:
                return None
            rows = await session.execute(
                select(Turn)
                .where(col(Turn.call_id) == call_id)
                .order_by(col(Turn.spoken_at), col(Turn.id))
            )
            return call, rows.scalars().all()

    async def delete(self, call_id: int) -> bool:
        """Remove a call and its transcript. False when it was already gone."""
        async with self._session_factory() as session:
            call = await session.get(Call, call_id)
            if call is None:
                return False
            # Turns first. The foreign key will not let them stay pointed at a
            # call that no longer exists.
            await session.execute(delete(Turn).where(col(Turn.call_id) == call_id))
            await session.delete(call)
            await session.commit()
            return True

    async def counts_since(
        self, since: datetime
    ) -> tuple[list[tuple[str | None, int]], list[tuple[str | None, int]]]:
        """(by agent, by channel) over calls that started at or after `since`.

        Grouped in SQL rather than by reading the window into memory and
        counting there. The console asks for this on every page load, and the
        counts are the whole answer: the rows themselves are never wanted.
        """
        async with self._session_factory() as session:
            window = col(Call.started_at) >= since
            agents = await session.execute(
                select(col(Call.agent_name), func.count())
                .where(window)
                .group_by(col(Call.agent_name))
            )
            channels = await session.execute(
                select(col(Call.channel), func.count())
                .where(window)
                .group_by(col(Call.channel))
            )
            return (
                [(row[0], int(row[1])) for row in agents.all()],
                [(row[0], int(row[1])) for row in channels.all()],
            )

    async def overview_counts(
        self, day_start: datetime, window_start: datetime
    ) -> OverviewCounts:
        """Every live number the Overview page needs, in one read.

        One query rather than five. The failed count and the population it is
        a rate over have to come from the same read: two queries can straddle
        a call that lands between them and produce six failures out of five
        calls, which the page renders as a rate above 100%.

        sqlmodel's select() is typed for at most four entities, so this one
        goes through SQLAlchemy's, which is typed for ten. Everything else in
        this file selects fewer and stays on sqlmodel's.
        """
        in_window = col(Call.started_at) >= window_start

        async with self._session_factory() as session:
            result = await session.execute(
                sa_select(
                    _count_where(col(Call.started_at) >= day_start),
                    # Null while a call is still running, and SUM over nothing
                    # but nulls is null, so an empty log needs the coalesce.
                    func.coalesce(func.sum(col(Call.duration_seconds)), 0),
                    # Bounded to the same window as the failure rate. 'active'
                    # is only cleared by a finish report, and a worker killed
                    # mid-call never sends one, so an unbounded count would
                    # carry that row as "in flight right now" for the life of
                    # the deployment. A call still genuinely running is minutes
                    # old, not days.
                    _count_where(in_window & (col(Call.status) == "active")),
                    _count_where(in_window & (col(Call.status) == "failed")),
                    _count_where(in_window),
                    # The newest start, not the newest end: a call that is
                    # still running is the freshest thing the worker sent.
                    func.max(col(Call.started_at)),
                ).select_from(Call)
            )
            # An aggregate with no GROUP BY answers with exactly one row even
            # when the table is empty, so this cannot raise on a fresh clone.
            row = result.one()
            return OverviewCounts(
                started_today=int(row[0]),
                total_seconds=int(row[1]),
                active=int(row[2]),
                failed_in_window=int(row[3]),
                started_in_window=int(row[4]),
                last_started_at=row[5],
            )

    async def totals(self) -> tuple[int, int, int]:
        """(calls, seconds, turns) across the whole log."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(
                    func.count(),
                    func.coalesce(func.sum(col(Call.duration_seconds)), 0),
                    func.coalesce(func.sum(col(Call.turn_count)), 0),
                ).select_from(Call)
            )
            row = result.one()
            return int(row[0]), int(row[1]), int(row[2])
