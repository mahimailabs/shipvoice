from typing import Literal

from pydantic import BaseModel

# The two shapes a call runs in here, as a closed set the console can switch
# on. AGENT_PATTERNS in src/core/config.py is the other half of this: it is
# what forces an unrecognised env var back to "sequential", so nothing outside
# this union can reach the field below.
AgentPattern = Literal["sequential", "supervisor"]


class AgentSummary(BaseModel):
    """One agent, as the backend can honestly describe it."""

    slug: str
    agent_name: str
    business_name: str | None
    # Declared by the deployment, not inferred from the worker.
    pattern: AgentPattern
    active: bool
    prompt_path: str
    stt: str | None
    llm: str | None
    tts: str | None
    declared_in: str


class AgentListResponse(BaseModel):
    agents: list[AgentSummary]
