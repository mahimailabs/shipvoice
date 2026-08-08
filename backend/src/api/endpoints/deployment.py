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
    """What this deployment is pointed at.

    Deliberately narrow. It reports the LiveKit project URL, which the browser
    is handed on every token request anyway, and whether registration is open,
    which is a posture the operator should be able to read without shelling
    into a container.

    It reports no key, no secret, and no database detail. If a field here would
    be useful to an attacker who cannot already see it, it does not belong.
    """
    return DeploymentRead(
        project_name=config.PROJECT_NAME,
        env=str(config.ENV.value if hasattr(config.ENV, "value") else config.ENV),
        livekit_url=config.LIVEKIT_URL,
        allow_open_registration=config.ALLOW_OPEN_REGISTRATION,
        cors_origins=config.BACKEND_CORS_ORIGINS,
    )
