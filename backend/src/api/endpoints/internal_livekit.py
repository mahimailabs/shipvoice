import secrets

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.core.config import Config
from src.core.container import Container
from src.schemas.livekit_schemas import LiveKitCredentials
from src.services.livekit_settings_service import LiveKitSettingsService

router = APIRouter(prefix="/internal/livekit", tags=["internal"])

service_scheme = HTTPBearer(auto_error=True)


@inject
def require_service_token(
    credentials: HTTPAuthorizationCredentials = Depends(service_scheme),
    config: Config = Depends(Provide[Container.config]),
) -> None:
    """The worker's only credential.

    Fails closed on an unset token. An empty AGENT_SERVICE_TOKEN comparing equal
    to an empty header would turn the one endpoint that serves the LiveKit
    secret into a public one.
    """
    expected = config.AGENT_SERVICE_TOKEN
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AGENT_SERVICE_TOKEN is not set, so this endpoint is disabled",
        )
    if not secrets.compare_digest(credentials.credentials, expected):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Bad service token"
        )


@router.get(
    "",
    response_model=LiveKitCredentials,
    dependencies=[Depends(require_service_token)],
)
@inject
async def read_credentials(
    service: LiveKitSettingsService = Depends(
        Provide[Container.livekit_settings_service]
    ),
) -> LiveKitCredentials:
    """The full LiveKit credentials, for the voice worker only.

    This is the one place the secret leaves the process, which is why it is the
    one place with a credential in front of it. The worker polls this and
    restarts itself when the revision changes, so editing the project in the
    console reaches the worker instead of silently diverging from it.
    """
    creds = await service.credentials()
    revision = await service.revision()
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LiveKit is not configured",
        )
    url, key, secret = creds
    return LiveKitCredentials(
        url=url, api_key=key, api_secret=secret, revision=revision
    )
