import logging

from dependency_injector import containers, providers

from src.core.config import get_config
from src.core.database import Database
from src.services.token_service import TokenService

logger = logging.getLogger(__name__)


class Container(containers.DeclarativeContainer):
    wiring_config = containers.WiringConfiguration(
        modules=[
            "src.api.endpoints.agents",
            "src.api.endpoints.deployment",
            "src.api.endpoints.token",
        ],
    )

    config = providers.Singleton(get_config)

    database = providers.Singleton(Database, config=config)

    # Stateless: depends only on config (LiveKit key/secret/url).
    token_service = providers.Factory(
        TokenService,
        config=config,
    )
