import logging

from dependency_injector import containers, providers

from src.core.config import get_config
from src.core.database import Database
from src.repository.calls_repository import CallsRepository
from src.services.agent_prompt_service import AgentPromptService
from src.services.calls_service import CallsService
from src.services.livekit_settings_service import LiveKitSettingsService
from src.services.token_service import TokenService

logger = logging.getLogger(__name__)


class Container(containers.DeclarativeContainer):
    wiring_config = containers.WiringConfiguration(
        modules=[
            "src.api.endpoints.agents",
            "src.api.endpoints.calls",
            "src.api.endpoints.livekit",
            "src.api.endpoints.internal_calls",
            "src.api.endpoints.internal_livekit",
            "src.api.endpoints.deployment",
            "src.api.endpoints.token",
        ],
    )

    config = providers.Singleton(get_config)

    database = providers.Singleton(Database, config=config)

    livekit_settings_service = providers.Factory(
        LiveKitSettingsService,
        session_factory=database.provided.session,
        config=config,
    )

    # Signs tokens with whatever the settings service says is current.
    token_service = providers.Factory(
        TokenService,
        settings=livekit_settings_service,
    )

    # No database. The persona is a file, and the worker reads that file rather
    # than anything this service could store.
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
