from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends

from src.core.config import Config
from src.core.container import Container
from src.schemas.agents_schemas import AgentListResponse, AgentSummary

router = APIRouter(prefix="/agents", tags=["agents"])


DECLARED_IN = "agent/src/agent.py"
DECLARED_STT = "deepgram nova-3"
DECLARED_LLM = "openai gpt-4.1-mini"
DECLARED_TTS = "cartesia (plugin default)"

PROMPT_PATH = "agent/src/prompts/instructions.py"


@router.get("", response_model=AgentListResponse)
@inject
async def list_agents(
    config: Config = Depends(Provide[Container.config]),
) -> AgentListResponse:
    """List the agents this deployment runs."""
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
