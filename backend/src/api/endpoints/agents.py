from typing import cast

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, HTTPException, status

from src.core.config import Config
from src.core.container import Container
from src.schemas.agents_schemas import (
    AgentListResponse,
    AgentPattern,
    AgentPromptRead,
    AgentPromptWrite,
    AgentSummary,
)
from src.services.agent_prompt_service import (
    WRITES_DISABLED_REASON,
    AgentPromptService,
    PromptTooLargeError,
    PromptWriteFailedError,
)

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


def _known_agent_or_404(slug: str, config: Config) -> None:
    """This deployment runs one agent, and only it has a prompt to serve."""
    if slug == config.AGENT_NAME:
        return
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=(
            f"No agent named {slug!r} here. This deployment runs one agent and "
            f"it is called {config.AGENT_NAME!r}."
        ),
    )


# Two path segments with a literal at the end, so neither of these can shadow
# the list route above or each other. There is deliberately no bare
# "/{slug}" route: adding one later would have to be declared after these, or
# it would swallow every prompt request as a slug lookup.
@router.get("/{slug}/prompt", response_model=AgentPromptRead)
@inject
async def read_agent_prompt(
    slug: str,
    config: Config = Depends(Provide[Container.config]),
    service: AgentPromptService = Depends(Provide[Container.agent_prompt_service]),
) -> AgentPromptRead:
    """The agent's persona. 200 with exists=false when there is no file yet."""
    _known_agent_or_404(slug, config)
    return await service.read()


@router.put("/{slug}/prompt", response_model=AgentPromptRead)
@inject
async def write_agent_prompt(
    slug: str,
    payload: AgentPromptWrite,
    config: Config = Depends(Provide[Container.config]),
    service: AgentPromptService = Depends(Provide[Container.agent_prompt_service]),
) -> AgentPromptRead:
    """Rewrite the persona. The next call speaks it, with no restart."""
    # Before the write gate, so a typo in the slug reads as a typo rather than
    # as a permissions problem on an agent that does not exist.
    _known_agent_or_404(slug, config)
    if not config.CONSOLE_WRITES_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=WRITES_DISABLED_REASON,
        )
    try:
        return await service.write(payload.content)
    except PromptTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except PromptWriteFailedError as exc:
        # 409 rather than 500: the request was fine and the file is intact. What
        # failed is the deployment's ability to accept it, and the detail says
        # which mount to fix.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
