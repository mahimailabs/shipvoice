import logging

from livekit.agents import Agent

from src.core.config import config
from src.prompts.instructions import INSTRUCTIONS

logger = logging.getLogger("agent")


class Assistant(Agent):
    """A minimal, general-purpose voice assistant.

    Extend per project: add ``@function_tool`` methods for tool calling, or hand
    off to an ``AgentTask`` for structured multi-step flows.
    """

    def __init__(self, agent_name: str | None = None) -> None:
        super().__init__(
            instructions=INSTRUCTIONS.format(agent_name=agent_name or config.AGENT_NAME)
        )

    async def on_enter(self) -> None:
        # Speak first so the user hears the agent immediately on connect.
        self.session.generate_reply(
            instructions="Greet the user warmly in one short sentence and offer to help."
        )
