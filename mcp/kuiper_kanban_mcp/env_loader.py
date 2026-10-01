"""Carga de configuración para el servidor MCP."""

from __future__ import annotations

from kuiper_kanban.config import Settings


def load_settings() -> Settings:
    return Settings.from_env()
