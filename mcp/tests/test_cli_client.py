"""Tests del cliente CLI (mock subprocess)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from kuiper_kanban.cli_client import CliClient
from kuiper_kanban.config import Settings
from kuiper_kanban.errors import KanbanCliError


def test_run_parses_ok_payload(tmp_path: Path) -> None:
    settings = Settings.for_tests(tmp_path, cli_path=tmp_path / "kanban.js")
    client = CliClient(settings)
    payload = {"ok": True, "data": {"organizations": []}}
    proc = MagicMock(returncode=0, stdout=json.dumps(payload), stderr="")
    with patch("kuiper_kanban.cli_client.subprocess.run", return_value=proc):
        data = client.run(["org", "list"])
    assert data == {"organizations": []}


def test_run_raises_on_error_json(tmp_path: Path) -> None:
    settings = Settings.for_tests(tmp_path, cli_path=tmp_path / "kanban.js")
    client = CliClient(settings)
    payload = {"ok": False, "error": {"code": "not_found", "message": "missing"}}
    proc = MagicMock(returncode=3, stdout=json.dumps(payload), stderr="")
    with patch("kuiper_kanban.cli_client.subprocess.run", return_value=proc):
        with pytest.raises(KanbanCliError, match="missing"):
            client.run(["card", "get", "kbzzzz"])
