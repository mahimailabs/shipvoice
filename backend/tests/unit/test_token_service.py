import pytest
from fastapi import HTTPException
from livekit.api import TokenVerifier

from src.core.config import Config
from src.schemas.token_schemas import RoomTokenRequest
from src.services.token_service import TokenService

KEY = "devkey"
SECRET = "devsecret-devsecret-devsecret-1234"
URL = "wss://example.livekit.cloud"


def _config(**overrides) -> Config:
    # Explicit values, not just _env_file=None: src/core/config.py calls
    # load_dotenv() at import, so a developer's real .env is already in
    # os.environ and pydantic-settings would read it.
    return Config(
        ENV="dev",
        _env_file=None,
        **{
            "LIVEKIT_URL": URL,
            "LIVEKIT_API_KEY": KEY,
            "LIVEKIT_API_SECRET": SECRET,
            **overrides,
        },
    )


def _service() -> TokenService:
    return TokenService(_config())


def _claims(token: str):
    return TokenVerifier(KEY, SECRET).verify(token)


async def test_mints_token_with_requested_room_and_identity():
    resp = await _service().create_room_token(
        RoomTokenRequest(
            room_name="r1", participant_identity="alice", participant_name="Alice"
        )
    )
    assert resp.server_url == URL
    claims = _claims(resp.participant_token)
    assert claims.identity == "alice"
    assert claims.name == "Alice"
    assert claims.video.room == "r1"
    assert claims.video.room_join is True
    assert claims.video.can_publish is True
    assert claims.video.can_subscribe is True


async def test_generates_defaults_when_fields_missing():
    claims = _claims(
        (await _service().create_room_token(RoomTokenRequest())).participant_token
    )
    assert claims.identity.startswith("user-")
    assert claims.video.room.startswith("room-")


async def test_metadata_and_attributes_are_encoded():
    resp = await _service().create_room_token(
        RoomTokenRequest(
            participant_metadata="hello", participant_attributes={"tier": "pro"}
        )
    )
    claims = _claims(resp.participant_token)
    assert claims.metadata == "hello"
    assert claims.attributes["tier"] == "pro"


async def test_room_config_enables_agent_dispatch():
    resp = await _service().create_room_token(
        RoomTokenRequest(
            room_name="r", room_config={"agents": [{"agentName": "assistant"}]}
        )
    )
    claims = _claims(resp.participant_token)
    assert claims.room_config is not None
    assert claims.room_config.agents[0].agent_name == "assistant"


async def test_unconfigured_livekit_raises_503():
    """No credentials anywhere: refuse, rather than mint a token nobody can use."""
    bare = _config(LIVEKIT_URL=None, LIVEKIT_API_KEY=None, LIVEKIT_API_SECRET=None)
    with pytest.raises(HTTPException) as exc:
        await TokenService(bare).create_room_token(RoomTokenRequest())
    assert exc.value.status_code == 503


async def test_the_first_boot_of_a_fresh_clone_mints_a_token():
    """The credentials are environment, so no table can be in the way.

    This used to be the bug that made the first run impossible: the project
    lived in Postgres, and POST /api/v1/token answered 500 with a raw
    UndefinedTableError against a database nobody had migrated yet. There is
    now nothing between the environment and the signature, and the constructor
    below is the proof: a Config is all this service is given.
    """
    service = TokenService(_config())
    resp = await service.create_room_token(RoomTokenRequest(room_name="first-boot"))
    assert _claims(resp.participant_token).video.room == "first-boot"
