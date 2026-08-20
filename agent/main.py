from livekit.agents import cli

from src.agent import server
from src.core.preflight import require_livekit_or_exit

if __name__ == "__main__":
    # Called from the '__main__' guard, never at import time: LiveKit re-imports
    # the agent module in every job subprocess, and a credential check that
    # exits belongs in the process the operator started, not in each child.
    require_livekit_or_exit()
    cli.run_app(server)
