from pydantic import BaseModel, Field, field_validator


class LiveKitRead(BaseModel):
    """What the console is allowed to see."""

    url: str | None
    api_key_hint: str | None
    secret_set: bool
    source: str
    # Whether the worker can actually follow a change made here. False when no
    # service token is configured, which is the shipped default, and the page
    # must not claim otherwise.
    worker_follows: bool


class LiveKitWrite(BaseModel):
    url: str = Field(min_length=1)
    api_key: str = Field(min_length=1)
    # Optional on update: an empty secret means "keep the one already stored",
    # so the console never has to round-trip a value it is not allowed to read.
    api_secret: str | None = None

    @field_validator("url")
    @classmethod
    def must_be_a_livekit_url(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith(("ws://", "wss://")):
            raise ValueError("LiveKit URL must start with ws:// or wss://")
        return v

    @field_validator("api_key")
    @classmethod
    def strip_key(cls, v: str) -> str:
        return v.strip()


class LiveKitCredentials(BaseModel):
    """The full credentials, served only to the worker behind a service token.

    'revision' changes whenever the stored project changes. The worker keeps the
    one it started with and restarts when it differs, which is what makes an
    edit in the console actually reach the process placing calls.
    """

    url: str
    api_key: str
    api_secret: str
    revision: str
