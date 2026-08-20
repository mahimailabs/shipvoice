"""The console never writes.

Configuration lives in files and in the environment. The console reads the
running configuration and the call history, and where a platform would show a
form it shows the path of the file to edit. A rule like that only survives if
something enforces it, because it does not come back as a redesign: it comes
back one convenience endpoint at a time.

So this asserts the shape of the whole API rather than the behaviour of any one
route. Adding a write to agents or to configuration fails here, whatever it is
called and wherever it is declared.
"""

from src.api.routes import routers

# The verbs that change something the console displays.
MUTATING = {"PUT", "PATCH", "DELETE"}

# The two POSTs that are not configuration changes, named individually so a
# third one has to be argued for here rather than added quietly.
#
#   /v1/token                     mints a signed room token and stores nothing
#   /v1/internal/agent/calls/*    the call log, written by the process that
#                                 placed the call, behind the service token
ALLOWED_POSTS = {
    "/v1/token",
    "/v1/internal/agent/calls/start",
    "/v1/internal/agent/calls/turn",
    "/v1/internal/agent/calls/finish",
}


def _routes() -> list[tuple[str, str]]:
    """(method, path) for every route the app mounts, ignoring HEAD/OPTIONS."""
    found = []
    for route in routers.routes:
        path = getattr(route, "path", "")
        for method in getattr(route, "methods", set()) or set():
            if method in {"HEAD", "OPTIONS"}:
                continue
            found.append((method, path))
    return found


def test_no_route_anywhere_mutates():
    offenders = [(m, p) for m, p in _routes() if m in MUTATING]
    assert offenders == [], (
        f"{offenders} would let the console change something. Configuration is "
        "files: the buyer edits the file and restarts, and git is the history."
    )


def test_the_only_posts_are_the_token_mint_and_the_worker_s_call_reports():
    posts = {p for m, p in _routes() if m == "POST"}
    assert posts == ALLOWED_POSTS


def test_the_agents_resource_is_read_only():
    """The prompt is a file. The console reports its path instead of a form."""
    agents = [(m, p) for m, p in _routes() if p.startswith("/v1/agents")]
    assert agents, "the agents routes are gone entirely"
    assert all(m == "GET" for m, _ in agents), agents


def test_the_livekit_resource_is_read_only():
    livekit = [(m, p) for m, p in _routes() if p.startswith("/v1/livekit")]
    assert livekit, "the LiveKit read is gone entirely"
    assert all(m == "GET" for m, _ in livekit), livekit


def test_no_write_schema_survives_for_the_configuration_resources():
    """The route is half of it. A request model is the other half.

    A leftover AgentPromptWrite or LiveKitWrite is a write endpoint that has
    already been written and only needs a decorator, so they go too.
    """
    from src.schemas import agents_schemas, livekit_schemas

    for module in (agents_schemas, livekit_schemas):
        leftovers = [name for name in dir(module) if name.endswith("Write")]
        assert leftovers == [], f"{module.__name__} still carries {leftovers}"


def test_there_is_no_configuration_table():
    """The absence is the architecture, not an omission.

    Every table registered on the metadata is the call log. A model added for
    settings, credentials or prompts would show up here first.
    """
    from sqlmodel import SQLModel

    import src.models  # noqa: F401  (registers the tables)

    assert set(SQLModel.metadata.tables) == {"call", "turn"}
