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


class AgentPromptRead(BaseModel):
    """The persona file, and whether the console is allowed to rewrite it.

    Every field is required. The console renders a text area, a byte counter and
    a reason for a disabled save button from one response, and an optional field
    would let it render half of that with no way to tell missing from absent.
    """

    slug: str
    # What to call the file in the UI, not where it lives on this host. The path
    # on disk differs per deployment and means nothing to the person reading it.
    path: str
    # Empty when 'exists' is false. The worker falls back to a packaged default
    # in that case, so an empty editor is not an empty agent.
    content: str
    exists: bool
    editable: bool
    # Why a save would be refused. None exactly when 'editable' is true.
    read_only_reason: str | None
    byte_size: int
    max_bytes: int
    # Notes worth showing next to the editor. Never a reason a save failed: a
    # response carrying warnings is a response that already wrote the file.
    warnings: list[str]


class AgentPromptWrite(BaseModel):
    content: str
