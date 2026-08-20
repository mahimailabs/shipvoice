from pydantic import BaseModel


class LiveKitRead(BaseModel):
    """The configured LiveKit project, as the console is allowed to see it.

    A mirror of the environment the backend booted with. There is no write
    model beside this one: the project is set in .env and adopted on restart.
    """

    url: str | None
    api_key_hint: str | None
    secret_set: bool
