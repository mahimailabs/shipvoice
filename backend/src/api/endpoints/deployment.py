from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends

from src.core.config import Config
from src.core.container import Container
from src.schemas.deployment_schemas import DeploymentRead

router = APIRouter(prefix="/deployment", tags=["deployment"])


@router.get("", response_model=DeploymentRead)
@inject
async def read_deployment(
    config: Config = Depends(Provide[Container.config]),
) -> DeploymentRead:
    """What this deployment is pointed at."""
    return DeploymentRead(
        project_name=config.PROJECT_NAME,
        env=str(config.ENV.value if hasattr(config.ENV, "value") else config.ENV),
        livekit_url=config.LIVEKIT_URL,
    )
