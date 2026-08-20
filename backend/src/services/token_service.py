import uuid

from google.protobuf.json_format import ParseDict
from livekit import api

from src.core.config import Config
from src.core.exceptions import create_service_unavailable_exception
from src.schemas.token_schemas import RoomTokenRequest, RoomTokenResponse


def _to_room_config(data: dict) -> "api.RoomConfiguration":
    """Convert an incoming JSON object into a RoomConfiguration proto.

    Accepts both camelCase (agentName) and snake_case (agent_name) keys, which
    is what the LiveKit client SDKs send for agent dispatch.
    """
    return ParseDict(data, api.RoomConfiguration(), ignore_unknown_fields=True)


class TokenService:
    """Mints LiveKit room access tokens.

    The credentials come from the environment and nowhere else, so this path
    touches no table and cannot be broken by a database that is unmigrated,
    slow or absent. A fresh clone mints a token on its first boot.
    """

    def __init__(self, config: Config) -> None:
        self._config = config

    def _credentials(self) -> tuple[str, str, str] | None:
        """(url, key, secret) for signing, or None when unconfigured."""
        url = self._config.LIVEKIT_URL
        key = self._config.LIVEKIT_API_KEY
        secret = (
            self._config.LIVEKIT_API_SECRET.get_secret_value()
            if self._config.LIVEKIT_API_SECRET
            else None
        )
        return (url, key, secret) if (url and key and secret) else None

    async def create_room_token(self, payload: RoomTokenRequest) -> RoomTokenResponse:
        credentials = self._credentials()
        if credentials is None:
            raise create_service_unavailable_exception(
                "LiveKit is not configured: set LIVEKIT_URL, LIVEKIT_API_KEY "
                "and LIVEKIT_API_SECRET in the environment, then restart"
            )
        url, key, secret = credentials

        room_name = payload.room_name or f"room-{uuid.uuid4().hex[:12]}"
        identity = payload.participant_identity or f"user-{uuid.uuid4().hex[:12]}"

        token = (
            api.AccessToken(key, secret)
            .with_identity(identity)
            .with_name(payload.participant_name or identity)
            .with_grants(
                api.VideoGrants(
                    room_join=True,
                    room=room_name,
                    can_publish=True,
                    can_subscribe=True,
                )
            )
        )

        if payload.participant_metadata:
            token = token.with_metadata(payload.participant_metadata)
        if payload.participant_attributes:
            token = token.with_attributes(payload.participant_attributes)
        if payload.room_config:
            token = token.with_room_config(_to_room_config(payload.room_config))

        return RoomTokenResponse(server_url=url, participant_token=token.to_jwt())
