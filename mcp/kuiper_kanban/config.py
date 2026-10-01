"""Configuración tipada del MCP kanban (repo kanban.page)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from kuiper_kanban.repo_paths import detect_repo_root, expand_variables
from kuiper_kanban.settings_loader import load_settings_file, resolve_settings_path


@dataclass(frozen=True)
class Settings:
    repo_root: Path
    settings_path: Path | None
    cli_path: Path
    node_path: Path | None
    cli_timeout_seconds: int
    database_path: Path
    default_organization: str
    default_board: str
    serve_host: str
    serve_port: int
    auto_start_serve: bool
    migrate_on_start: bool
    serve_startup_seconds: int
    default_ui_theme: str
    open_board_on_mcp_start: bool
    open_board_target: str

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> Settings:
        source = env if env is not None else dict(os.environ)
        repo_root = _repo_root_from_env(source)
        settings_path = resolve_settings_path(repo_root, source)
        file_payload = load_settings_file(settings_path)

        cli_raw = source.get("KANBAN_CLI_PATH", "").strip() or str(
            file_payload.get("cli_path", "${repo_root}/cli/kanban.js")
        )
        cli_path = Path(expand_variables(cli_raw, repo_root=repo_root, env=source))

        node_raw = source.get("KANBAN_NODE", "").strip() or str(file_payload.get("node_path", "")).strip()
        node_path = Path(expand_variables(node_raw, repo_root=repo_root, env=source)) if node_raw else None

        db_raw = source.get("KANBAN_DB_PATH", "").strip() or str(
            file_payload.get(
                "database_path",
                "${repo_root}/.local/kuiper-kanban/kuiper.db",
            )
        )
        database_path = Path(expand_variables(db_raw, repo_root=repo_root, env=source))

        timeout = int(file_payload.get("cli_timeout_seconds", 30))
        default_organization = str(file_payload.get("default_organization", "KuiperBelt-PRO"))
        default_board = str(file_payload.get("default_board", "hub-delivery"))
        serve_host = str(file_payload.get("serve_host", "127.0.0.1"))
        serve_port = int(file_payload.get("serve_port", 8765))
        auto_start_serve = _bool(file_payload.get("auto_start_serve", True))
        migrate_on_start = _bool(file_payload.get("migrate_on_start", True))
        serve_startup_seconds = int(file_payload.get("serve_startup_seconds", 15))
        default_ui_theme = str(file_payload.get("default_ui_theme", "dark")).strip().lower()
        if default_ui_theme not in {"dark", "light"}:
            default_ui_theme = "dark"
        open_board_on_mcp_start = _bool(file_payload.get("open_board_on_mcp_start", True))
        open_board_target = str(file_payload.get("open_board_target", "cursor")).strip().lower()
        if open_board_target not in {"cursor", "external", "none"}:
            open_board_target = "cursor"

        return cls(
            repo_root=repo_root,
            settings_path=settings_path,
            cli_path=cli_path,
            node_path=node_path,
            cli_timeout_seconds=timeout,
            database_path=database_path,
            default_organization=default_organization,
            default_board=default_board,
            serve_host=serve_host,
            serve_port=serve_port,
            auto_start_serve=auto_start_serve,
            migrate_on_start=migrate_on_start,
            serve_startup_seconds=serve_startup_seconds,
            default_ui_theme=default_ui_theme,
            open_board_on_mcp_start=open_board_on_mcp_start,
            open_board_target=open_board_target,
        )

    @classmethod
    def for_tests(cls, base: Path, **overrides: Any) -> Settings:
        defaults: dict[str, Any] = {
            "repo_root": base / "repo",
            "settings_path": None,
            "cli_path": base / "kanban.js",
            "node_path": None,
            "cli_timeout_seconds": 5,
            "database_path": base / "kuiper.db",
            "default_organization": "acme",
            "default_board": "main",
            "serve_host": "127.0.0.1",
            "serve_port": 8765,
            "auto_start_serve": False,
            "migrate_on_start": False,
            "serve_startup_seconds": 5,
            "default_ui_theme": "dark",
            "open_board_on_mcp_start": False,
            "open_board_target": "cursor",
        }
        defaults.update(overrides)
        return cls(**defaults)

    def resolve_node(self) -> str:
        """Node.js para el CLI: evita el Node embebido de Cursor (distinto ABI)."""
        candidates: list[str] = []
        if self.node_path:
            candidates.append(str(self.node_path))
        env_node = os.environ.get("KANBAN_NODE", "").strip()
        if env_node:
            candidates.append(env_node)
        if os.name == "nt":
            candidates.append(r"C:\Program Files\nodejs\node.exe")
        for candidate in candidates:
            path = Path(candidate)
            if path.is_file():
                return str(path)
        return "node"

    def board_ui_url(self, board: str | None = None, theme: str | None = None) -> str:
        slug = (board or self.default_board).strip()
        theme_val = (theme or self.default_ui_theme).strip().lower()
        query = f"kuiper=1&board={slug}"
        if theme_val in {"dark", "light"}:
            query += f"&theme={theme_val}"
        return f"http://{self.serve_host}:{self.serve_port}/?{query}"


def _repo_root_from_env(source: dict[str, str]) -> Path:
    for key in ("KANBAN_REPO_ROOT", "KUIPER_HUB_ROOT"):
        raw = source.get(key, "").strip()
        if raw:
            return Path(raw)
    return detect_repo_root()


def _bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)
