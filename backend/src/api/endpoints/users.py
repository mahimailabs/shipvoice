from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Query, status

from src.api.deps import AdminUser, CurrentUser
from src.core.config import Config
from src.core.container import Container
from src.core.exceptions import PermissionDeniedError
from src.models.users_model import User
from src.schemas.base_schema import FindBase
from src.schemas.users_schemas import (
    Token,
    UserCreate,
    UserLogin,
    UserRead,
    UserUpdate,
)
from src.services.users_service import UsersService

router = APIRouter(prefix="/users")


def _require_self_or_admin(actor: User, target_user_id: int) -> None:
    if actor.id != target_user_id and not actor.is_superuser:
        raise PermissionDeniedError(detail="Not permitted to access this user")


# ---- Credentials -----------------------------------------------------------


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    tags=["auth"],
)
@inject
async def register_user(
    payload: UserCreate,
    service: UsersService = Depends(Provide[Container.users_service]),
    config: Config = Depends(Provide[Container.config]),
):
    # Closed by default. This console reads call transcripts, so an open
    # register endpoint on a deployed instance hands them to whoever finds the
    # URL. The gate runs before the service so no row is created and refused.
    if not config.ALLOW_OPEN_REGISTRATION:
        raise PermissionDeniedError(
            detail="Registration is closed. Set ALLOW_OPEN_REGISTRATION=true to reopen it."
        )
    return await service.register(payload)


@router.post("/login", response_model=Token, tags=["auth"])
@inject
async def login(
    payload: UserLogin,
    service: UsersService = Depends(Provide[Container.users_service]),
) -> Token:
    return Token(access_token=await service.authenticate(payload))


# ---- Protected: require a valid Bearer token -------------------------------


@router.get("/me", response_model=UserRead, tags=["auth"])
async def read_me(current_user: CurrentUser):
    return current_user


@router.get(
    "",
    response_model=list[UserRead],
    tags=["users", "mcp-tools"],
    operation_id="list_users",
)
@inject
async def list_users(
    current_user: AdminUser,
    service: UsersService = Depends(Provide[Container.users_service]),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
):
    # Listing/enumerating all accounts is an admin-only operation. The gate is
    # the dependency, not a call inside the body that a future edit can drop.
    result = await service.get_list(
        FindBase(page=page, page_size=page_size, search=search),
        searchable_fields=["full_name", "email"],
    )
    return result["founds"]


@router.get(
    "/{user_id}",
    response_model=UserRead,
    tags=["users", "mcp-tools"],
    operation_id="get_user",
)
@inject
async def get_user(
    user_id: int,
    current_user: CurrentUser,
    service: UsersService = Depends(Provide[Container.users_service]),
):
    _require_self_or_admin(current_user, user_id)
    if user_id == current_user.id:
        return current_user
    return await service.get_by_id(user_id)


@router.patch("/{user_id}", response_model=UserRead, tags=["users"])
@inject
async def update_user(
    user_id: int,
    payload: UserUpdate,
    current_user: CurrentUser,
    service: UsersService = Depends(Provide[Container.users_service]),
):
    _require_self_or_admin(current_user, user_id)
    return await service.modify(user_id, payload)


@router.delete("/{user_id}", tags=["users"])
@inject
async def delete_user(
    user_id: int,
    current_user: CurrentUser,
    service: UsersService = Depends(Provide[Container.users_service]),
):
    _require_self_or_admin(current_user, user_id)
    return await service.remove_by_id(user_id)
