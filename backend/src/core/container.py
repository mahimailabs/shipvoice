import logging

from dependency_injector import containers, providers

from src.core.config import get_config
from src.core.database import Database
from src.repository.calls_repository import CallsRepository
from src.services.agent_prompt_service import AgentPromptService
from src.services.calls_service import CallsService
from src.services.token_service import TokenService

logger = logging.getLogger(__name__)


class Container(containers.DeclarativeContainer):
    wiring_config = containers.WiringConfiguration(
        modules=[
            "src.api.endpoints.agents",
            "src.api.endpoints.calls",
            "src.api.endpoints.livekit",
            "src.api.endpoints.internal_calls",
            "src.api.endpoints.deployment",
            "src.api.endpoints.token",
            # Not an endpoint module, but require_service_token is declared
            # there and @inject resolves its Provide markers against the module
            # it was defined in, not the router that depends on it.
            "src.api.service_token",
        ],
    )

    config = providers.Singleton(get_config)

    database = providers.Singleton(Database, config=config)

    # No database. The LiveKit project is environment, adopted at boot, so a
    # token can be minted before Postgres is up and while it is down.
    token_service = providers.Factory(
        TokenService,
        config=config,
    )

    # No database either. The persona is a file, and the worker reads that file
    # rather than anything this service could store.
    agent_prompt_service = providers.Factory(
        AgentPromptService,
        config=config,
    )

    calls_repository = providers.Factory(
        CallsRepository,
        session_factory=database.provided.session,
    )

    calls_service = providers.Factory(
        CallsService,
        repository=calls_repository,
    )
