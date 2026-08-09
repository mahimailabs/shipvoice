import uuid

from google.protobuf.json_format import ParseDict
from livekit import api

from src.core.exceptions import create_service_unavailable_exception
from src.schemas.token_schemas import RoomTokenRequest, RoomTokenResponse
from src.services.livekit_settings_service import LiveKitSettingsService


def _to_room_config(data: dict) -> "api.RoomConfiguration":
    """Convert an incoming JSON object into a RoomConfiguration proto.

    Accepts both camelCase (agentName) and snake_case (agent_name) keys, which
    is what the LiveKit client SDKs send for agent dispatch.
    """
    return ParseDict(data, api.RoomConfiguration(), ignore_unknown_fields=True)


class TokenService:
    """Mints LiveKit room access tokens.

    Reads the credentials through the settings service on every call rather than
    capturing them at construction, so a change made in the console takes effect
    on the next token without restarting the process.
    """

    def __init__(self, settings: LiveKitSettingsService) -> None:
        self._settings = settings

    async def create_room_token(self, payload: RoomTokenRequest) -> RoomTokenResponse:
        credentials = await self._settings.credentials()
        if credentials is None:
            raise create_service_unavailable_exception(
                "LiveKit is not configured: set LIVEKIT_URL, LIVEKIT_API_KEY, "
                "and LIVEKIT_API_SECRET, or set them from the console"
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
