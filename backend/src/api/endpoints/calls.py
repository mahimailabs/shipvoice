from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Query, Response, status

from src.core.container import Container
from src.schemas.calls_schemas import (
    CallChannel,
    CallDetailResponse,
    CallListResponse,
    CallRollupResponse,
    CallStatus,
    CallSummaryResponse,
)
from src.services.calls_service import (
    MAX_PAGE_SIZE,
    MAX_ROLLUP_DAYS,
    CallsService,
)

router = APIRouter(prefix="/calls", tags=["calls"])


# The trailing slash is deliberate and the console depends on it. Declaring
# this as "" would make /api/v1/calls/ a 307 to /api/v1/calls, and a redirected
# cross-origin GET is a second round trip for every page load.
@router.get("/", response_model=CallListResponse)
@inject
async def list_calls(
    limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    # Typed rather than free strings: an unknown channel is a caller bug, and
    # answering it with the unfiltered log would look like the filter worked.
    channel: CallChannel | None = None,
    status: CallStatus | None = None,
    service: CallsService = Depends(Provide[Container.calls_service]),
) -> CallListResponse:
    """This deployment's calls, newest first."""
    return await service.list_calls(
        limit=limit, offset=offset, channel=channel, status=status
    )


# Declared before /{call_id}. Routes match in order, and an int path parameter
# does not fall through to the next route when it fails to parse: /summary
# would answer 422 instead of reaching this.
@router.get("/summary", response_model=CallSummaryResponse)
@inject
async def read_summary(
    service: CallsService = Depends(Provide[Container.calls_service]),
) -> CallSummaryResponse:
    """The rollup behind the Overview page. Counts and minutes, no money."""
    return await service.summary()


# Declared before /{call_id} for the same reason /summary is: this route's
# path is a word, and the route below it takes an int. Swap them and /rollup
# answers 422 and the Agents page loses its counts.
@router.get("/rollup", response_model=CallRollupResponse)
@inject
async def read_rollup(
    days: int = Query(7, ge=1, le=MAX_ROLLUP_DAYS),
    service: CallsService = Depends(Provide[Container.calls_service]),
) -> CallRollupResponse:
    """Calls in the last `days`, by agent and by channel. Counts, no money."""
    return await service.rollup(days=days)


@router.get("/{call_id}", response_model=CallDetailResponse)
@inject
async def read_call(
    call_id: int,
    service: CallsService = Depends(Provide[Container.calls_service]),
) -> CallDetailResponse:
    """One call and everything said on it."""
    return await service.get_call_with_turns(call_id)


@router.delete("/{call_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_call(
    call_id: int,
    service: CallsService = Depends(Provide[Container.calls_service]),
) -> Response:
    """Remove a call and its transcript. 404 when it is already gone."""
    await service.delete_call(call_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
