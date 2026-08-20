"""The worker's only credential.

One place decides what a valid worker is, so a second internal router added
later cannot quietly invent a looser rule. The token guards writes the voice
worker makes to the call log, which is the only writing anything does over this
API: the console never writes.
"""

import secrets

from dependency_injector.wiring import Provide, inject
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.core.config import Config
from src.core.container import Container

service_scheme = HTTPBearer(auto_error=True)


@inject
def require_service_token(
    credentials: HTTPAuthorizationCredentials = Depends(service_scheme),
    config: Config = Depends(Provide[Container.config]),
) -> None:
    expected = config.AGENT_SERVICE_TOKEN
    if not expected:
        # Unset closes the route rather than opening it: comparing against an
        # empty expected value would take writes from anyone who could reach it.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AGENT_SERVICE_TOKEN is not set, so this endpoint is disabled",
        )
    if not secrets.compare_digest(credentials.credentials, expected):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Bad service token"
        )
