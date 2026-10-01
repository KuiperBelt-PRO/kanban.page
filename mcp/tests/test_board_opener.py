"""Tests de apertura del tablero."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from kuiper_kanban.board_opener import CURSOR_BROWSER_HINT, open_board, request_open_on_start
from kuiper_kanban.config import Settings


def test_open_board_external(tmp_path: Path) -> None:
    settings = Settings.for_tests(
        tmp_path,
        database_path=tmp_path / "kuiper.db",
        default_board="hub-delivery",
        serve_port=8765,
        default_ui_theme="dark",
    )
    with patch("kuiper_kanban.board_opener.webbrowser.open") as open_url:
        result = open_board(settings, target="external")
    open_url.assert_called_once_with(
        "http://127.0.0.1:8765/?kuiper=1&board=hub-delivery&theme=dark"
    )
    assert result["opened"] is True
    assert result["target"] == "external"


def test_open_board_cursor_returns_url_for_agent(tmp_path: Path) -> None:
    settings = Settings.for_tests(
        tmp_path,
        database_path=tmp_path / "kuiper.db",
        default_ui_theme="dark",
    )
    result = open_board(settings, target="cursor")
    assert result["opened"] is False
    assert result["target"] == "cursor"
    assert "kuiper=1" in result["url"]
    assert "theme=dark" in result["url"]
    assert result["hint"] == CURSOR_BROWSER_HINT


def test_request_open_on_start_skipped_when_disabled(tmp_path: Path) -> None:
    settings = Settings.for_tests(
        tmp_path,
        database_path=tmp_path / "kuiper.db",
        open_board_on_mcp_start=False,
    )
    with patch("kuiper_kanban.board_opener.open_board") as opener:
        request_open_on_start(settings)
    opener.assert_not_called()
