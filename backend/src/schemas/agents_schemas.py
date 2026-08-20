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
    """The persona file as it is on disk, and where to edit it.

    Read only. The buyer changes what the agent says by opening the file this
    response names, and git is the version history. There is no companion write
    model here and there is not meant to be one.

    Every field is required. The console renders the prompt, its size and its
    path from one response, and an optional field would let it render half of
    that with no way to tell missing from absent.
    """

    slug: str
    # What to call the file in the UI, not where it lives on this host. The path
    # on disk differs per deployment and means nothing to the person reading it.
    # This is the field that stands where a platform would put a form.
    path: str
    # Empty when 'exists' is false. The worker falls back to a packaged default
    # in that case, so an empty prompt here is not an agent with no prompt.
    content: str
    exists: bool
    byte_size: int
    # Notes worth showing next to the prompt: the file is missing, empty, or
    # not the encoding it needs to be. Every one of them describes the file the
    # worker is reading right now.
    warnings: list[str]
