# Spec: UI del tablero Kuiper

**Alcance:** rail, sidebar, columnas, swimlanes, tarjetas colapsadas, filtros y ordenación.

**Código:** `kuiper-ui.js`, `app.js` (`renderBoard`, `cardEl`), `styles.css` (§ swimlanes / `.kuiper-card`).

**Diseño visual:** [`design-system.md`](../design-system.md) §10.

---

## Activación

- Query: `?kuiper=1&board=<slug>&org=<org-slug>`.
- `html[data-kuiper="1"]` en documento.
- Estado vía `KuiperStore` + `KuiperUI.onBoardLoaded`.

---

## Comportamiento

### KB-1 Rail y sidebar

1. Toggle sidebar; favoritos; árbol org/board/proyecto.
2. Filtros: proyecto, épica, prioridad, flag (multi-select donde aplique).
3. Agrupación (`groupBy`): `none` | `project` | `epic` | `priority`.
4. Ordenación (`sortBy`): posición | prioridad | `updatedAt`.

### KB-2 Columnas (sin swimlanes)

1. Columnas fluidas hasta `--col-min`; scroll horizontal en tablero.
2. `+` en cabecera abre **editor Kuiper** con `columnId` de esa columna.
3. Agrupación visual opcional dentro de columna (`appendGrouped`) si `groupBy ≠ none` sin swimlanes.

### KB-3 Swimlanes

1. Activo cuando `groupBy !== 'none'`.
2. Una fila por grupo (proyecto, épica o prioridad); subgrid CSS alineado con etapas.
3. **Altura de fila:** la fila crece según la columna más poblada; sin `max-height` ni scroll interno en `.col-body`.
4. Scroll vertical del tablero completo si hay muchas filas.
5. Separador: `.kuiper-swimlane-sep` con marca (dot/tri/prioridad), label, count.

### KB-4 Tarjeta colapsada (`.kuiper-card`)

Orden visual del meta:

1. Barra de progreso tiempo (si hay estimación).
2. Pie (`.kuiper-card-foot`):
   - **Proyecto** — línea propia.
   - **Épica** — línea propia.
   - **Tags** — una sola línea horizontal (`TEST2`, `TEST3`, …).
3. **Issues relacionadas** — línea inferior (chips `VIBE-3`, …, máx. 3 + `+N`).

No mostrar antigüedad `updatedAt` (`1d`) en tarjeta Kuiper.

### KB-5 Identificador y prioridad

1. `.kuiper-card-id` copia URL `?card=<id>` sin abrir editor.
2. Badge prioridad top-right si `priority > 0`.
3. Flag desplazado si hay prioridad.

### KB-6 Drag y scroll

1. Misma semántica drag que modo clásico.
2. En swimlanes, scroll de tablero (no de columna) durante drag vertical.
3. Preservar `scrollLeft`/`scrollTop` del board en re-render swimlane.

### KB-7 Crear desde columna

1. `+` en cabecera → `openEditor(null, colId, { lane })`.
2. `lane` = clave del swimlane (`projectId`, `epicId` o prioridad).
3. Pre-relleno vía `KuiperUI.defaultsForLane` (ver [`kuiper-editor.md`](kuiper-editor.md)).

---

## Edge cases

| Caso | Comportamiento |
| --- | --- |
| Swimlane `__none__` | Proyecto/épica “ninguno” |
| Columna vacía en fila | Se estira a altura de la fila |
| Muchos tags en tarjeta | Ellipsis / overflow en línea única |
| Sin links | Omitir bloque `.kuiper-card-links` |
