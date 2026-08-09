from livekit.agents import cli

from src.agent import server
from src.core.livekit_sync import start_livekit_sync

if __name__ == "__main__":
    start_livekit_sync()
    cli.run_app(server)
