from pydantic import BaseModel


class DeploymentRead(BaseModel):
    """Deployment posture, with nothing secret in it."""

    project_name: str
    env: str
    livekit_url: str | None
