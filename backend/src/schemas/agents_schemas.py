from pydantic import BaseModel


class AgentSummary(BaseModel):
    """One agent, as the backend can honestly describe it."""

    slug: str
    agent_name: str
    business_name: str | None
    active: bool
    prompt_path: str
    stt: str | None
    llm: str | None
    tts: str | None
    declared_in: str


class AgentListResponse(BaseModel):
    agents: list[AgentSummary]
