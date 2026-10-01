"""Carga de ``kuiper-kanban.settings`` (JSON local)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DEFAULT_SETTINGS_FILENAME = "kuiper-kanban.settings"


def default_settings_path(repo_root: Path) -> Path:
    return repo_root / "mcp" / DEFAULT_SETTINGS_FILENAME


def resolve_settings_path(repo_root: Path, env: dict[str, str]) -> Path | None:
    override = env.get("KUIPER_KANBAN_SETTINGS", "").strip()
    if override:
        path = Path(override)
        return path if path.is_file() else None
    path = default_settings_path(repo_root)
    return path if path.is_file() else None


def load_settings_file(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path} debe ser un objeto JSON.")
    return payload
