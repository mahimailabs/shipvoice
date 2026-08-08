from pydantic import BaseModel


class DeploymentRead(BaseModel):
    """Deployment posture, with nothing secret in it.

    No API key, no secret, no database URL. The LiveKit URL is here because the
    browser already receives it on every token request, so withholding it would
    be theatre rather than security.
    """

    project_name: str
    env: str
    livekit_url: str | None
    allow_open_registration: bool
    cors_origins: list[str]
