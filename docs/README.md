# Documentación — kanban.page

Índice de especificaciones y diseño del repositorio.

## Para agentes

| Documento | Uso |
| --- | --- |
| [`../AGENTS.md`](../AGENTS.md) | Punto de entrada: comandos, arquitectura, reglas que no romper |
| [`agents.md`](agents.md) | Comandos CLI para agentes en proyectos externos (upstream sync) |

## Especificaciones funcionales (`specs/`)

| Spec | Ámbito |
| --- | --- |
| [`specs/classic-board.md`](specs/classic-board.md) | Tablero clásico: localStorage, eventos, informe, render, drag, sync |
| [`specs/kuiper-platform.md`](specs/kuiper-platform.md) | Modo Kuiper: SQLite, `kanban serve`, API, CLI local |
| [`specs/kuiper-board-ui.md`](specs/kuiper-board-ui.md) | UI del tablero Kuiper: rail, swimlanes, tarjetas, filtros |
| [`specs/kuiper-editor.md`](specs/kuiper-editor.md) | Editor de issue, colaboración, creación desde columna |
| [`specs/kuiper-issue-schedule.md`](specs/kuiper-issue-schedule.md) | Fechas de planificación (`schedule_start_date` / `schedule_end_date`) |
| [`specs/kuiper-calendar-view.md`](specs/kuiper-calendar-view.md) | Vista Calendario (mes/semana/día) |
| [`specs/kuiper-gantt-view.md`](specs/kuiper-gantt-view.md) | Vista Gantt (barras, zoom, dependencias) |

## Diseño visual

| Documento | Uso |
| --- | --- |
| [`design-system.md`](design-system.md) | Tokens, tipografía, componentes, modo Kuiper (canónico) |
| [`design-brief.md`](design-brief.md) | Intención de producto original; conflictos → `design-system.md` |

## Sync y CLI (upstream)

| Documento | Uso |
| --- | --- |
| [`sync.md`](sync.md) | Relay E2E, merge, binding |
| [`sync-joining.md`](sync-joining.md) | Unirse / combinar tableros |
| [`sync-hardening.md`](sync-hardening.md) | Invariantes de endurecimiento |
| [`cli.md`](cli.md) | Cliente headless `kanban` |

## Otros

| Documento | Uso |
| --- | --- |
| [`i18n-spec.md`](i18n-spec.md) | Internacionalización |
| [`pwa-spec.md`](pwa-spec.md) | PWA e instalación |
| [`kuiper-architecture.md`](kuiper-architecture.md) | Resumen corto SQLite/API (ver también `specs/kuiper-platform.md`) |

## Jerarquía de conflictos

1. **CSS / clases** → `styles.css`
2. **Aspecto visual** → `design-system.md`
3. **Comportamiento** → `specs/*.md`
4. **Producto / marketing** → `README.md`, `design-brief.md`
