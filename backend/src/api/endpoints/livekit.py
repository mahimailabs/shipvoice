from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, HTTPException, status

from src.core.config import Config
from src.core.container import Container
from src.core.enums import EnvironmentOption
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
    """The LiveKit project, without the secret.

    Safe to serve on an open backend: a url, four characters of the key, and
    whether a secret exists. Nothing here is usable as a credential.
    """
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
    """Change the LiveKit project. Refused outside dev.

    This backend has no authentication. An open write that repoints the LiveKit
    project would let anyone who can reach the port take over the calls, so it
    is allowed only where the console is what it was designed to be: a tool on
    the machine you are sitting at. Deployed instances edit the env and restart.
    """
    if config.ENV != EnvironmentOption.DEV:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Editing LiveKit credentials over the API is only allowed when "
                "ENV=dev, because this backend has no authentication. Set them "
                "in the environment and restart."
            ),
        )
    try:
        return await service.write(payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
