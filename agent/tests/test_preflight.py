"""The worker refusing to start on credentials that cannot work.

The LiveKit project is this process's environment. There is nothing to fetch,
nothing to follow and nothing to restart into, so all that is left to test is
the refusal, and which runs are exempt from it.
"""

import pathlib

import pytest

from src.core import preflight

REAL = {
    "LIVEKIT_URL": "wss://real.livekit.cloud",
    "LIVEKIT_API_KEY": "k",
    "LIVEKIT_API_SECRET": "s",
}


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for key in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
        monkeypatch.delenv(key, raising=False)
    # Every test states the subcommand it is about. Without this the suite
    # would inherit pytest's own argv and pass or fail on it by accident.
    monkeypatch.setattr(preflight.sys, "argv", ["main.py", "start"])


def _env(monkeypatch, **overrides):
    for key, value in {**REAL, **overrides}.items():
        if value is None:
            monkeypatch.delenv(key, raising=False)
        else:
            monkeypatch.setenv(key, value)


def test_missing_credentials_name_themselves(monkeypatch, capsys):
    """The whole point: the message must name the variable and the file."""
    _env(monkeypatch, LIVEKIT_API_KEY=None)
    with pytest.raises(SystemExit) as exc:
        preflight.require_livekit_or_exit()
    assert exc.value.code == 1
    err = capsys.readouterr().err
    assert "LIVEKIT_API_KEY" in err
    assert ".env" in err


def test_the_unedited_example_url_is_refused_by_name(monkeypatch, capsys):
    """This is the failure that reads as 'invalid API key' in the browser."""
    _env(monkeypatch, LIVEKIT_URL=preflight.PLACEHOLDER_URL)
    with pytest.raises(SystemExit):
        preflight.require_livekit_or_exit()
    err = capsys.readouterr().err
    assert "LIVEKIT_URL" in err
    assert preflight.PLACEHOLDER_URL in err


def test_complete_credentials_start_normally(monkeypatch):
    _env(monkeypatch)
    preflight.require_livekit_or_exit()


@pytest.mark.parametrize("command", ["download-files", "console"])
def test_the_runs_that_never_touch_livekit_need_no_credentials(monkeypatch, command):
    """Two regressions in one.

    The agent Dockerfile runs 'main.py download-files' to prefetch the VAD and
    turn-detector models, in a build that has no credentials and needs none.
    And 'console' is the five-minute first run: local mic, the three provider
    keys, no LiveKit project yet. Gating the refusal on the wrong condition
    breaks the image build and the first thing a buyer does.
    """
    monkeypatch.setattr(preflight.sys, "argv", ["main.py", command])
    preflight.require_livekit_or_exit()


def test_the_check_never_runs_at_module_import():
    """LiveKit re-imports the agent module in every job subprocess.

    A credential check that raises SystemExit belongs in the process the
    operator started. Run it at import time and every job subprocess runs it
    too, in an environment nobody promised would carry the same variables.
    """
    agent_src = (
        pathlib.Path(__file__).resolve().parents[1] / "src" / "agent.py"
    ).read_text()
    before_main = agent_src.split('if __name__ == "__main__":')[0]
    assert "require_livekit_or_exit(" not in before_main
    assert "preflight" not in before_main
