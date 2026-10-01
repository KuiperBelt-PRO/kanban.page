"""Gestión del proceso ``kanban serve`` (UI + API local)."""

from __future__ import annotations

import os
import signal
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

from kuiper_kanban.board_opener import request_open_on_start
from kuiper_kanban.cli_client import CliClient
from kuiper_kanban.config import Settings
from kuiper_kanban.errors import KanbanServeError


class ServeManager:
    """Arranca y detiene ``kanban serve`` junto al ciclo de vida del MCP."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._proc: subprocess.Popen[bytes] | None = None

    @property
    def pid_file(self) -> Path:
        return self.settings.database_path.parent / "serve.pid"

    @property
    def health_url(self) -> str:
        return f"http://{self.settings.serve_host}:{self.settings.serve_port}/api/v1/health"

    def board_url(self, board: str | None = None) -> str:
        return self.settings.board_ui_url(board)

    def start(self) -> None:
        if not self.settings.auto_start_serve:
            return

        self._stop_stale_pid()
        self.settings.database_path.parent.mkdir(parents=True, exist_ok=True)

        if self.settings.migrate_on_start:
            CliClient(self.settings).run(["db", "migrate"])

        node = self.settings.resolve_node()
        cmd = [
            node,
            str(self.settings.cli_path),
            "serve",
            "--port",
            str(self.settings.serve_port),
        ]
        env = {
            **os.environ,
            "KANBAN_DB_PATH": str(self.settings.database_path),
            "KUIPER_LOCAL_MODE": "1",
        }
        self._proc = subprocess.Popen(
            cmd,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
        )
        self._write_pid(self._proc.pid)
        self._wait_healthy()
        request_open_on_start(self.settings)

    def restart(self) -> dict[str, str | bool]:
        """Detiene y vuelve a levantar ``kanban serve`` (incluye migrate si está activo)."""
        self.stop()
        self.start()
        return {
            "ok": True,
            "health_url": self.health_url,
            "board_url": self.board_url(),
        }

    def stop(self) -> None:
        pid = self._proc.pid if self._proc and self._proc.poll() is None else self._read_pid()
        if pid:
            self._terminate_pid(pid)
        if self._proc and self._proc.poll() is None:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.kill()
        self._proc = None
        if self.pid_file.exists():
            self.pid_file.unlink(missing_ok=True)

    def _wait_healthy(self) -> None:
        deadline = time.monotonic() + self.settings.serve_startup_seconds
        while time.monotonic() < deadline:
            if self._proc and self._proc.poll() is not None:
                raise KanbanServeError(
                    f"kanban serve terminó con código {self._proc.returncode}"
                )
            if self._health_ok():
                return
            time.sleep(0.2)
        raise KanbanServeError(
            f"kanban serve no respondió en {self.settings.health_url} "
            f"({self.settings.serve_startup_seconds}s)"
        )

    def _health_ok(self) -> bool:
        try:
            with urllib.request.urlopen(self.health_url, timeout=1) as resp:
                return resp.status == 200
        except (urllib.error.URLError, TimeoutError, OSError):
            return False

    def _stop_stale_pid(self) -> None:
        pid = self._read_pid()
        if pid:
            self._terminate_pid(pid)
        if self.pid_file.exists():
            self.pid_file.unlink(missing_ok=True)

    def _read_pid(self) -> int | None:
        if not self.pid_file.exists():
            return None
        try:
            return int(self.pid_file.read_text(encoding="utf-8").strip())
        except (OSError, ValueError):
            return None

    def _write_pid(self, pid: int) -> None:
        self.pid_file.write_text(str(pid), encoding="utf-8")

    def _terminate_pid(self, pid: int) -> None:
        if pid <= 0:
            return
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                capture_output=True,
                check=False,
            )
            return
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            return
        for _ in range(25):
            try:
                os.kill(pid, 0)
            except OSError:
                return
            time.sleep(0.1)
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass
