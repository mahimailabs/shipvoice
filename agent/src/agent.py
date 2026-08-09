import logging
import os
import sys

import sentry_sdk
from livekit.agents import (
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    TurnHandlingOptions,
    cli,
)
from livekit.plugins import cerebras, deepgram, inworld, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from src.agents.assistant import Assistant
from src.core.config import config
from src.core.events import register_event_handlers
from src.services.call_reporter import CallReporter
from src.utils.room import Caller, identify

logger = logging.getLogger("agent")

CONSOLE_MODE = "console" in sys.argv


# Quiet noisy third-party loggers.
for _noisy in ("livekit.plugins", "livekit.turn_detector", "asyncio"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

if config.SENTRY_DSN:
    sentry_sdk.init(
        dsn=config.SENTRY_DSN,
        traces_sample_rate=0.2,
        environment=os.getenv("FLY_APP_NAME", "development"),
    )


server = AgentServer(drain_timeout=300, shutdown_process_timeout=30)


def prewarm(proc: JobProcess) -> None:
    # Load the VAD once per process; shared across all sessions.
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session(agent_name=config.AGENT_NAME)
async def entrypoint(ctx: JobContext) -> None:
    ctx.log_context_fields = {"room": ctx.room.name}
    await ctx.connect()

    caller: Caller | None = None
    if not CONSOLE_MODE:
        participant = await ctx.wait_for_participant()
        caller = identify(participant)
        logger.info(
            "participant joined: kind=%s identity=%s", caller.kind, caller.identity
        )

    reporter = CallReporter.from_config(console_mode=CONSOLE_MODE)

    session: AgentSession = AgentSession(
        stt=deepgram.STT(model="nova-3"),
        llm=cerebras.LLM(model="gemma-4-31b"),
        tts=inworld.TTS(model="inworld-tts-2", voice="Ashley"),
        vad=ctx.proc.userdata["vad"],
        turn_handling=TurnHandlingOptions(
            turn_detection=MultilingualModel(),
            interruption={"mode": "vad"},
        ),
    )

    log_usage_summary = register_event_handlers(session, reporter)

    # The status the call is closed with. The shutdown callback is the only
    # place that always runs, so it reads this rather than deciding for itself.
    outcome = {"status": "completed"}

    async def _on_shutdown() -> None:
        log_usage_summary()
        await reporter.finish(outcome["status"])

    ctx.add_shutdown_callback(_on_shutdown)

    # Opened only once the shutdown callback that closes it is registered.
    # Opening it earlier means a session that fails to build leaves a call
    # showing as active in the console for good.
    await reporter.start(
        room_name=ctx.room.name,
        caller=(caller.phone or caller.identity) if caller else None,
        channel=caller.kind if caller else "web",
        agent_name=config.AGENT_NAME,
        business_name=config.BUSINESS_NAME,
    )

    try:
        await session.start(agent=Assistant(), room=ctx.room)
    except Exception:
        outcome["status"] = "failed"
        raise
    # Opt-in web mic cleanup: `uv add livekit-plugins-noise-cancellation`, then
    # pass `room_input_options=RoomInputOptions(noise_cancellation=BVC())` above
    # (import: `from livekit.agents import RoomInputOptions`,
    # `from livekit.plugins import noise_cancellation`; use `noise_cancellation.BVC()`).


if __name__ == "__main__":
    # Running this file directly is the same entrypoint as main.py.
    from src.core.livekit_sync import start_livekit_sync

    start_livekit_sync()
    cli.run_app(server)
