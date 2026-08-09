"""What the voice worker reports about a call. Not for browsers.

Guarded by the same shared service token as /internal/livekit, imported rather
than reimplemented so there is one place that decides what a valid worker is.
An unset AGENT_SERVICE_TOKEN disables these routes instead of opening them.
"""

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends

from src.api.endpoints.internal_livekit import require_service_token
from src.core.container import Container
from src.schemas.calls_schemas import CallFinish, CallRead, CallStart, TurnAppend
from src.services.calls_service import CallsService

# The guard sits on the router, so a route added here later is guarded by
# construction rather than by whoever remembers to copy the decorator.
router = APIRouter(
    prefix="/internal/agent/calls",
    tags=["internal"],
    dependencies=[Depends(require_service_token)],
)


@router.post("/start", response_model=CallRead)
@inject
async def start_call(
    payload: CallStart,
    service: CallsService = Depends(Provide[Container.calls_service]),
) -> CallRead:
    """A call began. Idempotent: a restarted worker may report it again."""
    return await service.start_call(payload)


@router.post("/turn", response_model=CallRead)
@inject
async def append_turn(
    payload: TurnAppend,
    service: CallsService = Depends(Provide[Container.calls_service]),
) -> CallRead:
    """Something was said."""
    return await service.append_turn(payload)


@router.post("/finish", response_model=CallRead)
@inject
async def finish_call(
    payload: CallFinish,
    service: CallsService = Depends(Provide[Container.calls_service]),
) -> CallRead:
    """The call ended. The duration is derived unless the worker sends one."""
    return await service.finish_call(payload)
