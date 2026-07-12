import logging
from collections.abc import Callable

from livekit.agents import AgentSession
from livekit.agents.llm import ChatMessage

logger = logging.getLogger("agent")


def register_event_handlers(session: AgentSession) -> Callable[[], None]:
    """Attach generic logging + usage handlers to a session.

    Returns a callable that logs the cumulative usage summary, suitable for use
    as a shutdown callback.
    """
    latest_usage: dict = {}

    @session.on("user_state_changed")
    def _on_user_state_changed(ev) -> None:
        logger.info("user_state: %s -> %s", getattr(ev, "old_state", "?"), ev.new_state)

    @session.on("agent_state_changed")
    def _on_agent_state_changed(ev) -> None:
        logger.info(
            "agent_state: %s -> %s", getattr(ev, "old_state", "?"), ev.new_state
        )

    @session.on("conversation_item_added")
    def _on_item_added(ev) -> None:
        item = ev.item
        if isinstance(item, ChatMessage) and item.text_content:
            logger.info("%s: %s", item.role, item.text_content)

    @session.on("session_usage_updated")
    def _on_usage(ev) -> None:
        latest_usage["value"] = ev.usage

    def log_usage_summary() -> None:
        if "value" in latest_usage:
            logger.info("usage summary: %s", latest_usage["value"])

    return log_usage_summary
