import logging

from dependency_injector import containers, providers

from src.core.config import get_config
from src.core.database import Database
from src.repository.users_repository import UsersRepository
from src.services.token_service import TokenService
from src.services.users_service import UsersService

logger = logging.getLogger(__name__)


class Container(containers.DeclarativeContainer):
    wiring_config = containers.WiringConfiguration(
        modules=[
            "src.api.deps",
            "src.api.endpoints.users",
            "src.api.endpoints.token",
        ],
    )

    config = providers.Singleton(get_config)

    database = providers.Singleton(Database, config=config)

    # Repositories
    users_repository = providers.Factory(
        UsersRepository,
        session_factory=database.provided.session,
    )

    users_service = providers.Factory(
        UsersService,
        repository=users_repository,
    )

    # Stateless: depends only on config (LiveKit key/secret/url).
    token_service = providers.Factory(
        TokenService,
        config=config,
    )
