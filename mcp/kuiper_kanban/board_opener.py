"""Apertura del tablero: navegador externo o URL para cursor-ide-browser."""

from __future__ import annotations

import webbrowser
from typing import Any

from kuiper_kanban.config import Settings

CURSOR_BROWSER_HINT = (
    "Abrir con cursor-ide-browser: browser_tabs (list), browser_navigate a la URL "
    "(newTab=true si no existe tab con el mismo board=)."
)


def open_board(
    settings: Settings,
    board: str | None = None,
    target: str | None = None,
) -> dict[str, Any]:
    """Abre el tablero en el SO o devuelve la URL para el browser integrado de Cursor."""
    chosen = (target or settings.open_board_target).strip().lower()
    url = settings.board_ui_url(board)

    if chosen == "none":
        return {"opened": False, "target": "none", "url": url}

    if chosen == "external":
        webbrowser.open(url)
        return {"opened": True, "target": "external", "url": url}

    return {
        "opened": False,
        "target": "cursor",
        "url": url,
        "hint": CURSOR_BROWSER_HINT,
    }


def request_open_on_start(settings: Settings) -> None:
    if not settings.open_board_on_mcp_start:
        return
    if settings.open_board_target == "external":
        open_board(settings, target="external")
