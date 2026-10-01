"""Subprocess al CLI ``kanban`` con salida JSON."""

from __future__ import annotations

import json
import os
import subprocess
from typing import Any

from kuiper_kanban.config import Settings
from kuiper_kanban.errors import KanbanCliError


class CliClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def run(self, argv: list[str]) -> dict[str, Any]:
        cmd = [self.settings.resolve_node(), str(self.settings.cli_path), *argv, "--json"]
        env = {
            **os.environ,
            "KANBAN_DB_PATH": str(self.settings.database_path),
            "KUIPER_LOCAL_MODE": "1",
        }
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.settings.cli_timeout_seconds,
                env=env,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise KanbanCliError(
                f"kanban CLI timeout ({self.settings.cli_timeout_seconds}s): {' '.join(argv)}",
                exit_code=124,
            ) from exc

        stdout = (proc.stdout or "").strip()
        if not stdout:
            stderr = (proc.stderr or "").strip()
            raise KanbanCliError(
                stderr or f"kanban CLI sin salida (exit {proc.returncode})",
                exit_code=proc.returncode or 1,
            )

        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError as exc:
            raise KanbanCliError(f"JSON inválido del CLI: {stdout[:200]}", exit_code=proc.returncode or 1) from exc

        if proc.returncode != 0 or payload.get("ok") is False:
            err = payload.get("error") if isinstance(payload.get("error"), dict) else {}
            message = str(err.get("message") or stdout)
            code = err.get("code")
            raise KanbanCliError(message, exit_code=proc.returncode or 1, code=code)

        data = payload.get("data")
        if isinstance(data, dict):
            return data
        return {"result": data}
