from pydantic import BaseModel


class AgentSummary(BaseModel):
    """One agent, as the backend can honestly describe it.

    The provider fields are DECLARED, not observed. They are compiled into the
    worker at 'agent/src/agent.py' and the backend cannot see that process, so
    the console presents them as what the file says rather than as a reading.
    'tests/unit/test_agents_endpoint.py' reads that file and fails if these
    drift from it.
    """

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
