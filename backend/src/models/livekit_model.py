from sqlmodel import Field

from src.models.base_model import BaseModel


class LiveKitSettings(BaseModel, table=True):
    """The LiveKit project this deployment talks to.

    One row, ever. It is seeded from LIVEKIT_URL / LIVEKIT_API_KEY /
    LIVEKIT_API_SECRET the first time the app starts against an empty table, so
    the env stays the way you bootstrap a fresh clone. After that the row is the
    source of truth and the env is ignored, which is what makes a change from
    the console survive a restart.

    The secret is stored in plaintext. That is the same posture as the .env file
    it came from, and pretending otherwise by encrypting it with a key sitting
    next to it in the same environment would be theatre. It is never served over
    the API.
    """

    __tablename__ = "livekit_settings"

    url: str = Field(nullable=False)
    api_key: str = Field(nullable=False)
    api_secret: str = Field(nullable=False)
