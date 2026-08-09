from typing import cast

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends

from src.core.config import Config
from src.core.container import Container
from src.schemas.agents_schemas import AgentListResponse, AgentPattern, AgentSummary

router = APIRouter(prefix="/agents", tags=["agents"])


DECLARED_IN = "agent/src/agent.py"
DECLARED_STT = "deepgram nova-3"
DECLARED_LLM = "cerebras gemma-4-31b"
DECLARED_TTS = "inworld inworld-tts-2 (Ashley)"

PROMPT_PATH = "agent/prompts/instructions.md"


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
                # cast, not a second check: Config's validator has already
                # forced this into AGENT_PATTERNS, and pydantic still refuses
                # anything outside the union when this model is built. The
                # console cannot be shown a pattern this repo does not run.
                pattern=cast(AgentPattern, config.AGENT_PATTERN),
                active=True,
                prompt_path=PROMPT_PATH,
                stt=DECLARED_STT,
                llm=DECLARED_LLM,
                tts=DECLARED_TTS,
                declared_in=DECLARED_IN,
            )
        ]
    )
