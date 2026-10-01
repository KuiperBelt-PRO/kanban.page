"""Errores del cliente CLI kanban."""

from __future__ import annotations


class KanbanCliError(RuntimeError):
    """Error al ejecutar el CLI kanban."""

    def __init__(self, message: str, *, exit_code: int = 1, code: str | None = None) -> None:
        super().__init__(message)
        self.exit_code = exit_code
        self.code = code


class KanbanServeError(RuntimeError):
    """Error al arrancar o detener ``kanban serve``."""
