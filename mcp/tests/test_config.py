"""Tests de configuración."""

from __future__ import annotations

import os
from pathlib import Path

from kuiper_kanban.config import Settings


def test_resolve_node_prefers_system_node_on_windows(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("KANBAN_NODE", raising=False)
    settings = Settings.for_tests(tmp_path, node_path=None)
    if os.name != "nt":
        return
    node = settings.resolve_node()
    assert node.endswith("nodejs\\node.exe")
    assert Path(node).is_file()
