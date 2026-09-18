# Spec: plataforma Kuiper (SQLite + API)

**Alcance:** persistencia local, `kanban serve`, cliente `kuiper-store.js`, CLI `cli/kuiper/`.

**Activación UI:** `?kuiper=1&board=<slug>&org=<org-slug>`.

**Variables:** `KANBAN_DB_PATH`, `KUIPER_LOCAL_MODE=1`.

---

## Arquitectura

```
SQLite (kuiper.db)
    ↑
kanban serve :8765
    ├── /api/v1/*  → server/api/router.js
    └── /*         → estáticos (index.html, *.js, styles.css)
```

- **Fuente de verdad:** SQLite (no localStorage del tablero en modo Kuiper).
- **IDs:** `issue_number` por proyecto (`VIBE-5`, `KBWB-1`, …); `id` interno inmutable.
- **Relay upstream:** desactivado en este fork cuando hay DB local.

---

## API REST (`/api/v1`)

### Lectura

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/health` | Salud |
| GET | `/organizations` | Orgs |
| GET | `/navigation` | Árbol org → boards → proyectos |
| GET | `/boards/:slug` | Snapshot crudo |
| GET | `/boards/:slug/state` | Estado para UI (`board-view.js`) |
| GET | `/boards/:slug/tags` | Tags del tablero |
| GET | `/cards/:id/detail` | Tags, links, time, comments, events, timer activo |

### Escritura tarjeta

| Método | Ruta | Uso |
| --- | --- | --- |
| POST | `/cards` | Crear (requiere `project_id`, `stage_id`, `title`, …) |
| PATCH | `/cards/:id` | Actualizar campos, tags, mover implícito vía `stage_id` |
| POST | `/cards/:id/move` | Mover con posición (si expuesto) |

### Colaboración

| Método | Ruta | Uso |
| --- | --- | --- |
| POST | `/cards/:id/links` | Añadir link (`link_type`: `blocks`, `blocked_by`, `related`) |
| DELETE | `/cards/:id/links/:linkId` | Quitar link |
| POST | `/cards/:id/comments` | Comentario |
| PATCH | `/cards/:id/comments/:commentId` | Editar comentario |
| POST | `/cards/:id/time-entries` | Manual o `action: start_timer` |
| PATCH | `/cards/:id/time-entries/:entryId` | Editar entrada |
| DELETE | `/cards/:id/time-entries/:entryId` | Borrar entrada |
| POST | `.../time-entries/:id/stop` | Parar timer |
| POST | `.../time-entries/:id/discard` | Descartar timer |

CORS: localhost/127.0.0.1; métodos incluyen `DELETE`.

---

## Cliente UI (`kuiper-store.js`)

1. Resuelve `board` de query string.
2. Carga estado inicial vía `/boards/:slug/state`.
3. Mutaciones: `createCard`, `patchCard`, endpoints de detalle.
4. `Content-Type: application/json` solo cuando hay body.

---

## Migraciones

- SQL en `migrations/`; aplicar con flujo documentado en `migrations/README.md`.
- `004_card_collaboration.sql`: tags, links, time, comments.

---

## Estáticos

Cualquier JS nuevo debe listarse en `STATIC_FILES` (`server/api/router.js`) y cargarse en `index.html` en orden:

`kuiper-store` → `kuiper-datetime-picker` → `kuiper-issue-panel` → `kuiper-ui` → `tooltip` → `app`.

---

## Operación

1. Tras cambiar router o repos, **reiniciar** `kanban serve`.
2. Tests: `node --test tests/api.test.js`, `tests/db.test.js`.

---

## Diferencias vs upstream

| Upstream | Kuiper |
| --- | --- |
| localStorage + sync E2E | SQLite + API |
| IDs aleatorios | Código `PROJ-N` |
| Sin editor colaborativo | Tags, links, tiempo, comentarios |
