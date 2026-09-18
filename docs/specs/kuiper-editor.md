# Spec: editor de issue Kuiper

**Alcance:** sheet `#editor` en modo Kuiper, aside, issue panel, creación y edición.

**Código:** `kuiper-ui.js`, `kuiper-issue-panel.js`, `kuiper-datetime-picker.js`, `app.js` (`openEditor`, `saveEditor`).

**Diseño visual:** [`design-system.md`](../design-system.md) §11.

---

## Apertura

| Origen | Comportamiento |
| --- | --- |
| Click tarjeta | Editar existente; carga `/cards/:id/detail` |
| `N` / `#newTask` | Nueva tarjeta; proyecto de filtros activos |
| `+` columna (Kuiper) | Nueva; `columnId` + defaults del swimlane |
| URL `?card=` | `KuiperUI.openCardFromUrl` |

---

## Cabecera del editor

1. Izquierda: ID tarjeta (solo si no es `new`).
2. Derecha (`.kuiper-editor-tools`, `margin-left: auto`):
   - Menú `⋯` (guardar duplicado, archivar, eliminar).
   - Botón primario **Crear** (nueva) o **Guardar** (existente).
   - Cerrar ✕ (descartar).
3. Pie clásico `#f-save` oculto en layout Kuiper.

---

## Aside (selectores)

Orden:

1. **Etapa** (`kuiperEdStageCtrl`) — sustituye chips `#f-stage` (ocultos).
2. **Proyecto**
3. **Épica** (filtrada por proyecto)
4. **Prioridad**
5. **Flag**

Bloques adicionales (`kuiper-issue-panel`):

- Tags con autocompletado desde tags del tablero.
- Estimación y barra progreso tiempo.
- Timer / tiempo manual.

---

## Área principal

1. Título (`#f-title`).
2. Notas markdown: preview + edición; scroll interno `kuiper-scroll`.
3. **Linked issues** (bloque principal):
   - Grupos `blockedBy`, `blocks`, `related`.
   - Compose: selector tipo (portal fixed) + buscador flotante de tarjetas.
   - Excluir self y ya enlazadas del suggest.
4. Tabs: Comentarios | Time log | Historial.

---

## Crear tarea (draft `editing === 'new'`)

1. `buildCreateBody` exige `project_id` (lane, filtros o primer proyecto).
2. `stage_id` = `draft.columnId`.
3. Tras POST, `refreshKuiperBoard()` y cierre editor.
4. Menú archivar/eliminar oculto hasta que exista tarjeta.

### Defaults desde swimlane (`defaultsForLane`)

| `groupBy` | Campos pre-rellenados |
| --- | --- |
| `project` | `projectId` = lane key |
| `epic` | `epicId` + `projectId` de la épica |
| `priority` | `priority` numérico |

---

## Colaboración (API)

| Feature | Persistencia |
| --- | --- |
| Tags | PATCH card + evento `tags_changed` |
| Links | POST/DELETE links |
| Comentarios | POST/PATCH comments |
| Time | POST/PATCH/DELETE time-entries; timer stop/discard |
| Historial | Eventos en `detail.events` |

`updated_at` de tarjeta: campos principales y move; no necesariamente cada comentario/time.

---

## Atajos

- `Ctrl/Cmd+Enter` o Enter en título → guardar.
- `Escape` → cerrar/descartar según contexto.
- Click scrim → guardar editor abierto.

---

## Eliminar tarjeta

1. Menú → Delete → diálogo con palabra de confirmación (`delete` / traducción).
2. DELETE vía store; cierra editor.

---

## Responsive

≤760px: grid editor una columna; aside debajo. Ver `design-system.md` §11.10.
