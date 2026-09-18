# Kuiper fork — arquitectura local

> **Spec completa:** [`specs/kuiper-platform.md`](specs/kuiper-platform.md)

Este fork añade persistencia **SQLite** y modo local sin relay upstream.

## Capas

- **SQLite** (`kuiper.db`) — única fuente de verdad
- **CLI** `kanban org|project|board|epic|card|db|report|serve`
- **API** `http://127.0.0.1:8765/api/v1/...` servida por `kanban serve`
- **UI** `?kuiper=1&board=hub-delivery` — carga vía `kuiper-store.js`

### API relevante (colaboración en tarjetas)

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/api/v1/cards/:id/detail` | Tags, links, time, comments, events |
| `POST` | `/api/v1/cards/:id/comments` | Añadir comentario |
| `PATCH` | `/api/v1/cards/:id/comments/:commentId` | Editar cuerpo de comentario |
| `POST` | `/api/v1/cards/:id/time-entries` | Manual o `action: start_timer` |
| `POST` | `/api/v1/cards/:id/time-entries/:entryId/stop` | Parar timer |
| `POST` | `/api/v1/cards/:id/time-entries/:entryId/discard` | Descartar timer |

Tras cambios en `server/api/router.js`, reiniciar `kanban serve`.

### Assets estáticos (`STATIC_FILES`)

Incluir en `server/api/router.js` cualquier JS nuevo servido por `kanban serve`, p. ej. `tooltip.js`, `kuiper-datetime-picker.js`. Orden en `index.html`: store → datetime-picker → issue-panel → ui → tooltip → app.

## Diferencias vs upstream

| Upstream | Kuiper |
| --- | --- |
| localStorage + sync E2E | SQLite + API local |
| IDs de tarjeta aleatorios | IDs `kbxxxx` inmutables para Git |
| Relay Cloudflare | Desactivado (`KANBAN_DB_PATH` o `?kuiper=1`) |

## Variables

- `KANBAN_DB_PATH` — ruta al fichero `.db`
- `KUIPER_LOCAL_MODE=1` — bloquea comandos relay del CLI upstream
