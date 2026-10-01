# MCP Kanban (FastMCP)

Servidor MCP en Python que delega en el CLI `../cli/kanban.js` y gestiona `kanban serve`.

## Instalación

```powershell
cd mcp
py -3.12 -m venv .venv
.\.venv\Scripts\pip install -e ".[dev]"
copy kuiper-kanban.settings.sample kuiper-kanban.settings
```

Editar `kuiper-kanban.settings` (rutas `node_path`, org/board por defecto).

Cursor: `.cursor/mcp.json` apunta a `mcp/.venv/Scripts/python.exe -m kuiper_kanban_mcp` con `KANBAN_REPO_ROOT=${workspaceFolder}`.

En Linux/macOS, cambiar `Scripts/python.exe` por `bin/python`.

## Tests

```powershell
cd mcp
.\.venv\Scripts\python.exe -m pytest tests -q
```

## Datos locales

SQLite en `.local/kuiper-kanban/kuiper.db` (gitignored en la raíz del repo).
