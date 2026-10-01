"""Smoke test del MCP kuiper-kanban (requiere CLI y DB)."""

from __future__ import annotations

import json
import sys

from kuiper_kanban.cli_client import CliClient
from kuiper_kanban_mcp.env_loader import load_settings


def main() -> int:
    settings = load_settings()
    client = CliClient(settings)
    client.run(["db", "migrate"])
    client.run(["db", "seed"])
    board = client.run(["board", "show", settings.default_board])
    print(json.dumps({"ok": True, "board": board.get("board", {})}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"smoke failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
