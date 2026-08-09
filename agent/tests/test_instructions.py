"""The persona is data, not code."""

import pathlib

import pytest

from src.prompts import instructions as mod


def test_prefers_the_file_and_substitutes_the_name(tmp_path, monkeypatch):
    p = tmp_path / "instructions.md"
    p.write_text("You are {agent_name}, and you are calm.")
    monkeypatch.setattr(mod, "PROMPT_PATH", p)
    assert mod.load_instructions("Lisa") == "You are Lisa, and you are calm."


def test_falls_back_to_the_packaged_default(tmp_path, monkeypatch):
    """A clone that has not run setup still talks."""
    monkeypatch.setattr(mod, "PROMPT_PATH", tmp_path / "absent.md")
    out = mod.load_instructions("Lisa")
    assert "You are Lisa" in out
    assert "{agent_name}" not in out


def test_braces_in_the_prompt_do_not_raise(tmp_path, monkeypatch):
    """The file is user-editable.

    str.format would raise KeyError the moment someone pastes a JSON example
    into their persona, which is why substitution is str.replace.
    """
    p = tmp_path / "instructions.md"
    p.write_text('You are {agent_name}. Reply like {"ok": true} when asked.')
    monkeypatch.setattr(mod, "PROMPT_PATH", p)
    out = mod.load_instructions("Lisa")
    assert '{"ok": true}' in out
    assert out.startswith("You are Lisa.")


def test_the_shipped_prompt_file_exists_and_carries_the_placeholder():
    shipped = pathlib.Path(mod.PROMPT_PATH)
    assert shipped.exists(), f"{shipped} is missing"
    assert "{agent_name}" in shipped.read_text()


def test_no_stale_format_call_survives():
    """Regression guard for the str.format that used to live here."""
    src = pathlib.Path(mod.__file__).read_text()
    assert ".format(" not in src


@pytest.mark.parametrize("name", ["assistant", "Lisa", "Dr. O'Neil"])
def test_names_pass_through_untouched(tmp_path, monkeypatch, name):
    p = tmp_path / "instructions.md"
    p.write_text("[{agent_name}]")
    monkeypatch.setattr(mod, "PROMPT_PATH", p)
    assert mod.load_instructions(name) == f"[{name}]"
