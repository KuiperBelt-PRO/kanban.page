# Spec: tablero clásico (modo upstream)

**Alcance:** `index.html` sin `?kuiper=1`, `localStorage`, sync relay opcional, informe semanal, CLI headless.

**Código:** `core.js`, `app.js`, `cli/`, `relay/`.

**Detalle sync:** [`sync.md`](../sync.md), [`sync-joining.md`](../sync-joining.md), [`sync-hardening.md`](../sync-hardening.md).

---

## Entrada / salida

| Concepto | Descripción |
| --- | --- |
| Estado | `state` en memoria; persistido en `localStorage` (`board.v2` o `board.v2.<ns>` con `?ns=`) |
| Tarjeta | `id`, `title`, `notes`, `columnId`, `order`, `projectId`, `flag`, `session`, relojes, `updatedAt` |
| Columna | Última columna = etapa **done** (por posición, no por nombre) |
| Evento | Append-only en `state.events`; snapshot de nombres de etapa en el momento del evento |

---

## Comportamiento

### CB-1 Event log e informe

1. El informe semanal agrupa por `day` (`YYYY-MM-DD`, America/Santiago).
2. `at` (epoch ms) solo ordena dentro del mismo día.
3. Nunca calcular fechas con aritmética de epoch para días (DST Chile).
4. El informe lista creadas y movidas; la exportación markdown es más estrecha (solo títulos tickados).
5. Tense `shipped` / `inflight` según cruce de la línea done esta semana (ver `core.js` `aggregateWeek`).
6. El tick del modal es el único filtro de exportación; no re-filtrar en `toMarkdown`.

### CB-2 Qué no reconstruye el log

- Archivar, restaurar, `deleteColumn`, migraciones pueden cambiar `columnId` sin evento.
- El informe basado solo en eventos no reconstruye estado vivo del tablero.

### CB-3 Relojes y merge

1. `stampChanges` es el único lugar que avanza relojes al guardar.
2. `fieldMt`, `mt`, `pmt`, `existMt` tienen roles distintos; placement no avanza content.
3. `updatedAt` es metadata de UI, no reloj de contenido tras migración.
4. Solo `existMt` discute con tombstones para borrado permanente.
5. Orden de columnas: vector atómico `columnsMt`; etapas nuevas se insertan antes de la última (done).

Ver invariantes completos en [`sync.md`](../sync.md) y comentarios en `core.js`.

### CB-4 Renderizado

1. `render()` vacía y reconstruye el tablero (`flip()` preserva scroll).
2. `save()` debounced 120 ms.
3. `blur` en composer: defer + `isConnected` antes de commit.

### CB-5 Seguridad de datos

1. Archivar en tablero; borrado irreversible solo en archivo con confirmación.
2. Cerrar composer/editor guarda; Esc o ✕ descartan (editor).
3. Migración nunca pierde el log de eventos.
4. Sync opt-in; disconnect / end sync reversibles según [`sync.md`](../sync.md).

### CB-6 Drag

1. Patrón compartido: ghost, FLIP, `prefers-reduced-motion`.
2. Tarjetas: umbral 5 px; touch: hold 320 ms antes de lift.
3. Columnas: no incluir `.ghost-col` en reordenación.
4. Reordenar etapas cambia qué cuenta como “done” en informes.

### CB-7 Composer inline

1. `openComposer(colId)` inserta textarea en columna.
2. Enter sin shift crea tarjeta; blur guarda (no en swimlanes Kuiper — ver [`kuiper-editor.md`](kuiper-editor.md)).

---

## CLI headless

Segundo cliente del mismo relay; `require('core.js')` directo. Ver [`cli.md`](../cli.md) y [`agents.md`](../agents.md).

**Prohibido en CLI:** crear tablero, DELETE relay, reordenar/añadir etapas, secret como argumento.

---

## Tests

| Suite | Qué cubre |
| --- | --- |
| `tests/core.test.js` | Fechas, informe, merge, relojes, markdown |
| `tests/cli.test.js` | Escrituras headless, reintentos |
| `tests/dom.test.html` | Interacción real en iframe |
