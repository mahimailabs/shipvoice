from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends

from src.core.config import Config
from src.core.container import Container
from src.schemas.agents_schemas import AgentListResponse, AgentSummary

router = APIRouter(prefix="/agents", tags=["agents"])

# The worker builds its session with these, at agent/src/agent.py. They are
# constants there, not configuration, so the backend cannot read them from the
# environment and must not pretend to observe them. A drift test asserts these
# still match the file.
DECLARED_IN = "agent/src/agent.py"
DECLARED_STT = "deepgram nova-3"
DECLARED_LLM = "openai gpt-4.1-mini"
# Cartesia is constructed as cartesia.TTS() with no model argument, so the
# plugin default applies. Naming a model here would be a guess.
DECLARED_TTS = "cartesia (plugin default)"

# The prompt the worker actually loads today. It is a Python constant, not
# a data file; the console links to it so the buyer knows where to edit.
PROMPT_PATH = "agent/src/prompts/instructions.py"


@router.get("", response_model=AgentListResponse)
@inject
async def list_agents(
    config: Config = Depends(Provide[Container.config]),
) -> AgentListResponse:
    """List the agents this deployment runs.

    One worker serves one agent, selected by AGENT_NAME, so this returns a
    single row.

    Unauthenticated, because the console has no sign-in. What it exposes is the
    agent's name and the provider names already published in this repo's source
    and README, so there is nothing here a reader of the repo does not have.
    Adding "_actor: AdminUser" from src.api.deps gates it if you want it gated.
    """
    return AgentListResponse(
        agents=[
            AgentSummary(
                slug=config.AGENT_NAME,
                agent_name=config.AGENT_NAME,
                business_name=config.BUSINESS_NAME,
                active=True,
                prompt_path=PROMPT_PATH,
                stt=DECLARED_STT,
                llm=DECLARED_LLM,
                tts=DECLARED_TTS,
                declared_in=DECLARED_IN,
            )
        ]
    )
