"""Tests del gestor kanban serve."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

from kuiper_kanban.config import Settings
from kuiper_kanban.serve_manager import ServeManager


def test_start_stops_stale_pid_and_waits_for_health(tmp_path: Path) -> None:
    settings = Settings.for_tests(
        tmp_path,
        auto_start_serve=True,
        migrate_on_start=False,
        serve_startup_seconds=2,
        database_path=tmp_path / "kuiper.db",
        cli_path=tmp_path / "kanban.js",
    )
    pid_file = settings.database_path.parent / "serve.pid"
    pid_file.parent.mkdir(parents=True, exist_ok=True)
    pid_file.write_text("99999", encoding="utf-8")

    proc = MagicMock()
    proc.pid = 4242
    proc.poll.return_value = None

    manager = ServeManager(settings)
    with (
        patch.object(manager, "_terminate_pid") as kill,
        patch("kuiper_kanban.serve_manager.subprocess.Popen", return_value=proc) as popen,
        patch.object(manager, "_health_ok", side_effect=[False, True]),
        patch("kuiper_kanban.serve_manager.request_open_on_start") as open_board,
    ):
        manager.start()
    open_board.assert_called_once_with(settings)

    kill.assert_called_once_with(99999)
    popen.assert_called_once()
    assert pid_file.read_text(encoding="utf-8") == "4242"


def test_board_url(tmp_path: Path) -> None:
    settings = Settings.for_tests(
        tmp_path,
        database_path=tmp_path / "kuiper.db",
        default_board="hub-delivery",
        serve_port=8765,
    )
    manager = ServeManager(settings)
    assert manager.board_url() == (
        "http://127.0.0.1:8765/?kuiper=1&board=hub-delivery&theme=dark"
    )


def test_restart_stops_then_starts(tmp_path: Path) -> None:
    settings = Settings.for_tests(
        tmp_path,
        database_path=tmp_path / "kuiper.db",
        auto_start_serve=False,
        migrate_on_start=False,
    )
    manager = ServeManager(settings)
    with (
        patch.object(manager, "stop") as stop,
        patch.object(manager, "start") as start,
    ):
        result = manager.restart()
    stop.assert_called_once()
    start.assert_called_once()
    assert result["ok"] is True
    assert "health_url" in result


def test_stop_terminates_running_process(tmp_path: Path) -> None:
    settings = Settings.for_tests(
        tmp_path,
        database_path=tmp_path / "kuiper.db",
    )
    proc = MagicMock()
    proc.pid = 77
    proc.poll.return_value = None

    manager = ServeManager(settings)
    manager._proc = proc
    manager.pid_file.parent.mkdir(parents=True, exist_ok=True)
    manager.pid_file.write_text("77", encoding="utf-8")

    with patch.object(manager, "_terminate_pid") as kill:
        manager.stop()

    kill.assert_called_once_with(77)
    proc.terminate.assert_called_once()
    assert not manager.pid_file.exists()
