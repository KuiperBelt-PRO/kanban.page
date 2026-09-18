# Guía para agentes — kanban.page

Punto de entrada para trabajar en este repositorio (Cursor, Claude Code, etc.).

## Qué es este repo

Dos modos en el mismo código:

| Modo | Activación | Persistencia |
| --- | --- | --- |
| **Clásico (upstream)** | `index.html` sin `?kuiper=1` | `localStorage` + sync E2E opcional (`relay/`) |
| **Kuiper (fork)** | `?kuiper=1&board=<slug>` o `KANBAN_DB_PATH` | SQLite + API local (`kanban serve`) |

Vanilla HTML/CSS/JS, sin build. Lógica pura en `core.js`; UI en `app.js` + módulos Kuiper.

## Comandos

```bash
npm test                              # core + CLI
node --test tests/core.test.js        # lógica pura
node --test tests/api.test.js          # API Kuiper (si aplica)
node --test tests/db.test.js           # SQLite
```

Modo Kuiper local:

```bash
kanban serve                          # http://127.0.0.1:8765
# UI: ?kuiper=1&board=hub-delivery&org=<org-slug>
```

DOM: abrir `tests/dom.test.html` en Chrome (`?ns=test`). Ver [`README.md`](README.md#develop).

## Arquitectura de código

| Archivo | Responsabilidad |
| --- | --- |
| `core.js` | Fechas, semanas, informe, markdown, migración, merge sync, relojes |
| `app.js` | Render, drag, editor clásico, composer, proyectos, informe, sync loop |
| `kuiper-store.js` | Cliente HTTP hacia `/api/v1` |
| `kuiper-ui.js` | Rail, sidebar, swimlanes, tarjetas, editor layout Kuiper |
| `kuiper-issue-panel.js` | Tags, links, tiempo, comentarios, historial en editor |
| `kuiper-datetime-picker.js` | Pickers fecha/hora en tiempo manual |
| `server/` | API REST + SQLite |
| `cli/` | Cliente headless del relay (modo clásico) |

**Nueva lógica con casos borde** → `core.js` + tests en `tests/core.test.js`.

## Documentación (léela antes de cambiar comportamiento)

| Necesidad | Documento |
| --- | --- |
| Mapa completo | [`docs/README.md`](docs/README.md) |
| Tablero clásico, sync, informe | [`docs/specs/classic-board.md`](docs/specs/classic-board.md) |
| SQLite, API, serve | [`docs/specs/kuiper-platform.md`](docs/specs/kuiper-platform.md) |
| Swimlanes, tarjetas, filtros | [`docs/specs/kuiper-board-ui.md`](docs/specs/kuiper-board-ui.md) |
| Editor, crear tarea, colaboración | [`docs/specs/kuiper-editor.md`](docs/specs/kuiper-editor.md) |
| Tokens y componentes UI | [`docs/design-system.md`](docs/design-system.md) |
| Sync relay (detalle) | [`docs/sync.md`](docs/sync.md) |
| CLI headless | [`docs/cli.md`](docs/cli.md) |

## Reglas críticas (no romper)

### Modo clásico

- El **log de eventos** es la fuente de verdad del informe semanal; fechas en **America/Santiago**, nunca aritmética de epoch para días.
- **Relojes** (`fieldMt`, `mt`, `pmt`, `existMt`) solo en `stampChanges` — no `touch()` en mutaciones sueltas.
- **Merge sync**: ver [`docs/specs/classic-board.md`](docs/specs/classic-board.md) y [`docs/sync.md`](docs/sync.md).
- **Cerrar = guardar** en composer y editor (salvo Esc / descartar explícito).
- `render()` destruye el DOM; lógica `blur` debe deferir y comprobar `isConnected`.

### Modo Kuiper

- Tras cambios en `server/api/router.js`, reiniciar `kanban serve`.
- Añadir JS nuevos a `STATIC_FILES` en el router.
- IDs de tarjeta `VIBE-5` / `kbxxxx` son inmutables; enlaces y URL `?card=`.
- Crear tarea desde `+` de columna: abre editor con **etapa**, **proyecto/épica** del swimlane y botón **Crear** visible en cabecera.

### UI

- Cumplir [`docs/design-system.md`](docs/design-system.md) en cambios visuales.
- Touch: `(hover: none)` / `pointer: coarse` separados de `(max-width: 640px)`.

## SDD

Para features nuevas de producto: escribir o ampliar la spec en `docs/specs/` antes de implementar; enlazar desde este fichero o `docs/README.md`.
