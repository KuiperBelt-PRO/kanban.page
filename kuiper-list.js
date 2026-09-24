/* Vista Lista Kuiper — tabla de issues con filtros compartidos */

function flattenListRows(topTasks, allTasks, collapsedParents = new Set()) {
  const rows = [];
  const childrenOf = parentId => (allTasks || [])
    .filter(t => t.parentId === parentId && !t.archivedAt)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const t of topTasks) {
    const children = childrenOf(t.id);
    rows.push({
      kind: 'issue',
      task: t,
      isSubtask: false,
      childCount: children.length,
    });
    if (!collapsedParents.has(t.id)) {
      for (const child of children) {
        rows.push({ kind: 'issue', task: child, isSubtask: true, parentId: t.id, childCount: 0 });
      }
    }
  }
  return rows;
}

const LIST_ICON_CAL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M5.5 2.5v2M10.5 2.5v2M2.5 6.5h11" stroke-linecap="round"/></svg>';
const LIST_ICON_STAR = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.5L9.47 6.28 13.52 6.51 10.38 9.07 11.41 12.99 8 10.8 4.59 12.99 5.62 9.07 2.48 6.51 6.53 6.28Z"/></svg>';
const LIST_ICON_STAR_FILL = '<svg viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.5L9.47 6.28 13.52 6.51 10.38 9.07 11.41 12.99 8 10.8 4.59 12.99 5.62 9.07 2.48 6.51 6.53 6.28Z"/></svg>';

const KuiperList = (() => {
  let ctx = {};
  let collapsedParents = new Set();

  function colCount() {
    return isCompact() ? 11 : 12;
  }

  function colgroupHtml(compact) {
    if (compact) {
      return `<colgroup>
        <col class="kuiper-list-col-key" />
        <col class="kuiper-list-col-type" />
        <col class="kuiper-list-col-title" />
        <col class="kuiper-list-col-star" />
        <col class="kuiper-list-col-stage" />
        <col class="kuiper-list-col-pri" />
        <col class="kuiper-list-col-project" />
        <col class="kuiper-list-col-epic" />
        <col class="kuiper-list-col-sprint" />
        <col class="kuiper-list-col-date" />
        <col class="kuiper-list-col-date" />
      </colgroup>`;
    }
    return `<colgroup>
      <col class="kuiper-list-col-key" />
      <col class="kuiper-list-col-type" />
      <col class="kuiper-list-col-title" />
      <col class="kuiper-list-col-star" />
      <col class="kuiper-list-col-stage" />
      <col class="kuiper-list-col-pri" />
      <col class="kuiper-list-col-project" />
      <col class="kuiper-list-col-epic" />
      <col class="kuiper-list-col-sprint" />
      <col class="kuiper-list-col-date" />
      <col class="kuiper-list-col-date" />
      <col class="kuiper-list-col-updated" />
    </colgroup>`;
  }

  function tr(key, vars) {
    return ctx.tr?.(key, vars) || key;
  }

  function locale() {
    return ctx.locale?.() === 'es' ? 'es-ES' : 'en-GB';
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function dash() {
    return '—';
  }

  function emptyValHtml() {
    return `<span class="kuiper-list-empty-val kuiper-list-muted">${dash()}</span>`;
  }

  function formatYmdDisplay(ymd) {
    const val = ymd ? esc(ymd) : `<span class="kuiper-list-muted">${dash()}</span>`;
    return `<span class="kuiper-list-date-inner"><span class="kuiper-list-date-icon kuiper-list-hover-btn" aria-hidden="true">${LIST_ICON_CAL}</span><span class="kuiper-list-date-val">${val}</span></span>`;
  }

  function formatYmdValue(ymd) {
    return ymd || '';
  }

  function formatUpdated(ts) {
    if (!ts) return dash();
    try {
      return new Date(ts).toLocaleDateString(locale(), { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dash();
    }
  }

  function isCompact() {
    return document.documentElement.dataset.density === 'compact';
  }

  function loadCollapsed() {
    const prefs = KuiperUI.loadViewPrefs?.() || {};
    collapsedParents = new Set(prefs.listCollapsedParents || []);
  }

  function saveCollapsed() {
    KuiperUI.saveUiPrefs?.({ listCollapsedParents: [...collapsedParents] });
  }

  function toggleCollapsed(parentId) {
    if (collapsedParents.has(parentId)) collapsedParents.delete(parentId);
    else collapsedParents.add(parentId);
    saveCollapsed();
    ctx.renderBoard?.();
  }

  function topLevelTasks() {
    const st = ctx.state?.();
    if (!st) return [];
    return (st.tasks || []).filter(t => {
      if (t.archivedAt) return false;
      if (ctx.boardTaskVisible && !ctx.boardTaskVisible(t)) return false;
      return BoardCore.isBoardTopLevelTask(t);
    });
  }

  function buildListStructure(topTasks, allTasks) {
    const structure = [];
    const sortedTop = KuiperUI.sortTasks(topTasks);
    if (KuiperUI.isSwimlaneMode?.()) {
      const lanes = KuiperUI.orderedSwimlanes(sortedTop);
      for (const lane of lanes) {
        structure.push({ kind: 'group', lane });
        const inLane = KuiperUI.sortTasks(sortedTop.filter(t => KuiperUI.taskInLane(t, lane.key)));
        for (const row of flattenListRows(inLane, allTasks, collapsedParents)) structure.push(row);
      }
    } else {
      for (const row of flattenListRows(sortedTop, allTasks, collapsedParents)) structure.push(row);
    }
    return structure;
  }

  function epicProjectId(epic) {
    return epic?.projectId ?? epic?.project_id ?? null;
  }

  function epicsForProject(projectId) {
    const st = ctx.state?.();
    if (!st || !projectId) return [];
    return (st.epics || []).filter(e => epicProjectId(e) === projectId);
  }

  /** Épicas para el desplegable: las del proyecto; si no hay, todas (como el editor sin proyecto). */
  function epicsForPick(task) {
    const st = ctx.state?.();
    const all = st?.epics || [];
    const pid = task?.projectId || null;
    if (!pid) return all;
    const matched = all.filter(e => epicProjectId(e) === pid);
    return matched.length ? matched : all;
  }

  function sprintsForProject(projectId) {
    const st = ctx.state?.();
    const list = st?.sprints || [];
    if (!projectId) return list;
    return list.filter(s => (s.projectIds || []).includes(projectId));
  }

  function columnOf(task) {
    const st = ctx.state?.();
    return (st?.columns || []).find(c => c.id === task.columnId) || null;
  }

  function epicOf(task) {
    const st = ctx.state?.();
    if (!task?.epicId) return null;
    return (st?.epics || []).find(e => e.id === task.epicId) || null;
  }

  function inheritedEpicForTask(task) {
    if (BoardCore.isSubtask(task) && task.parentId) {
      const parent = ctx.state?.().tasks?.find(t => t.id === task.parentId);
      if (parent) return epicOf(parent);
    }
    return epicOf(task);
  }

  function syncSubtasksEpicFromParent(parentId, projectId, epicId) {
    for (const child of ctx.state?.().tasks || []) {
      if (child.parentId === parentId && !child.archivedAt) {
        child.projectId = projectId;
        child.epicId = epicId || null;
      }
    }
  }

  function sprintOf(task) {
    const st = ctx.state?.();
    if (!task?.sprintId) return null;
    return (st?.sprints || []).find(s => s.id === task.sprintId) || null;
  }

  function projectCellDisplay(task) {
    const p = KuiperUI.projectOf(task);
    if (!p) return emptyValHtml();
    const color = p.color || '';
    const dot = color ? `<span class="kuiper-list-dot" style="--c:${esc(color)}"></span>` : '';
    return `<span class="kuiper-list-project-inner">${dot}<span class="kuiper-list-trunc">${esc(p.name)}</span></span>`;
  }

  function stageCellDisplay(task) {
    const col = columnOf(task);
    if (!col) return emptyValHtml();
    const label = KuiperUI.stageLabel(col.name);
    return `<span class="kuiper-list-stage">${esc(label)}</span>`;
  }

  function priorityCellDisplay(task) {
    const html = KuiperUI.priorityMarkHtml(task.priority || 0);
    return html || emptyValHtml();
  }

  function editableTd(field, displayHtml, extraClass = '') {
    return `<td class="kuiper-list-cell kuiper-list-editable ${extraClass}" data-field="${field}" tabindex="0"><span class="kuiper-list-display">${displayHtml}</span></td>`;
  }

  let datePickerReady = false;

  function ensureDatePicker() {
    if (datePickerReady || typeof KuiperDateTimePicker === 'undefined') return;
    datePickerReady = true;
    KuiperDateTimePicker.init?.({
      tr: key => tr(key),
      locale: () => ctx.locale?.() || 'es',
    });
  }

  function buildFieldPick(task, field) {
    const st = ctx.state?.();
    if (field === 'issueType') {
      if (BoardCore.isSubtask(task)) return { disabled: true };
      const pool = BoardCore.ISSUE_TYPES.filter(t => t !== 'subtask');
      return {
        options: pool.map(t => ({ value: t, label: KuiperUI.issueTypeLabel(t) })),
        current: BoardCore.normalizeIssueType(task.issueType),
        optionHtml: opt =>
          `<span class="kuiper-drop-opt kuiper-opt-issue">${KuiperUI.issueTypeMarkHtml(opt.value, { size: 'sm' })}<span>${esc(opt.label)}</span></span>`,
      };
    }
    if (field === 'stage') {
      const cols = st?.columns || [];
      return {
        options: cols.map(c => ({ value: c.id, label: KuiperUI.stageLabel(c.name) })),
        current: task.columnId || cols[0]?.id,
      };
    }
    if (field === 'priority') {
      const levels = [0, 1, 2, 3, 4];
      return {
        options: levels.map(level => ({
          value: level,
          label: KuiperUI.priorityLabel(level),
          level,
        })),
        current: Number(task.priority) || 0,
        optionHtml: opt => KuiperUI.priorityPickOptionHtml(opt),
      };
    }
    if (field === 'project') {
      const projects = st?.projects || [];
      return {
        options: [{ value: null, label: tr('none') }].concat(
          projects.map(p => ({ value: p.id, label: p.name, color: p.color })),
        ),
        current: task.projectId || null,
        optionHtml: opt => {
          if (!opt.color) return `<span class="kuiper-drop-opt">${esc(opt.label)}</span>`;
          return `<span class="kuiper-drop-opt kuiper-opt-proj" style="--c:${esc(opt.color)}"><span class="dot"></span><span>${esc(opt.label)}</span></span>`;
        },
      };
    }
    if (field === 'epic') {
      if (!BoardCore.issueTypeAllowsEpicLink(task.issueType)) return { disabled: true };
      const epicList = epicsForPick(task);
      return {
        options: [{ value: null, label: tr('noEpic') }].concat(
          epicList.map(e => ({ value: e.id, label: e.title, epic: e })),
        ),
        current: task.epicId || null,
        optionHtml: opt => {
          if (!opt.epic) return `<span class="kuiper-drop-opt">${esc(opt.label)}</span>`;
          const projId = epicProjectId(opt.epic);
          const proj = (st?.projects || []).find(p => p.id === projId);
          const hint = proj ? ` · ${proj.name}` : '';
          return `<span class="kuiper-list-drop-epic kuiper-drop-opt"><span class="kuiper-list-trunc">${esc(opt.label)}</span>${proj ? `<span class="kuiper-list-epic-proj">${esc(hint)}</span>` : ''}</span>`;
        },
      };
    }
    if (field === 'sprint') {
      return {
        options: [{ value: null, label: tr('sprintNone') }].concat(
          sprintsForProject(task.projectId).map(s => ({
            value: s.id,
            label: s.name,
            sprint: s,
          })),
        ),
        current: task.sprintId || null,
        optionHtml: opt => {
          if (!opt.sprint) return `<span class="kuiper-drop-opt">${esc(opt.label)}</span>`;
          const range = `${opt.sprint.startDate || opt.sprint.start_date || ''} – ${opt.sprint.endDate || opt.sprint.end_date || ''}`;
          return `<span class="kuiper-drop-opt" title="${esc(range)}">${esc(opt.label)}</span>`;
        },
      };
    }
    return null;
  }

  function keyCell(task, { isSubtask, childCount }) {
    const idBtn = KuiperUI.cardIdButtonHtml(task.id);
    const indent = isSubtask ? '<span class="kuiper-list-indent" aria-hidden="true"></span>' : '';
    let collapse = '<span class="kuiper-list-collapse-spacer" aria-hidden="true"></span>';
    if (!isSubtask && childCount > 0) {
      const expanded = !collapsedParents.has(task.id);
      collapse = `<button type="button" class="kuiper-list-collapse" data-parent-id="${esc(task.id)}" aria-expanded="${expanded}" aria-label="${esc(tr('listToggleSubtasks'))}">${expanded ? '▾' : '▸'}</button>`;
    }
    return `<span class="kuiper-list-key-inner">${collapse}${indent}${idBtn || esc(task.id)}</span>`;
  }

  function titleCell(task) {
    const indent = BoardCore.isSubtask(task) ? '<span class="kuiper-list-indent" aria-hidden="true"></span>' : '';
    return `${indent}<button type="button" class="kuiper-list-title-open"><span class="kuiper-list-title-text">${esc(task.title || '')}</span></button>`;
  }

  function starCell(task) {
    const on = !!task.flag;
    const title = on ? tr('unflag') : tr('flag');
    const icon = on ? LIST_ICON_STAR_FILL : LIST_ICON_STAR;
    return `<button type="button" class="kuiper-list-star-btn" aria-pressed="${on}" title="${esc(title)}" aria-label="${esc(title)}">${icon}</button>`;
  }

  function epicCellHtml(epic, { inherited = false } = {}) {
    if (!epic) return emptyValHtml();
    const cls = inherited ? ' kuiper-list-inherited-epic' : '';
    return `<span class="kuiper-list-trunc${cls}">${esc(epic.title)}</span>`;
  }

  function rowHtml(task, { isSubtask = false, childCount = 0 } = {}) {
    const subCls = isSubtask ? ' is-subtask' : '';
    const parentCls = !isSubtask && childCount > 0 && collapsedParents.has(task.id) ? ' is-collapsed' : '';
    const epic = inheritedEpicForTask(task);
    const sprint = sprintOf(task);
    const epicCol = BoardCore.isSubtask(task)
      ? `<td class="kuiper-list-cell kuiper-list-epic" title="${esc(tr('listEpicInherited'))}">${epicCellHtml(epic, { inherited: true })}</td>`
      : (BoardCore.issueTypeAllowsEpicLink(task.issueType)
        ? editableTd('epic', epicCellHtml(epic), 'kuiper-list-epic')
        : `<td class="kuiper-list-cell kuiper-list-epic">${emptyValHtml()}</td>`);
    const updatedCell = isCompact()
      ? ''
      : `<td class="kuiper-list-cell kuiper-list-date">${formatUpdated(task.updatedAt)}</td>`;
    return `<tr class="kuiper-list-row${subCls}${parentCls}" data-id="${esc(task.id)}" role="row">
      <td class="kuiper-list-cell kuiper-list-key">${keyCell(task, { isSubtask, childCount })}</td>
      ${editableTd('issueType', KuiperUI.issueTypeMarkHtml(task.issueType, { size: 'sm' }), 'kuiper-list-type')}
      <td class="kuiper-list-cell kuiper-list-title">${titleCell(task)}</td>
      <td class="kuiper-list-cell kuiper-list-star">${starCell(task)}</td>
      ${editableTd('stage', stageCellDisplay(task))}
      ${editableTd('priority', priorityCellDisplay(task), 'kuiper-list-pri')}
      ${editableTd('project', projectCellDisplay(task), 'kuiper-list-project')}
      ${epicCol}
      ${editableTd('sprint', sprint ? `<span class="kuiper-list-trunc">${esc(sprint.name)}</span>` : emptyValHtml())}
      ${editableTd('start', formatYmdDisplay(task.scheduleStartDate), 'kuiper-list-date')}
      ${editableTd('end', formatYmdDisplay(task.scheduleEndDate), 'kuiper-list-date')}
      ${updatedCell}
    </tr>`;
  }

  function taskSnapshot(t) {
    return {
      columnId: t.columnId,
      priority: t.priority,
      projectId: t.projectId,
      epicId: t.epicId,
      sprintId: t.sprintId,
      issueType: t.issueType,
      scheduleStartDate: t.scheduleStartDate,
      scheduleEndDate: t.scheduleEndDate,
    };
  }

  function apiPatchFromSnapshot(snap, t) {
    const patch = {};
    if (snap.columnId !== t.columnId) patch.stage_id = t.columnId;
    if ((snap.priority || 0) !== (t.priority || 0)) patch.priority = t.priority || 0;
    if (snap.projectId !== t.projectId) patch.project_id = t.projectId;
    if ((snap.epicId || null) !== (t.epicId || null)) {
      patch.epic_id = t.epicId ?? null;
      if (t.epicId && t.projectId) patch.project_id = t.projectId;
    }
    if ((snap.sprintId || null) !== (t.sprintId || null)) patch.sprint_id = t.sprintId || null;
    if (BoardCore.normalizeIssueType(snap.issueType) !== BoardCore.normalizeIssueType(t.issueType)) {
      patch.issue_type = BoardCore.normalizeIssueType(t.issueType);
    }
    if ((snap.scheduleStartDate || null) !== (t.scheduleStartDate || null)) {
      patch.schedule_start_date = t.scheduleStartDate ?? null;
    }
    if ((snap.scheduleEndDate || null) !== (t.scheduleEndDate || null)) {
      patch.schedule_end_date = t.scheduleEndDate ?? null;
    }
    return patch;
  }

  async function applyFieldPatch(taskId, localFn) {
    const st = ctx.state?.();
    const t = st?.tasks?.find(x => x.id === taskId);
    if (!t || typeof KuiperStore === 'undefined') return;
    const snap = taskSnapshot(t);
    localFn(t);
    if (!BoardCore.isSubtask(t)) {
      const epicChanged = (snap.epicId || null) !== (t.epicId || null);
      const projChanged = snap.projectId !== t.projectId;
      if (epicChanged || projChanged) {
        syncSubtasksEpicFromParent(taskId, t.projectId, t.epicId);
      }
    }
    const apiPatch = apiPatchFromSnapshot(snap, t);
    if (!Object.keys(apiPatch).length) return;
    t.updatedAt = Date.now();
    ctx.renderBoard?.();
    try {
      await KuiperStore.patchCard(taskId, apiPatch);
      ctx.save?.();
    } catch (err) {
      Object.assign(t, snap);
      ctx.renderBoard?.();
      ctx.toast?.(tr('listSaveFailed'));
      console.warn('list patch failed', err);
    }
  }

  function taskById(taskId) {
    return ctx.state?.().tasks?.find(t => t.id === taskId) || null;
  }

  function applyFieldValue(taskId, field, value) {
    if (field === 'stage') {
      applyFieldPatch(taskId, t => { t.columnId = value; });
    } else if (field === 'priority') {
      applyFieldPatch(taskId, t => { t.priority = Number(value) || 0; });
    } else if (field === 'project') {
      const projectId = value || null;
      applyFieldPatch(taskId, t => {
        t.projectId = projectId;
        if (projectId && t.epicId) {
          const epic = (ctx.state?.().epics || []).find(e => e.id === t.epicId);
          if (epic && epic.projectId !== projectId) t.epicId = null;
        }
        if (!projectId) t.epicId = null;
      });
    } else if (field === 'epic') {
      applyFieldPatch(taskId, t => {
        if (!value) {
          t.epicId = null;
          return;
        }
        const epic = (ctx.state?.().epics || []).find(e => e.id === value);
        const epicProj = epicProjectId(epic);
        t.epicId = value;
        if (epicProj) t.projectId = epicProj;
      });
    } else if (field === 'sprint') {
      applyFieldPatch(taskId, t => { t.sprintId = value || null; });
    } else if (field === 'issueType') {
      const issueType = BoardCore.normalizeIssueType(value);
      applyFieldPatch(taskId, t => {
        t.issueType = issueType;
        if (!BoardCore.issueTypeAllowsEpicLink(issueType)) t.epicId = null;
        if (!BoardCore.issueTypeAllowsParent(issueType)) t.parentId = null;
      });
    } else if (field === 'start' || field === 'end') {
      const ymd = value || null;
      applyFieldPatch(taskId, t => {
        if (field === 'start') t.scheduleStartDate = ymd;
        else t.scheduleEndDate = ymd;
      });
    }
  }

  function openCellPicker(td) {
    const row = td.closest('.kuiper-list-row');
    const taskId = row?.dataset.id;
    const task = taskById(taskId);
    const field = td.dataset.field;
    if (!task || !field) return;

    KuiperUI.closeDropMenus?.();
    const anchor = td.querySelector('.kuiper-list-display') || td;

    if (field === 'start' || field === 'end') {
      ensureDatePicker();
      const val = field === 'start'
        ? formatYmdValue(task.scheduleStartDate)
        : formatYmdValue(task.scheduleEndDate);
      KuiperDateTimePicker.openDate({
        anchor,
        value: val || undefined,
        scrim: true,
        onPick: ymd => applyFieldValue(taskId, field, ymd || null),
      });
      return;
    }

    const pick = buildFieldPick(task, field);
    if (!pick) return;
    if (pick.disabled) {
      ctx.toast?.(tr('listFieldNotEditable'));
      return;
    }
    KuiperUI.openAnchoredPickMenu(
      anchor,
      pick.options,
      pick.current,
      value => applyFieldValue(taskId, field, value),
      { optionHtml: pick.optionHtml },
    );
  }

  async function toggleListFlag(taskId) {
    const t = taskById(taskId);
    if (!t || typeof KuiperStore === 'undefined') return;
    const was = !!t.flag;
    const next = !was;
    t.flag = next;
    t.updatedAt = Date.now();
    ctx.renderBoard?.();
    try {
      await KuiperStore.patchCard(taskId, { flagged: next });
      ctx.save?.();
    } catch (err) {
      t.flag = was;
      ctx.renderBoard?.();
      ctx.toast?.(tr('listSaveFailed'));
      console.warn('list flag patch failed', err);
    }
  }

  function bindEditableCells(root) {
    root.querySelectorAll('.kuiper-list-editable').forEach(td => {
      td.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.stopPropagation();
        openCellPicker(td);
      });
      td.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openCellPicker(td);
        }
      });
    });
  }

  function bindRows(root) {
    KuiperUI.bindCardIdButtons(root);
    bindEditableCells(root);
    root.querySelectorAll('.kuiper-list-title-open').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.closest('.kuiper-list-row')?.dataset.id;
        if (id) ctx.openEditor?.(id);
      });
    });
    root.querySelectorAll('.kuiper-list-collapse').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const parentId = btn.dataset.parentId;
        if (parentId) toggleCollapsed(parentId);
      });
    });
    root.querySelectorAll('.kuiper-list-star-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.closest('.kuiper-list-row')?.dataset.id;
        if (id) void toggleListFlag(id);
      });
    });
  }

  function render(host) {
    loadCollapsed();
    const st = ctx.state?.();
    const allTasks = st?.tasks || [];
    const top = topLevelTasks();
    const structure = buildListStructure(top, allTasks);

    host.innerHTML = '';
    host.className = 'board kuiper-list';

    const shell = document.createElement('div');
    shell.className = 'kuiper-list-shell';

    const body = document.createElement('div');
    body.className = 'kuiper-list-body kuiper-scroll';

    const compact = isCompact();
    const headUpdated = compact
      ? ''
      : `<th scope="col">${esc(tr('listColUpdated'))}</th>`;

    const table = document.createElement('table');
    table.className = 'kuiper-list-table';
    table.setAttribute('role', 'table');
    table.setAttribute('aria-label', tr('viewList'));
    table.innerHTML = `
      ${colgroupHtml(compact)}
      <thead class="kuiper-list-head">
        <tr role="row">
          <th scope="col">${esc(tr('listColKey'))}</th>
          <th scope="col">${esc(tr('listColType'))}</th>
          <th scope="col">${esc(tr('listColTitle'))}</th>
          <th scope="col" class="kuiper-list-col-star-h">${esc(tr('listColStar'))}</th>
          <th scope="col">${esc(tr('listColStage'))}</th>
          <th scope="col">${esc(tr('listColPriority'))}</th>
          <th scope="col">${esc(tr('listColProject'))}</th>
          <th scope="col">${esc(tr('listColEpic'))}</th>
          <th scope="col">${esc(tr('listColSprint'))}</th>
          <th scope="col">${esc(tr('listColStart'))}</th>
          <th scope="col">${esc(tr('listColEnd'))}</th>
          ${headUpdated}
        </tr>
      </thead>
      <tbody class="kuiper-list-tbody"></tbody>`;

    const tbody = table.querySelector('tbody');
    if (!structure.length) {
      const hasAny = allTasks.some(t => !t.archivedAt);
      const emptyKey = hasAny ? 'listEmptyFiltered' : 'listEmptyBoard';
      const empty = document.createElement('p');
      empty.className = 'kuiper-list-empty';
      empty.textContent = tr(emptyKey);
      body.append(empty);
    } else {
      const parts = [];
      for (const item of structure) {
        if (item.kind === 'group') {
          parts.push(`<tr class="kuiper-list-group-row" role="row" data-lane="${esc(item.lane.key)}"><td colspan="${colCount()}"></td></tr>`);
        } else {
          parts.push(rowHtml(item.task, {
            isSubtask: item.isSubtask,
            childCount: item.childCount || 0,
          }));
        }
      }
      tbody.innerHTML = parts.join('');
      const groupRows = tbody.querySelectorAll('tr.kuiper-list-group-row');
      let groupIdx = 0;
      for (const item of structure) {
        if (item.kind !== 'group') continue;
        const tr = groupRows[groupIdx++];
        const td = tr?.querySelector('td');
        if (td) td.append(KuiperUI.buildSwimlaneSeparator(item.lane));
      }
    }

    body.append(table);
    shell.append(body);
    host.append(shell);

    if (structure.length) bindRows(host);
  }

  function init(hooks) {
    ctx = hooks;
  }

  return { init, render, buildListStructure, topLevelTasks };
})();

if (typeof module !== 'undefined') module.exports = { KuiperList, flattenListRows };
