# board — design brief

> **Especificación visual y de componentes (canónica, actualizada):** [`design-system.md`](design-system.md)  
> **Fork Kuiper (SQLite, API, issue panel):** [`kuiper-architecture.md`](kuiper-architecture.md)

A personal kanban for developers who run AI coding agents (Claude Code, Codex) in the terminal. The upstream app ships as vanilla HTML/CSS/JS with optional E2E sync; the **Kuiper fork** adds local SQLite, stable issue IDs (`kb…`), and a full issue editor.

---

## Product intent (unchanged)

The defining artifact is not the card — it is the **resume command**. It comes from a terminal, is machine-generated, and is what gets the developer back into flight.

**Voice:** the machine speaks in **monospace** (stages, counts, sessions, dates, week ranges); the human speaks in **Avenir Next** (titles, notes). Mono always means “from the system.”

**Palette:** graphite with a violet cast, one accent — **amber** (terminal cursor). Project/epic/tag colors are the main extra chroma. Deliberately *not* near-black + acid green, *not* cream + serif.

**Aesthetic:** clean, minimal, intuitive motion — no long explanations in the UI.

```mermaid
flowchart TB
  subgraph upstream [Upstream kanban.page]
    LS[localStorage board.v2]
    SYNC[E2E sync opcional]
    PWA[PWA + SW]
  end
  subgraph kuiper [Fork Kuiper]
    SQL[(SQLite kuiper.db)]
    API[kanban serve :8765]
    UI["?kuiper=1&board=slug"]
  end
  upstream -.->|mismo UI base| kuiper
  API --> SQL
  UI --> API
```

---

## Hard requirements (original + current)

| # | Requirement | Status |
| --- | --- | --- |
| 1 | Browser app, vanilla HTML/CSS/JS, no build step | ✅ |
| 2 | Local-first storage | ✅ Upstream: `localStorage`. Kuiper: SQLite via `kanban serve` |
| 3 | Drag-and-drop between stages and within a column | ✅ Mouse: 5px move arms drag. Touch: 320ms hold, 8px move cancels |
| 4 | Session field with copy (`claude --resume …`) | ✅ `.chip` + amber sweep |
| 5 | Projects: add / rename / recolor / delete | ✅ Panel `P`, 8-color palette |
| 6 | Core kanban: CRUD, stages, filter, search, undo, backup | ✅ |
| 7 | Weekly report (America/Santiago, date override, partial export) | ✅ Modal `R`; export by tick |
| 8 | Minimal, animated, non-distracting UI | ✅ See [`design-system.md`](design-system.md) |
| 9 | *(added)* EN/ES interface | ✅ `i18n.js`, [`i18n-spec.md`](i18n-spec.md) |
| 10 | *(added)* Optional E2E sync between devices | ✅ `docs/sync.md` — not used in Kuiper local mode |
| 11 | *(added, Kuiper)* Issue IDs, epics, priority, tags, links, time, comments, history | ✅ `?kuiper=1` |

---

## Layout direction — resolved

```mermaid
flowchart LR
  A["✅ A Workbench<br/>board + overlays"] 
  B["❌ B Week ledger<br/>strip permanente"]
  C["❌ C Command surface<br/>solo ⌘K"]
  A -->|shipped| WIN[Decisión final]
  B -->|rechazado| R1["−260px · 2 scrolls"]
  C -->|rechazado| R2["alto coste aprendizaje"]
```

### ✅ Direction A — “Workbench” (shipped)

Board is the whole screen. Report, editor, projects, archive, and sync are **overlays** (sheet / panel), not permanent chrome.

```mermaid
block-beta
  columns 1
  block:chrome:1
    columns 5
    menu["≡ sidebar"]
    title["tablero"]
    filt["filtros"]
    srch["búsqueda"]
    acts["R · N · ⋯"]
  end
  block:cols:4
    columns 4
    c1["INBOX"]
    c2["DOING"]
    c3["WAITING"]
    c4["DONE"]
  end
  block:overlay:1
    columns 3
    sheet["sheet · informe · editor"]
    panel["panel · proyectos · archivo"]
    side["kuiper-side"]
  end
```

### ❌ Direction B — “Week ledger” (rejected)

Permanent week strip costs ~260px and a second scroll surface — conflicts with “no distractions.”

### ❌ Direction C — “Command surface” (rejected)

⌘K-only chrome raises learning cost — conflicts with “intuitive.”

---

## Card anatomy (upstream + Kuiper)

```mermaid
block-beta
  columns 1
  block:card:1
    columns 1
    row1["kb0042 · prioridad · ★ flag"]
    row2["▌ título — ui 14px"]
    row3["notas — muted, 2 líneas"]
    row4["tags proyecto / épica"]
    row5["▸ sesión agente — mono + copy"]
  end
```

| Zona | Voz | Detalle |
| --- | --- | --- |
| ID + prioridad | mono | Esquina superior; flag se desplaza si hay prioridad |
| Copiar enlace | mono + icono | `.kuiper-card-id` — solo copia URL; no abre editor |
| Título | ui | `.card h3` |
| Notas | ui muted | clamp 2 líneas |
| Tags (Kuiper) | ui + `--c` | dot proyecto, triángulo épica |
| Sesión | mono | `.chip`, sweep ámbar 1.2s al copiar |
| Borde izq. | `--c` | 2px = color de proyecto |
| Tooltips | ui + `kbd` | `tooltip.js` sustituye `title` nativo |

---

## Kuiper issue editor (modal sheet)

Large sheet (`min(960px)`, ~90vh): **main** (título, etapas, descripción markdown, enlaces, tabs) + **aside** 248px (proyecto, épica, prioridad, flag, tags, estimación, timer).

- Enlaces estilo Jira bajo descripción, antes de tabs.
- Tabs: Comentarios | Registro de tiempo | Historial — botonera `.seg` (igual que etapas).
- Comentarios: formulario fijo arriba; lista con scroll; edición inline (lápiz → textarea → Save/Cancel); `PATCH` API.
- Timer en aside: estimación + barra progreso antes de Timer/Manual; registro manual con picker fecha/hora in-app.
- Footer clásico oculto; acciones en menú `⋯` del header.

Detalle completo: [`design-system.md` §11](design-system.md).

```mermaid
flowchart TB
  subgraph main [Main — scroll vertical]
    T[título + etapas .seg]
    N[descripción markdown]
    L[enlaces vinculados]
    TB[tabs: comentarios · tiempo · historial]
    T --> N --> L --> TB
  end
  subgraph aside [Aside 248px]
    P[proyecto · épica · prioridad]
    F[flag]
    X[tags · estimación · timer]
    P --> F --> X
  end
  main --- aside
```

---

## Data model

### Upstream (`localStorage`, `board.v2` or `board.v2.<ns>`)

```js
{
  v: 2,
  theme: 'dark' | 'light',
  density: 'comfortable' | 'compact',
  locale: 'en' | 'es',              // also board.locale key globally
  asOf: null | 'YYYY-MM-DD',        // Chile calendar; null = today
  columns: [{ id, name }],          // order = stage order; rightmost = done
  projects: [{ id, name, color }],
  tasks: [{
    id, title, notes, projectId, session, flag,
    columnId, order, createdAt, updatedAt,
    archivedAt?, archivedFrom?,
  }],
  events: [{ id, taskId, title, type: 'created'|'moved', from, to, at, day }],
  filter: null | projectId,         // legacy single filter
  flagFilter: boolean,
  // + sync metadata when enabled (_contentGen, clocks, etc.) — see AGENTS.md / classic-board spec
}
```

### Kuiper (SQLite — see migrations)

Cards add: `priority` (0–4), `estimated_minutes`, `issue_number`, tags, comments, time entries, card links, event log for history. IDs stable `kb…` for Git branches. Board loaded via API; UI state (filters, group, sort, favorites) in `board.kuiper.prefs`.

```mermaid
erDiagram
  BOARD ||--o{ COLUMN : has
  BOARD ||--o{ PROJECT : has
  BOARD ||--o{ EPIC : has
  BOARD ||--o{ CARD : has
  PROJECT ||--o{ CARD : assigns
  EPIC ||--o{ CARD : groups
  CARD ||--o{ TAG : has
  CARD ||--o{ COMMENT : has
  CARD ||--o{ TIME_ENTRY : logs
  CARD ||--o{ CARD_LINK : links
  CARD ||--o{ EVENT : history
  COLUMN ||--o{ CARD : contains
```

---

## Events and report

`events` is append-only for the weekly report.

- `from` / `to`: **stage names as strings** at event time.
- `title`: snapshotted; report prefers live task title if it still exists.
- `at`: epoch ms — order within a day only.
- `day`: `YYYY-MM-DD` in **America/Santiago** — grouping key; override rewrites `day`, never `at`.

**Week math:** never raw epoch week boundaries — use `ymd`, `mondayOf`, `weekOf` in `core.js`.

**Modal vs export:**

```mermaid
flowchart TD
  E[events append-only] --> AGG[aggregateWeek]
  AGG --> MOD[Modal informe R]
  MOD --> TENSE{Agrupa por tense}
  TENSE --> SH[shipped]
  TENSE --> IF[inflight]
  MOD --> TICK{Usuario marca filas}
  TICK --> MD[toMarkdown]
  MD --> OUT["## Shipped / ## In flight<br/>solo título · proyecto"]
  MOD --> VIEW["Muestra ruta FROM → TO<br/>counts en cabecera"]
```

- Modal: all created/moved cards; grouped by **tense** (`shipped` vs `inflight`); shows route `FROM → TO`; user **ticks** rows to export.
- Markdown export: **title only**, grouped in `## Shipped` / `## In flight`, optional ` · Project` suffix — no counts, no routes.

```markdown
# Progress — 10–16 Aug 2026

## Shipped
- Onboarding tour v2 · Website

## In flight
- Invoice PDF export · API
```

**Date override:** per-row control `.rep-row .rd` in the report — tap opens date picker; discoverable but requires explicit action.

---

## Archive

Done is a buffer, not a shredder. Archive sets `archivedAt` + `archivedFrom` (stage name snapshot). Archived tasks leave the board and appear in panel `A`.

```mermaid
stateDiagram-v2
  [*] --> OnBoard: tarjeta activa
  OnBoard --> Archived: Archive en editor
  Archived --> OnBoard: Restore en panel A
  Archived --> Deleted: Delete → Sure? en 3.2s
  Deleted --> [*]
  note right of OnBoard: board nunca borra
  note right of Deleted: solo en panel Archive
```

**Safety:** board can only archive; **permanent delete only in Archive**, two-step: Delete → “Sure?” (`ARM_MS = 3200`), class `.ghost.danger.armed`. No modal dialog.

Report history survives archive and delete (snapshotted titles / `deleted` marker).

**Stages:** add/remove via ⋯ menu; ghost `+` column header on board hover only.

---

## Creation flows — resolved

```mermaid
flowchart TD
  N[Atajo N / botón +] --> COMP{¿inline?}
  COMP -->|Enter en phantom| QC[Quick composer]
  COMP -->|click tarjeta| ED[Sheet editor]
  QC --> SAVE[Guardar → tarjeta]
  ED --> KUI{?kuiper=1}
  KUI -->|sí| GRID[.kuiper-editor grid]
  KUI -->|no| CLASSIC[editor clásico + footer]
```

| Flow | Decision |
| --- | --- |
| Quick composer | ✅ Inline in column (`.composer` / `.phantom` + blinking cursor) |
| Full editor | ✅ Click card or `N` — sheet editor |
| Kuiper | ✅ Same sheet, transformed to `.kuiper-editor` grid |

---

## Empty states — resolved

No tutorial copy. Empty columns use **`.phantom`** (quiet slot + amber cursor blink). Empty lists use one line, `--faint`, often italic (`noArchived`, `kuiper-panel-empty`, archive/projects placeholders).

---

## Chroma — resolved

One accent + **eight project colors** (same as entity palette). **No stage-level color.** Kuiper adds priority hues and per-tag hash colors — still bounded to the same palette logic. See [`design-system.md` §8](design-system.md).

---

## Motion spec (as implemented)

Values from `app.js` + `styles.css`. Easing: `cubic-bezier(.2,.8,.25,1)` (`--ease` / `EASE`).

```mermaid
sequenceDiagram
  actor U as Usuario
  participant C as Card
  participant G as Ghost
  participant B as Board
  U->>C: pointer down
  alt mouse ≥5px
    C->>G: clone + lift scale 1.02
    G-->>B: tilt ±4.5°
    U->>G: drop
    G->>B: animate 190ms
    B->>B: FLIP vecinos 260ms
  else touch hold 320ms
    C->>G: lift sin scroll previo
  end
  U->>C: click sin drag
  C->>C: abrir editor sheet
```

| Moment | Behaviour |
| --- | --- |
| Card drag (mouse) | 5px movement arms drag |
| Card drag (touch) | 320ms hold lifts; &lt;8px move before hold = scroll |
| Ghost lift | `.card-ghost.lift` → `scale(1.02)`; tilt ±4.5° from velocity |
| Drop | Ghost animates to slot **190ms**, then removed |
| FLIP neighbours | **260ms** staggered (sort-by-project caps step ~45ms) |
| Column / project row drag | Same ghost language, 190ms settle |
| Copy session | `.chip.copied` — `wash` 760ms; revert **1200ms** |
| Card enter | `cardIn` 240ms, `translateY(6px)` |
| Composer | `cardIn` 220ms |
| Filter pill enter | `pillIn` 200ms |
| Modal / sheet | `sheetIn` 240ms — opacity + `translateY(10px)` + `scale(.985)`; scrim `fade` 180ms, blur 3px |
| Panel | `panelIn` 260ms from right |
| Menu | `menuIn` 160ms |
| Toast | `toastIn` 260ms / `toastOut` 180ms |
| Brand cursor | `.blink` 6×13px, 1.15s step |
| Timer discard | `kuiper-discard-pulse` 2.6s on dashed border |
| Reduced motion | All durations → ~0 |

---

## Open questions — all closed

| Question | Resolution |
| --- | --- |
| Report modal vs panel? | **Modal** (Direction A) |
| Date override placement? | **Per row** in report modal |
| Composer vs full editor? | **Both** |
| Empty state? | **Phantom + faint one-liners**, no prose |
| Stage colors? | **No** — project/epic/tag/priority only |

---

## What to read next

| Need | Document |
| --- | --- |
| Tokens, components, Kuiper UI rules | [`design-system.md`](design-system.md) |
| Sync invariants | [`sync.md`](sync.md) |
| CLI / agents | [`cli.md`](cli.md), [`agents.md`](agents.md) |
| i18n | [`i18n-spec.md`](i18n-spec.md) |
| Code architecture | [`AGENTS.md`](../AGENTS.md), [`specs/`](specs/) |
