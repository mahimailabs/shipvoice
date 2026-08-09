"""The worker following the backend's LiveKit project."""

import os

import httpx
import pytest

from src.core import livekit_sync

PAYLOAD = {
    "url": "wss://from-backend.livekit.cloud",
    "api_key": "APIfromBackend",
    "api_secret": "secret-from-backend",
    "revision": "2026-08-08T10:00:00+00:00",
}


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for key in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
        monkeypatch.delenv(key, raising=False)


def _respond(monkeypatch, *, status=200, payload=None, raises=False):
    def fake_get(url, headers=None, timeout=None):
        if raises:
            raise httpx.ConnectError("no route to host")
        return httpx.Response(status, json=payload if payload is not None else PAYLOAD)

    monkeypatch.setattr(livekit_sync.httpx, "get", fake_get)


def test_bootstrap_puts_the_backend_project_into_the_environment(monkeypatch):
    _respond(monkeypatch)
    revision = livekit_sync.bootstrap("http://backend:8000", "tok")
    assert revision == PAYLOAD["revision"]
    assert os.environ["LIVEKIT_URL"] == PAYLOAD["url"]
    assert os.environ["LIVEKIT_API_SECRET"] == PAYLOAD["api_secret"]


def test_bootstrap_is_a_no_op_when_sync_is_not_configured(monkeypatch):
    _respond(monkeypatch)
    assert livekit_sync.bootstrap(None, None) is None
    assert "LIVEKIT_URL" not in os.environ


def test_an_unreachable_backend_leaves_the_environment_alone(monkeypatch):
    """A console being down must not stop the worker taking calls."""
    monkeypatch.setenv("LIVEKIT_URL", "wss://from-env.livekit.cloud")
    _respond(monkeypatch, raises=True)
    assert livekit_sync.bootstrap("http://backend:8000", "tok") is None
    assert os.environ["LIVEKIT_URL"] == "wss://from-env.livekit.cloud"


def test_a_refused_token_leaves_the_environment_alone(monkeypatch):
    monkeypatch.setenv("LIVEKIT_URL", "wss://from-env.livekit.cloud")
    _respond(monkeypatch, status=403, payload={"detail": "Bad service token"})
    assert livekit_sync.bootstrap("http://backend:8000", "tok") is None
    assert os.environ["LIVEKIT_URL"] == "wss://from-env.livekit.cloud"


def test_a_partial_payload_never_half_applies(monkeypatch):
    """Half-applied credentials would be worse than none: they would look set."""
    monkeypatch.setenv("LIVEKIT_URL", "wss://from-env.livekit.cloud")
    _respond(monkeypatch, status=503, payload={"detail": "not configured"})
    livekit_sync.bootstrap("http://backend:8000", "tok")
    assert os.environ["LIVEKIT_URL"] == "wss://from-env.livekit.cloud"
    assert "LIVEKIT_API_KEY" not in os.environ


def test_watch_does_nothing_without_a_starting_revision(monkeypatch):
    called = []
    monkeypatch.setattr(
        livekit_sync.threading, "Thread", lambda **kw: called.append(kw)
    )
    livekit_sync.watch("http://backend:8000", "tok", None)
    assert called == []


def test_missing_credentials_name_themselves(monkeypatch, capsys):
    """The whole point: the message must name the variable and the file."""
    monkeypatch.delenv("LIVEKIT_API_KEY", raising=False)
    monkeypatch.setenv("LIVEKIT_URL", "wss://real.livekit.cloud")
    monkeypatch.setenv("LIVEKIT_API_SECRET", "s")
    with pytest.raises(SystemExit) as exc:
        livekit_sync.require_livekit_or_exit()
    assert exc.value.code == 1
    err = capsys.readouterr().err
    assert "LIVEKIT_API_KEY" in err
    assert ".env" in err


def test_the_unedited_example_url_is_refused_by_name(monkeypatch, capsys):
    """This is the failure that reads as 'invalid API key' in the browser."""
    monkeypatch.setenv("LIVEKIT_URL", livekit_sync.PLACEHOLDER_URL)
    monkeypatch.setenv("LIVEKIT_API_KEY", "k")
    monkeypatch.setenv("LIVEKIT_API_SECRET", "s")
    with pytest.raises(SystemExit):
        livekit_sync.require_livekit_or_exit()
    err = capsys.readouterr().err
    assert "LIVEKIT_URL" in err
    assert livekit_sync.PLACEHOLDER_URL in err


def test_complete_credentials_start_normally(monkeypatch):
    monkeypatch.setenv("LIVEKIT_URL", "wss://real.livekit.cloud")
    monkeypatch.setenv("LIVEKIT_API_KEY", "k")
    monkeypatch.setenv("LIVEKIT_API_SECRET", "s")
    livekit_sync.require_livekit_or_exit()
    assert livekit_sync.env_is_complete() is True
