import pytest
from fastapi import HTTPException
from livekit.api import TokenVerifier

from src.schemas.token_schemas import RoomTokenRequest
from src.services.token_service import TokenService

KEY = "devkey"
SECRET = "devsecret-devsecret-devsecret-1234"
URL = "wss://example.livekit.cloud"


class _FixedSettings:
    """Stands in for the settings service: no database, fixed credentials."""

    def __init__(self, credentials: tuple[str, str, str] | None) -> None:
        self._credentials = credentials

    async def credentials(self) -> tuple[str, str, str] | None:
        return self._credentials


def _service() -> TokenService:
    return TokenService(_FixedSettings((URL, KEY, SECRET)))


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
    with pytest.raises(HTTPException) as exc:
        await TokenService(_FixedSettings(None)).create_room_token(RoomTokenRequest())
    assert exc.value.status_code == 503
