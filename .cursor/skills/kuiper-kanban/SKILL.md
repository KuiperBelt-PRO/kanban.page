---
name: kuiper-kanban
description: >-
  Operar el tablero Kanban Kuiper vía MCP (repo kanban.page): leer tableros/tarjetas,
  mover tarjetas, informes. Abrir la UI en tab Cursor (cursor-ide-browser) o navegador
  externo. Tras obtener card.id, aplicar git-workflow para ramas [kb…] y commits.
---

# Kanban Kuiper (MCP)

Servidor **FastMCP** en `mcp/` (Python ≥ 3.12). Configuración Cursor: `.cursor/mcp.json`.

## Cuándo usar

- Leer contexto de una tarjeta o tablero antes de implementar.
- Mover tarjetas entre etapas (INBOX → DOING → DONE).
- Generar informe semanal del tablero.
- Mostrar el tablero en **Cursor Browser** o en el **navegador del sistema**.

## Abrir el tablero (sin hooks)

El MCP **no** invoca el browser integrado. El agente debe hacerlo con **cursor-ide-browser**.

| Petición | Acción del agente |
| --- | --- |
| «Abre el tablero kanban» / «browser tab» | `kanban_open_board(target="cursor")` → URL en JSON → `browser_tabs` + `browser_navigate` |
| «Ábrelo en Chrome» | `kanban_open_board(target="external")` |
| Solo URL | `kanban_board_url` |

Tras recargar el MCP con `open_board_on_mcp_start: true` y `open_board_target: external`, se abre el navegador del SO. Con `cursor`, el agente abre el tab cuando el usuario pide cambios o al validar UI.

### Flujo Cursor Browser

1. URL con `kanban_board_url` o `kanban_open_board` — incluye `kuiper=1` y `theme=`.
2. `browser_tabs` (list) → `browser_navigate` (reutilizar tab si ya existe).
3. Validar según `Vibe-Coding/.cursor/rules/cursor-browser-mcp-testing-ide.mdc`.

## Settings (`mcp/kuiper-kanban.settings`)

Copiar desde `mcp/kuiper-kanban.settings.sample`. Variables útiles:

| Clave | Descripción |
| --- | --- |
| `cli_path` | `${repo_root}/cli/kanban.js` |
| `database_path` | `${repo_root}/.local/kuiper-kanban/kuiper.db` |
| `node_path` | Node del sistema (no el de Cursor) |
| `open_board_target` | `cursor` \| `external` \| `none` |

Entorno: `KANBAN_REPO_ROOT`, `KANBAN_DB_PATH`, `KANBAN_NODE`, `KUIPER_KANBAN_SETTINGS`.

## Bootstrap (primera vez)

```powershell
cd mcp
py -3.12 -m venv .venv
.\.venv\Scripts\pip install -e ".[dev]"
copy kuiper-kanban.settings.sample kuiper-kanban.settings
..\cli\kanban.js db migrate   # o vía MCP tras arrancar
```

En Linux/macOS: `.venv/bin/pip` y ajustar `command` en `.cursor/mcp.json`.

Recargar MCP en Cursor. El servidor arranca `kanban serve` si `auto_start_serve: true`.

## Reiniciar `kanban serve`

Tras cambios en `server/api/router.js` o migraciones: tool **`kanban_serve_restart`**.

## Tools MCP

| Acción | Tool |
| --- | --- |
| Reiniciar UI/API | `kanban_serve_restart` |
| Abrir tablero | `kanban_open_board` |
| URL | `kanban_board_url` |
| Snapshot | `kanban_board_show` |
| Tarjetas | `kanban_card_get`, `kanban_card_list`, create/move/archive/update |
| Épicas | `kanban_epic_list`, `kanban_epic_create` |
| Informe | `kanban_report_week` |

## Git y tarjetas

El MCP no ejecuta git. Rama `{repo-short}-{card.id}-{slug}`; commit `[{card.id}] …`.
