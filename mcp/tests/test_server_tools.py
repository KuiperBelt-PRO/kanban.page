"""Tests de tools MCP con CliClient mock."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from kuiper_kanban_mcp import server as srv


def test_kanban_serve_restart_uses_manager() -> None:
    mock_mgr = MagicMock()
    mock_mgr.restart.return_value = {
        "ok": True,
        "health_url": "http://127.0.0.1:8765/api/v1/health",
        "board_url": "http://127.0.0.1:8765/?board=hub-delivery&theme=dark",
    }
    with patch.object(srv, "_serve_manager", mock_mgr):
        out = srv.kanban_serve_restart()
    assert '"ok": true' in out.lower() or '"ok": True' in out
    mock_mgr.restart.assert_called_once()


def test_kanban_board_show_delegates() -> None:
    mock_client = MagicMock()
    mock_client.run.return_value = {"board": {"slug": "hub-delivery"}}
    with patch.object(srv, "_client", return_value=mock_client):
        out = srv.kanban_board_show("hub-delivery")
    assert "hub-delivery" in out
    mock_client.run.assert_called_once_with(["board", "show", "hub-delivery"])
