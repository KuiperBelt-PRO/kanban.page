"""Rutas canónicas del repo kanban.page."""

from __future__ import annotations

import os
from pathlib import Path


def detect_repo_root() -> Path:
    """Raíz del repo (contiene ``cli/kanban.js`` y ``mcp/``)."""
    override = _env_path("KANBAN_REPO_ROOT")
    if override is not None:
        return override

    cwd = Path.cwd()
    for candidate in (cwd, *cwd.parents):
        if (candidate / "cli" / "kanban.js").is_file() and (candidate / "mcp" / "pyproject.toml").is_file():
            return candidate
        if (candidate / "package.json").is_file() and (candidate / "server").is_dir():
            return candidate

    # mcp/kuiper_kanban/repo_paths.py → repo root
    return Path(__file__).resolve().parents[2]


def expand_variables(value: str, *, repo_root: Path, env: dict[str, str] | None = None) -> str:
    """Sustituye ``${repo_root}`` / ``${hub_root}`` y variables de entorno."""
    source = env if env is not None else dict(os.environ)
    root_posix = repo_root.as_posix()
    replacements = {
        "${repo_root}": root_posix,
        "${REPO_ROOT}": root_posix,
        "${hub_root}": root_posix,
        "${HUB_ROOT}": root_posix,
    }
    result = value
    for token, replacement in replacements.items():
        result = result.replace(token, replacement)
    return result


def _env_path(name: str) -> Path | None:
    value = os.environ.get(name, "").strip()
    if not value:
        return None
    return Path(value)
