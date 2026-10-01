"""Servidor FastMCP para Kanban Kuiper (delega en CLI kanban)."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import AsyncIterator

from fastmcp import FastMCP

from kuiper_kanban.board_opener import open_board
from kuiper_kanban.cli_client import CliClient
from kuiper_kanban.config import Settings
from kuiper_kanban.serve_manager import ServeManager
from kuiper_kanban_mcp.env_loader import load_settings

_serve_manager: ServeManager | None = None


@asynccontextmanager
async def _mcp_lifespan(_server: FastMCP) -> AsyncIterator[None]:
    global _serve_manager
    settings = load_settings()
    _serve_manager = ServeManager(settings)
    _serve_manager.start()
    try:
        yield
    finally:
        if _serve_manager is not None:
            _serve_manager.stop()
        _serve_manager = None


mcp = FastMCP("kuiper-kanban", lifespan=_mcp_lifespan)


@lru_cache(maxsize=1)
def _settings() -> Settings:
    return load_settings()


@lru_cache(maxsize=1)
def _client() -> CliClient:
    return CliClient(_settings())


def _json(payload: object) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _board(board: str | None) -> str:
    return (board or _settings().default_board).strip()


@mcp.tool()
def kanban_org_list() -> str:
    """Lista organizaciones del tablero local."""
    return _json(_client().run(["org", "list"]))


@mcp.tool()
def kanban_project_list(org: str | None = None) -> str:
    """Lista proyectos de una organización."""
    organization = (org or _settings().default_organization).strip()
    return _json(_client().run(["project", "list", "--org", organization]))


@mcp.tool()
def kanban_board_list(org: str | None = None) -> str:
    """Lista tableros de una organización."""
    organization = (org or _settings().default_organization).strip()
    return _json(_client().run(["board", "list", "--org", organization]))


@mcp.tool()
def kanban_board_show(board: str | None = None) -> str:
    """Vista completa de un tablero (proyectos, etapas, épicas, tarjetas)."""
    return _json(_client().run(["board", "show", _board(board)]))


@mcp.tool()
def kanban_epic_list(project_id: str) -> str:
    """Lista épicas de un proyecto."""
    return _json(_client().run(["epic", "list", "--project", project_id]))


@mcp.tool()
def kanban_epic_create(project_id: str, title: str, description: str | None = None, status: str = "planned") -> str:
    """Crea una épica en un proyecto."""
    argv = ["epic", "create", "--project", project_id, "--title", title, "--status", status]
    if description:
        argv.extend(["--description", description])
    return _json(_client().run(argv))


@mcp.tool()
def kanban_card_list(board: str | None = None) -> str:
    """Lista tarjetas activas de un tablero."""
    return _json(_client().run(["card", "list", "--board", _board(board)]))


@mcp.tool()
def kanban_card_get(card_id: str) -> str:
    """Obtiene una tarjeta por su id (p. ej. kb4f2a)."""
    return _json(_client().run(["card", "get", card_id]))


@mcp.tool()
def kanban_card_create(
    title: str,
    board: str | None = None,
    project_id: str | None = None,
    stage: str = "INBOX",
    notes: str | None = None,
    epic_id: str | None = None,
) -> str:
    """Crea una tarjeta en un tablero."""
    argv = ["card", "create", "--title", title, "--board", _board(board), "--stage", stage]
    if project_id:
        argv.extend(["--project", project_id])
    if notes:
        argv.extend(["--notes", notes])
    if epic_id:
        argv.extend(["--epic", epic_id])
    return _json(_client().run(argv))


@mcp.tool()
def kanban_card_move(card_id: str, stage: str, position: int | None = None) -> str:
    """Mueve una tarjeta a otra etapa (INBOX, DOING, WAITING, DONE)."""
    argv = ["card", "move", card_id, "--stage", stage]
    if position is not None:
        argv.extend(["--position", str(position)])
    return _json(_client().run(argv))


@mcp.tool()
def kanban_card_update(
    card_id: str,
    title: str | None = None,
    notes: str | None = None,
    epic_id: str | None = None,
    flagged: bool | None = None,
) -> str:
    """Actualiza campos de una tarjeta."""
    argv = ["card", "update", card_id]
    if title is not None:
        argv.extend(["--title", title])
    if notes is not None:
        argv.extend(["--notes", notes])
    if epic_id is not None:
        argv.extend(["--epic", epic_id])
    if flagged is True:
        argv.append("--flag")
    if flagged is False:
        argv.append("--no-flag")
    return _json(_client().run(argv))


@mcp.tool()
def kanban_card_archive(card_id: str) -> str:
    """Archiva una tarjeta."""
    return _json(_client().run(["card", "archive", card_id]))


@mcp.tool()
def kanban_report_week(board: str | None = None) -> str:
    """Informe semanal del tablero en markdown."""
    return _json(_client().run(["report", "--board", _board(board), "--md"]))


@mcp.tool()
def kanban_board_url(board: str | None = None) -> str:
    """URL del tablero en el servidor local (incluye tema por defecto)."""
    settings = _settings()
    url = settings.board_ui_url(board)
    return _json({
        "url": url,
        "default_open_target": settings.open_board_target,
        "hint": "Para abrir: kanban_open_board(target='cursor'|'external')",
    })


@mcp.tool()
def kanban_serve_restart() -> str:
    """Reinicia ``kanban serve`` (migrate + health check). Usar tras cambios en API/router o si la UI no refleja el código."""
    global _serve_manager
    if _serve_manager is None:
        settings = _settings()
        mgr = ServeManager(settings)
        result = mgr.restart()
    else:
        result = _serve_manager.restart()
    return _json(result)


@mcp.tool()
def kanban_open_board(
    board: str | None = None,
    target: str | None = None,
) -> str:
    """Abre el tablero: cursor (tab integrado de Cursor) o external (navegador del SO)."""
    settings = _settings()
    result = open_board(settings, board=board, target=target)
    return _json(result)


def run() -> None:
    # Sin banner en stderr: Cursor lo interpreta como error del MCP.
    mcp.run(show_banner=False)
