from sqlmodel import Field

from src.models.base_model import BaseModel


class LiveKitSettings(BaseModel, table=True):
    """The LiveKit project this deployment talks to."""

    __tablename__ = "livekit_settings"

    url: str = Field(nullable=False)
    api_key: str = Field(nullable=False)
    api_secret: str = Field(nullable=False)
