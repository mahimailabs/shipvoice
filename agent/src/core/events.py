import logging
from collections.abc import Callable
from datetime import UTC, datetime

from livekit.agents import AgentSession
from livekit.agents.llm import ChatMessage

from src.services.call_reporter import CallReporter

logger = logging.getLogger("agent")


def register_event_handlers(
    session: AgentSession, reporter: CallReporter | None = None
) -> Callable[[], None]:
    """Attach generic logging + usage handlers to a session.

    Pass a reporter to also send each spoken turn to the backend, which is what
    gives the console's Call detail page a transcript.

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
            if reporter is not None:
                # Queues and returns. The reporter owns the network call so
                # this handler, which runs on the audio path, never waits.
                reporter.note_turn(
                    item.role,
                    item.text_content,
                    datetime.fromtimestamp(item.created_at, tz=UTC),
                )

    @session.on("session_usage_updated")
    def _on_usage(ev) -> None:
        latest_usage["value"] = ev.usage

    def log_usage_summary() -> None:
        if "value" in latest_usage:
            logger.info("usage summary: %s", latest_usage["value"])

    return log_usage_summary
