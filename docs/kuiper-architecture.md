# Kuiper fork — arquitectura local

Este fork añade persistencia **SQLite** y modo local sin relay upstream.

## Capas

- **SQLite** (`kuiper.db`) — única fuente de verdad
- **CLI** `kanban org|project|board|epic|card|db|report|serve`
- **API** `http://127.0.0.1:8765/api/v1/...` servida por `kanban serve`
- **UI** `?kuiper=1&board=hub-delivery` — carga vía `kuiper-store.js`

## Diferencias vs upstream

| Upstream | Kuiper |
| --- | --- |
| localStorage + sync E2E | SQLite + API local |
| IDs de tarjeta aleatorios | IDs `kbxxxx` inmutables para Git |
| Relay Cloudflare | Desactivado (`KANBAN_DB_PATH` o `?kuiper=1`) |

## Variables

- `KANBAN_DB_PATH` — ruta al fichero `.db`
- `KUIPER_LOCAL_MODE=1` — bloquea comandos relay del CLI upstream
