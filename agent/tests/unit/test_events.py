"""Session events reaching the call reporter."""

from livekit.agents.llm import ChatMessage

from src.core.events import register_event_handlers


class _FakeSession:
    """Stands in for AgentSession: collects handlers, then fires them."""

    def __init__(self) -> None:
        self.handlers: dict = {}

    def on(self, name: str):
        def register(fn):
            self.handlers[name] = fn
            return fn

        return register

    def emit(self, name: str, ev) -> None:
        self.handlers[name](ev)


class _Event:
    def __init__(self, item) -> None:
        self.item = item


class _RecordingReporter:
    def __init__(self) -> None:
        self.turns: list[tuple] = []

    def note_turn(self, role, text, spoken_at=None) -> None:
        self.turns.append((role, text, spoken_at))


def test_conversation_items_reach_the_reporter():
    session = _FakeSession()
    reporter = _RecordingReporter()
    register_event_handlers(session, reporter)

    session.emit(
        "conversation_item_added",
        _Event(ChatMessage(role="user", content=["is anyone there"])),
    )
    session.emit(
        "conversation_item_added",
        _Event(ChatMessage(role="assistant", content=["yes, how can I help"])),
    )

    assert [(role, text) for role, text, _ in reporter.turns] == [
        ("user", "is anyone there"),
        ("assistant", "yes, how can I help"),
    ]
    # The reporter is told when the turn happened, not when it was posted.
    assert all(spoken_at is not None for _, _, spoken_at in reporter.turns)


def test_events_still_work_with_no_reporter():
    """Console mode registers the same handlers with nothing to report to."""
    session = _FakeSession()
    log_usage_summary = register_event_handlers(session)

    session.emit(
        "conversation_item_added", _Event(ChatMessage(role="user", content=["hi"]))
    )
    log_usage_summary()
