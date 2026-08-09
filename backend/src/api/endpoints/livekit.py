from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, HTTPException, status

from src.core.config import Config
from src.core.container import Container
from src.schemas.livekit_schemas import LiveKitRead, LiveKitWrite
from src.services.livekit_settings_service import LiveKitSettingsService

router = APIRouter(prefix="/livekit", tags=["livekit"])


@router.get("", response_model=LiveKitRead)
@inject
async def read_livekit(
    service: LiveKitSettingsService = Depends(
        Provide[Container.livekit_settings_service]
    ),
) -> LiveKitRead:
    """The LiveKit project, without the secret."""
    return await service.read()


@router.put("", response_model=LiveKitRead)
@inject
async def write_livekit(
    payload: LiveKitWrite,
    service: LiveKitSettingsService = Depends(
        Provide[Container.livekit_settings_service]
    ),
    config: Config = Depends(Provide[Container.config]),
) -> LiveKitRead:
    """Change the LiveKit project. Refused outside dev."""
    if not config.CONSOLE_WRITES_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Editing LiveKit credentials over the API is disabled. This "
                "backend has no authentication, so an open write would let "
                "anyone who can reach it repoint your calls. Set "
                "CONSOLE_WRITES_ENABLED=true only where that is safe."
            ),
        )
    try:
        return await service.write(payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
