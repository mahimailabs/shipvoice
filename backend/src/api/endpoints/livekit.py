"""The LiveKit project the backend booted with, as a read.

A window, not a form. The project comes from LIVEKIT_URL, LIVEKIT_API_KEY and
LIVEKIT_API_SECRET in the environment, so changing it is an edit to .env and a
restart. That is acceptable because the buyer is the operator: they own the
file and the process.
"""

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends

from src.core.config import Config
from src.core.container import Container
from src.schemas.livekit_schemas import LiveKitRead

router = APIRouter(prefix="/livekit", tags=["livekit"])


def _hint(api_key: str | None) -> str | None:
    """Last four characters, enough to tell two projects apart."""
    if not api_key:
        return None
    return f"...{api_key[-4:]}" if len(api_key) > 4 else "..."


@router.get("", response_model=LiveKitRead)
@inject
async def read_livekit(
    config: Config = Depends(Provide[Container.config]),
) -> LiveKitRead:
    """The LiveKit project, without the secret."""
    return LiveKitRead(
        url=config.LIVEKIT_URL,
        api_key_hint=_hint(config.LIVEKIT_API_KEY),
        # Whether one is set, never the value. The secret signs room tokens and
        # nothing that reaches a browser has any use for it.
        secret_set=config.LIVEKIT_API_SECRET is not None,
    )
