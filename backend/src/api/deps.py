"""Shared request dependencies.

These live here rather than in ``endpoints/users.py`` so that a new slice can
depend on the admin gate without importing another endpoint module.
"""

from typing import Annotated, cast

from dependency_injector.wiring import Provide, inject
from fastapi import Depends

from src.core.container import Container
from src.core.exceptions import PermissionDeniedError
from src.core.security import get_current_user
from src.models.users_model import User
from src.services.users_service import UsersService


@inject
async def get_current_user_record(
    user_id: Annotated[int, Depends(get_current_user)],
    service: UsersService = Depends(Provide[Container.users_service]),
) -> User:
    """Load the authenticated user's record (raises 404 if the account is gone)."""
    return cast(User, await service.get_by_id(user_id))


# The full authenticated user record; gives endpoints access to id + is_superuser.
CurrentUser = Annotated[User, Depends(get_current_user_record)]


async def get_current_admin(current_user: CurrentUser) -> User:
    """Refuse anyone who is merely signed in.

    Authenticated is not the same as entitled here. Registration can be
    reopened, and a self-registered account is a valid bearer of a valid token,
    so every surface that exposes call content depends on this rather than on
    ``CurrentUser``.
    """
    if not current_user.is_superuser:
        raise PermissionDeniedError(detail="Administrator privileges required")
    return current_user


AdminUser = Annotated[User, Depends(get_current_admin)]
