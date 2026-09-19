/* Vista Gantt Kuiper v2 — gantt-renderer + dependencias Bezier */
const KuiperGantt = (() => {
  let ctx = {};
  let chart = null;
  let ganttLib = null;
  let esLocale = null;
  let shellEl = null;
  let idMaps = { cardToNum: new Map(), numToCard: new Map(), numToColor: new Map(), links: [] };
  let chartOpts = { scale: 'week', viewportStart: null, viewportEnd: null };
  const BEZIER_GROUP_ID = 'kuiper-bezier-group';
  const BEZIER_NS = 'http://www.w3.org/2000/svg';
  const VIEWPORT_PAD_DAYS = 365;
  const WINDOW_DAYS = { day: 35, week: 91, month: 210 };
  const PAN_DAYS = { day: 7, week: 28, month: 60 };
  const EXPAND_CHUNK_DAYS = { day: 21, week: 42, month: 56 };
  const MAX_VIEWPORT_DAYS = { day: 105, week: 210, month: 365 };
  const SCROLL_EDGE_PX = 96;
  const COL_ZOOM_LEVELS = [0.6, 0.75, 0.9, 1, 1.2, 1.5, 2];
  const TIMELINE_HEADER_H = 52;
  let selectedCardId = null;
  let timelineRangePick = null;
  let hostEl = null;
  let renderToken = 0;
  const ICON_COPY = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" aria-hidden="true"><rect x="5.6" y="5.6" width="7" height="7" rx="1.6"/><path d="M10.4 3.4H5.1c-.94 0-1.7.76-1.7 1.7v5.3" stroke-linecap="round"/></svg>';
  const ICON_CAL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M5.5 2.5v2M10.5 2.5v2M2.5 6.5h11" stroke-linecap="round"/></svg>';
  const ICON_OPEN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" aria-hidden="true"><path d="M11.25 2.75 13.25 4.75 5.5 12.5 3.25 12.75 3.5 10.5 11.25 2.75z" stroke-linejoin="round"/><path d="M10 4 12 6" stroke-linecap="round"/></svg>';
  let layoutObserver = null;
  let bezierObserver = null;
  let leftPaneObserver = null;
  let bezierRaf = 0;
  let persistSeq = 0;
  let bezierObservedEl = null;
  let leftPaneObservedEl = null;
  let viewportShiftLock = false;
  let viewportScrollRaf = 0;

  const SCALES = { day: 'day', week: 'week', month: 'month' };

  function tr(key, vars) {
    return ctx.tr?.(key, vars) || key;
  }

  function locale() {
    return ctx.locale?.() === 'es' ? 'es-ES' : 'en-GB';
  }

  function prefs() {
    return KuiperUI.loadViewPrefs?.() || {};
  }

  function savePrefs(extra) {
    KuiperUI.saveUiPrefs?.(extra);
  }

  function zoom() {
    const z = prefs().ganttZoom;
    return z === 'day' || z === 'month' ? z : 'week';
  }

  function colZoomIndex() {
    const idx = Number(prefs().ganttColZoomIdx);
    if (Number.isFinite(idx) && idx >= 0 && idx < COL_ZOOM_LEVELS.length) return idx;
    return COL_ZOOM_LEVELS.indexOf(1);
  }

  function colZoomMultiplier() {
    return COL_ZOOM_LEVELS[colZoomIndex()] || 1;
  }

  function rowHeightPx() {
    return ganttLib?.ROW_HEIGHT || 32;
  }

  function cardIdFromRowNum(num) {
    const key = idMaps.numToCard.get(num);
    if (!key?.startsWith('card:')) return null;
    return key.slice(5);
  }

  async function copyCardKey(cardId) {
    if (!cardId) return;
    const url = KuiperUI.cardLinkUrl?.(cardId) || `${location.origin}${location.pathname}?card=${cardId}`;
    try {
      if (ctx.copyText) {
        const ok = await ctx.copyText(url);
        if (ok) ctx.toast?.(tr('linkCopied'));
        else ctx.toast?.(tr('couldNotCopy'));
        return;
      }
      await navigator.clipboard.writeText(url);
      ctx.toast?.(tr('linkCopied'));
    } catch (e) {
      ctx.toast?.(tr('couldNotCopy'));
    }
  }

  async function loadLib() {
    if (!ganttLib) {
      ganttLib = await import('./vendor/gantt-renderer/index.mjs');
      if (locale().startsWith('es')) {
        esLocale = (await import('./vendor/gantt-renderer/locales/es.mjs')).CHART_LOCALE;
      }
    }
    return ganttLib;
  }

  function allocId(key, color) {
    if (!idMaps.cardToNum.has(key)) {
      const n = idMaps.cardToNum.size + 1;
      idMaps.cardToNum.set(key, n);
      idMaps.numToCard.set(n, key);
      if (color) idMaps.numToColor.set(n, color);
    } else if (color) {
      idMaps.numToColor.set(idMaps.cardToNum.get(key), color);
    }
    return idMaps.cardToNum.get(key);
  }

  function isScheduled(t) {
    return !!(t.scheduleStartDate || t.scheduleEndDate);
  }

  function taskDates(t) {
    const start = t.scheduleStartDate || t.scheduleEndDate;
    const end = t.scheduleEndDate || t.scheduleStartDate;
    return { start, end };
  }

  function openState(key) {
    const open = prefs().ganttOpen || {};
    return open[key] !== false;
  }

  function windowCenter() {
    return prefs().ganttWindowCenter || BoardCore.ymd();
  }

  function clampWindowCenter(ymd) {
    const today = BoardCore.ymd();
    const min = BoardCore.addDays(today, -VIEWPORT_PAD_DAYS);
    const max = BoardCore.addDays(today, VIEWPORT_PAD_DAYS);
    if (ymd < min) return min;
    if (ymd > max) return max;
    return ymd;
  }

  function timelineWindowFromCenter(centerYmd) {
    const scale = zoom();
    const windowDays = WINDOW_DAYS[scale] || WINDOW_DAYS.week;
    const center = clampWindowCenter(centerYmd);
    const half = Math.floor(windowDays / 2);
    return [
      BoardCore.addDays(center, -half),
      BoardCore.addDays(center, windowDays - half),
    ];
  }

  function viewportYmdBounds() {
    const today = BoardCore.ymd();
    return [
      BoardCore.addDays(today, -VIEWPORT_PAD_DAYS),
      BoardCore.addDays(today, VIEWPORT_PAD_DAYS),
    ];
  }

  function clampViewportYmd(ymd) {
    const [min, max] = viewportYmdBounds();
    if (ymd < min) return min;
    if (ymd > max) return max;
    return ymd;
  }

  function viewportSpanDays(startYmd, endYmd) {
    return Math.max(0, BoardCore.scheduleDayDelta(startYmd, endYmd));
  }

  function expandChunkDays() {
    return EXPAND_CHUNK_DAYS[zoom()] || EXPAND_CHUNK_DAYS.week;
  }

  function maxViewportDays() {
    return MAX_VIEWPORT_DAYS[zoom()] || MAX_VIEWPORT_DAYS.week;
  }

  /** Ventana inicial: prefs guardados, centro ± ventana, o tareas visibles ± padding. */
  function defaultViewportForTasks(tasks) {
    const p = prefs();
    if (p.ganttViewportStart && p.ganttViewportEnd && p.ganttViewportStart < p.ganttViewportEnd) {
      return [
        clampViewportYmd(p.ganttViewportStart),
        clampViewportYmd(p.ganttViewportEnd),
      ];
    }
    let [startYmd, endYmd] = timelineWindowFromCenter(windowCenter());
    for (const t of tasks) {
      if (t.kind === 'project') continue;
      const s = t.startDate;
      const e = t.endDate || t.startDate;
      if (!s && !e) continue;
      const a = s || e;
      const b = e || s;
      if (a < startYmd) startYmd = BoardCore.addDays(a, -7);
      if (b > endYmd) endYmd = BoardCore.addDays(b, 7);
    }
    startYmd = clampViewportYmd(startYmd);
    endYmd = clampViewportYmd(endYmd);
    if (startYmd >= endYmd) endYmd = BoardCore.addDays(startYmd, 7);
    return [startYmd, endYmd];
  }

  function resolveViewport(tasks, { reset = false } = {}) {
    if (!reset && chartOpts.viewportStart && chartOpts.viewportEnd) {
      return [chartOpts.viewportStart, chartOpts.viewportEnd];
    }
    return defaultViewportForTasks(tasks);
  }

  function persistViewportPrefs(startYmd, endYmd) {
    if (startYmd && endYmd && startYmd < endYmd) {
      savePrefs({ ganttViewportStart: startYmd, ganttViewportEnd: endYmd });
    } else {
      savePrefs({ ganttViewportStart: null, ganttViewportEnd: null });
    }
  }

  function setViewportRange(startYmd, endYmd, scroll) {
    chartOpts.viewportStart = startYmd;
    chartOpts.viewportEnd = endYmd;
    persistViewportPrefs(startYmd, endYmd);
    refreshChartDataLight({ scroll });
  }

  function trimViewportIfNeeded(expandSide) {
    const startYmd = chartOpts.viewportStart;
    const endYmd = chartOpts.viewportEnd;
    if (!startYmd || !endYmd || !ganttLib) return;
    const span = viewportSpanDays(startYmd, endYmd);
    const maxDays = maxViewportDays();
    if (span <= maxDays) return;
    const trimDays = Math.min(span - maxDays, expandChunkDays());
    if (trimDays <= 0) return;
    const root = shellEl?.querySelector('.gantt-root');
    const scrollEl = root?.children[0];
    if (!scrollEl) return;
    const scrollTop = scrollEl.scrollTop;
    const { createPixelMapper } = ganttLib;
    if (expandSide === 'right') {
      const newStart = BoardCore.addDays(startYmd, trimDays);
      if (newStart >= endYmd) return;
      const oldMapper = createPixelMapper(
        chartOpts.scale,
        new Date(`${startYmd}T00:00:00Z`),
      );
      const removedPx = oldMapper.toX(new Date(`${newStart}T00:00:00Z`));
      setViewportRange(newStart, endYmd, {
        left: Math.max(0, scrollEl.scrollLeft - removedPx),
        top: scrollTop,
      });
      return;
    }
    const newEnd = BoardCore.addDays(endYmd, -trimDays);
    if (newEnd <= startYmd) return;
    setViewportRange(startYmd, newEnd, {
      left: scrollEl.scrollLeft,
      top: scrollTop,
    });
  }

  function expandViewportLeft(chunkDays) {
    if (!ganttLib || !shellEl || viewportShiftLock) return false;
    const startYmd = chartOpts.viewportStart;
    const endYmd = chartOpts.viewportEnd;
    if (!startYmd || !endYmd) return false;
    const newStart = clampViewportYmd(BoardCore.addDays(startYmd, -chunkDays));
    if (newStart === startYmd) return false;
    const root = shellEl.querySelector('.gantt-root');
    const scrollEl = root?.children[0];
    if (!scrollEl) return false;
    const { createPixelMapper } = ganttLib;
    const newMapper = createPixelMapper(chartOpts.scale, new Date(`${newStart}T00:00:00Z`));
    const deltaPx = newMapper.toX(new Date(`${startYmd}T00:00:00Z`));
    viewportShiftLock = true;
    setViewportRange(newStart, endYmd, {
      left: scrollEl.scrollLeft + deltaPx,
      top: scrollEl.scrollTop,
    });
    trimViewportIfNeeded('left');
    viewportShiftLock = false;
    return true;
  }

  function expandViewportRight(chunkDays) {
    if (!ganttLib || !shellEl || viewportShiftLock) return false;
    const startYmd = chartOpts.viewportStart;
    const endYmd = chartOpts.viewportEnd;
    if (!startYmd || !endYmd) return false;
    const newEnd = clampViewportYmd(BoardCore.addDays(endYmd, chunkDays));
    if (newEnd === endYmd) return false;
    const root = shellEl.querySelector('.gantt-root');
    const scrollEl = root?.children[0];
    viewportShiftLock = true;
    setViewportRange(startYmd, newEnd, scrollEl
      ? { left: scrollEl.scrollLeft, top: scrollEl.scrollTop }
      : null);
    trimViewportIfNeeded('right');
    viewportShiftLock = false;
    return true;
  }

  function checkViewportOnScroll(root) {
    if (viewportShiftLock || !chart || !ganttLib || !root) return;
    const scrollEl = root.children[0];
    if (!scrollEl) return;
    const maxScroll = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth);
    const scrollLeft = scrollEl.scrollLeft;
    const chunk = expandChunkDays();
    if (scrollLeft <= SCROLL_EDGE_PX) {
      expandViewportLeft(chunk);
    } else if (maxScroll > 0 && maxScroll - scrollLeft <= SCROLL_EDGE_PX) {
      expandViewportRight(chunk);
    }
  }

  function scheduleViewportShiftCheck(root) {
    cancelAnimationFrame(viewportScrollRaf);
    viewportScrollRaf = requestAnimationFrame(() => {
      checkViewportOnScroll(root);
    });
  }

  function resetViewportToDefault(smooth = false) {
    chartOpts.viewportStart = null;
    chartOpts.viewportEnd = null;
    persistViewportPrefs(null, null);
    refreshChartDataLight({ resetViewport: true, autoScroll: !smooth });
    if (smooth) {
      requestAnimationFrame(() => {
        const root = shellEl?.querySelector('.gantt-root');
        if (root) scrollToToday(root, true);
      });
    }
  }

  function refreshTimelineWindow(smooth = false) {
    resetViewportToDefault(smooth);
  }

  function panTimeline(direction) {
    const pan = PAN_DAYS[zoom()] || PAN_DAYS.week;
    const delta = direction * pan;
    const startYmd = chartOpts.viewportStart;
    const endYmd = chartOpts.viewportEnd;
    const nextCenter = clampWindowCenter(BoardCore.addDays(windowCenter(), delta));
    savePrefs({ ganttWindowCenter: nextCenter });
    if (!startYmd || !endYmd) {
      resetViewportToDefault(false);
      return;
    }
    let newStart = clampViewportYmd(BoardCore.addDays(startYmd, delta));
    const actualDelta = BoardCore.scheduleDayDelta(startYmd, newStart);
    const newEnd = clampViewportYmd(BoardCore.addDays(endYmd, actualDelta));
    const root = shellEl?.querySelector('.gantt-root');
    const scrollEl = root?.children[0];
    const scroll = scrollEl
      ? { left: scrollEl.scrollLeft, top: scrollEl.scrollTop }
      : null;
    if (actualDelta && ganttLib && scroll) {
      const { createPixelMapper } = ganttLib;
      const mapper = createPixelMapper(chartOpts.scale, new Date(`${startYmd}T00:00:00Z`));
      scroll.left = Math.max(0, scroll.left + mapper.durationDaysToWidth(actualDelta));
    }
    setViewportRange(newStart, newEnd, scroll);
  }

  function goToToday() {
    savePrefs({ ganttWindowCenter: BoardCore.ymd() });
    resetViewportToDefault(true);
  }

  function cardTask(cardId) {
    return (ctx.state?.().tasks || []).find(x => x.id === cardId) || null;
  }

  function dateToYmd(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function leftPaneBody(root) {
    const pane = root?.querySelector?.('[data-pane="left"]');
    if (!pane) return null;
    const body = pane.children[1];
    return body?.classList?.contains('gantt-splitter-handle') ? null : body;
  }

  function getRowCells(row) {
    return Array.from(row.children).filter(el => el.matches('span, div'));
  }

  function rowColumnIndex(row, target) {
    const cells = getRowCells(row);
    for (let i = 0; i < cells.length; i += 1) {
      if (cells[i].contains(target)) return i;
    }
    return -1;
  }

  function captureScroll() {
    const root = shellEl?.querySelector('.gantt-root');
    const scrollEl = root?.children[0];
    return scrollEl
      ? { left: scrollEl.scrollLeft, top: scrollEl.scrollTop }
      : null;
  }

  function persistPatches(patches) {
    if (!patches?.length) return;
    const scroll = captureScroll();
    const rollback = KuiperUI.applySchedulePatchesLocal(patches);
    const seq = ++persistSeq;
    refreshChartDataLight({ scroll });
    void (async () => {
      try {
        await KuiperUI.persistSchedulePatchesApi(patches);
      } catch (err) {
        if (seq !== persistSeq) return;
        KuiperUI.applySchedulePatchesLocal(rollback);
        refreshChartDataLight({ scroll });
        ctx.toast?.(tr('scheduleSaveFailed'));
      }
    })();
  }

  function syncToolbar() {
    if (!shellEl) return;
    const label = shellEl.querySelector('.kuiper-gantt-colzoom-label');
    if (label) label.textContent = `${Math.round(colZoomMultiplier() * 100)}%`;
    shellEl.querySelectorAll('[data-zoom]').forEach(btn => {
      btn.setAttribute('aria-pressed', String(zoom() === btn.dataset.zoom));
    });
    const zin = shellEl.querySelector('[data-act="zoom-in"]');
    const zout = shellEl.querySelector('[data-act="zoom-out"]');
    if (zout) zout.disabled = colZoomIndex() <= 0;
    if (zin) zin.disabled = colZoomIndex() >= COL_ZOOM_LEVELS.length - 1;
  }

  function refreshChartDataLight({ scroll = null, autoScroll = false, resetViewport = false } = {}) {
    if (!chart || !shellEl) return;
    if (ganttLib) ganttLib.setColumnWidthMultiplier(colZoomMultiplier());
    const { tasks, links } = buildTreeInput();
    const [vpStartYmd, vpEndYmd] = resolveViewport(tasks, { reset: resetViewport });
    chartOpts = {
      scale: SCALES[zoom()] || 'week',
      viewportStart: vpStartYmd,
      viewportEnd: vpEndYmd,
    };
    persistViewportPrefs(vpStartYmd, vpEndYmd);
    chart.setOptions({
      scale: chartOpts.scale,
      viewportStart: new Date(`${vpStartYmd}T00:00:00Z`),
      viewportEnd: new Date(`${vpEndYmd}T00:00:00Z`),
    });
    injectGanttStyles(tasks);
    chart.update({ tasks, links });
    const root = shellEl.querySelector('.gantt-root');
    if (!root) return;
    afterChartUpdate(root, renderToken);
    const sc = root.children[0];
    if (scroll && sc) {
      sc.scrollLeft = scroll.left;
      sc.scrollTop = scroll.top;
    } else if (autoScroll) {
      scrollToToday(root, false);
    }
  }

  async function refreshChartData({ scroll = null, autoScroll = false } = {}) {
    if (!chart || !shellEl) return;
    await loadLib();
    syncToolbar();
    refreshChartDataLight({ scroll, autoScroll });
  }

  function pushCardTask(tasks, t, parentId, today) {
    const p = KuiperUI.projectOf(t);
    const num = allocId(`card:${t.id}`, p?.color);
    const scheduled = isScheduled(t);
    const { start, end } = taskDates(t);
    const milestone = !t.scheduleStartDate && !!t.scheduleEndDate;
    const parent = parentId || undefined;
    if (milestone) {
      tasks.push({
        id: num,
        kind: 'milestone',
        text: `${t.id} ${t.title}`,
        parent,
        startDate: end,
        color: p?.color,
        data: { cardId: t.id, unscheduled: false },
      });
      return;
    }
    if (scheduled) {
      tasks.push({
        id: num,
        kind: 'task',
        text: t.title,
        parent,
        startDate: start,
        endDate: end,
        color: p?.color,
        data: { cardId: t.id, unscheduled: false },
      });
      return;
    }
    tasks.push({
      id: num,
      kind: 'task',
      text: t.title,
      parent,
      startDate: today,
      endDate: today,
      readonly: false,
      color: p?.color,
      data: { cardId: t.id, unscheduled: true },
    });
  }

  function pushGroupHeader(tasks, groupBy, lane, groupTasks, today) {
    const expandKey = `grp:${groupBy}:${lane.key}`;
    const num = allocId(expandKey, lane.color || undefined);
    const scheduled = groupTasks.filter(isScheduled);
    const bounds = BoardCore.scheduleBoundsForTasks(scheduled);
    const rowKind = groupBy === 'project' ? 'project' : groupBy === 'epic' ? 'epic' : 'group';
    tasks.push({
      id: num,
      kind: 'project',
      text: lane.label,
      startDate: bounds?.start || today,
      endDate: bounds?.end || today,
      open: openState(expandKey),
      readonly: true,
      color: lane.color || undefined,
      data: { expandKey, rowKind, summaryOnly: !bounds },
    });
    return num;
  }

  function buildTreeInput() {
    idMaps = { cardToNum: new Map(), numToCard: new Map(), numToColor: new Map(), links: [] };
    const tasks = [];
    const visible = KuiperUI.visibleTasks({ includeUnscheduled: true });
    const today = BoardCore.ymd();
    const st = ctx.state?.() || {};
    const groupBy = st.groupBy || 'none';

    if (groupBy === 'none') {
      for (const t of KuiperUI.sortTasks(visible)) pushCardTask(tasks, t, null, today);
    } else {
      for (const lane of KuiperUI.orderedSwimlanes(visible)) {
        const laneTasks = KuiperUI.sortTasks(visible.filter(t => KuiperUI.taskInLane(t, lane.key)));
        if (!laneTasks.length) continue;
        const headerId = pushGroupHeader(tasks, groupBy, lane, laneTasks, today);
        for (const t of laneTasks) pushCardTask(tasks, t, headerId, today);
      }
    }

    let linkId = 1;
    for (const t of visible.filter(isScheduled)) {
      const src = allocId(`card:${t.id}`);
      for (const l of t.blocks || []) {
        if (!visible.find(x => x.id === l.id && isScheduled(x))) continue;
        const tgt = allocId(`card:${l.id}`);
        idMaps.links.push({ id: linkId++, source: src, target: tgt, type: 'FS' });
      }
    }

    return { tasks, links: idMaps.links };
  }

  function formatScheduleCell(value) {
    if (!value) return '';
    try {
      const d = new Date(`${value}T12:00:00Z`);
      return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
    } catch (e) {
      return String(value);
    }
  }

  function gridColumns() {
    const fmt = (v, task) => {
      if (!task.data?.cardId) return v ? formatScheduleCell(v) : '';
      return formatScheduleCell(v);
    };
    return [
      {
        id: 'key',
        header: tr('ganttColKey'),
        width: '72px',
        field: 'text',
        format: (_, task) => task.data?.cardId || '',
      },
      {
        id: 'name',
        header: tr('ganttColIssue'),
        width: '180px',
      },
      {
        id: 'start',
        header: tr('ganttColStart'),
        width: '72px',
        field: 'startDate',
        format: fmt,
      },
      {
        id: 'end',
        header: tr('ganttColEnd'),
        width: '72px',
        field: 'endDate',
        format: fmt,
      },
    ];
  }

  function injectGanttStyles(tasks) {
    let el = document.getElementById('kuiper-gantt-theme');
    if (!el) {
      el = document.createElement('style');
      el.id = 'kuiper-gantt-theme';
      document.head.append(el);
    }
    const rules = [];
    let pastProject = false;
    for (const t of tasks) {
      const num = t.id;
      const kind = t.data?.rowKind;
      const color = t.color || idMaps.numToColor.get(num);
      if (kind === 'project') {
        const c = color || 'var(--faint)';
        const sep = pastProject
          ? 'inset 0 1px 0 color-mix(in srgb,var(--line) 85%,transparent),inset 3px 0 0 '
          : 'inset 3px 0 0 ';
        pastProject = true;
        rules.push(
          `.kuiper-gantt-v2 [data-pane="left"] .gantt-row[data-task-id="${num}"]{`
          + `background:color-mix(in srgb,${c} 14%,var(--raise))!important;`
          + `box-shadow:${sep}${c}!important;`
          + `font-size:10px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;`
          + `}`,
          `.kuiper-gantt-v2 [data-pane="left"] .gantt-row[data-task-id="${num}"] > div:nth-child(2) > span:last-child{`
          + `color:color-mix(in srgb,${c} 55%,var(--text))!important;font-weight:600;`
          + `}`,
        );
      } else if (kind === 'epic') {
        const c = color || 'var(--faint)';
        rules.push(
          `.kuiper-gantt-v2 [data-pane="left"] .gantt-row[data-task-id="${num}"]{`
          + `background:color-mix(in srgb,${c} 10%,var(--surface))!important;`
          + `box-shadow:inset 3px 0 0 color-mix(in srgb,${c} 70%,transparent)!important;`
          + `font-size:10px;font-weight:500;`
          + `}`,
          `.kuiper-gantt-v2 [data-pane="left"] .gantt-row[data-task-id="${num}"] > div:nth-child(2) > span:last-child{`
          + `color:color-mix(in srgb,${c} 45%,var(--text))!important;`
          + `}`,
        );
      } else if (kind === 'group') {
        rules.push(
          `.kuiper-gantt-v2 [data-pane="left"] .gantt-row[data-task-id="${num}"]{`
          + `background:color-mix(in srgb,var(--raise) 45%,var(--surface))!important;`
          + `font-size:10px;font-weight:500;`
          + `}`,
        );
      }
    }
    for (const [num, color] of idMaps.numToColor) {
      const key = idMaps.numToCard.get(num);
      const summary = !key?.startsWith('card:');
      const fill = summary ? 28 : 48;
      const border = summary ? 22 : 36;
      rules.push(
        `.kuiper-gantt-v2 .gantt-bar[data-task-id="${num}"],`
        + `.kuiper-gantt-v2 .gantt-milestone[data-task-id="${num}"]{`
        + `background:color-mix(in srgb,${color} ${fill}%,var(--surface))!important;`
        + `border-color:color-mix(in srgb,${color} ${border}%,var(--line))!important;`
        + `}`,
      );
      if (summary) {
        rules.push(
          `.kuiper-gantt-v2 .gantt-bar[data-task-id="${num}"]{opacity:.72}`,
        );
      }
    }
    for (const t of tasks) {
      if (t.data?.unscheduled) {
        rules.push(
          `.kuiper-gantt-v2 .gantt-bar[data-task-id="${t.id}"]{visibility:hidden!important;pointer-events:none!important}`,
        );
      }
    }
    el.textContent = rules.join('\n');
  }

  function scheduleBezierSync(root) {
    cancelAnimationFrame(bezierRaf);
    bezierRaf = requestAnimationFrame(() => {
      const ganttRoot = root || shellEl?.querySelector('.gantt-root');
      if (ganttRoot) syncBezierDeps(ganttRoot);
    });
  }

  function bezierPath(x1, y1, x2, y2) {
    const lane = Math.max(Math.abs(x2 - x1) * 0.35, 28);
    return `M ${x1} ${y1} C ${x1 + lane} ${y1}, ${x2 - lane} ${y2}, ${x2} ${y2}`;
  }

  function barAnchor(el, side) {
    const left = parseFloat(el.style.left) || 0;
    const top = parseFloat(el.style.top) || 0;
    const width = parseFloat(el.style.width) || el.offsetWidth;
    const height = parseFloat(el.style.height) || el.offsetHeight;
    const isMilestone = el.classList.contains('gantt-milestone');
    const x = side === 'end'
      ? (isMilestone ? left + width / 2 : left + width)
      : (isMilestone ? left + width / 2 : left);
    return { x, y: top + height / 2 };
  }

  function getRightScrollContainer(root) {
    const right = root.querySelector('[data-pane="right"]');
    return right?.children[1] || null;
  }

  function getAbsoluteLayer(root) {
    const sc = getRightScrollContainer(root);
    return sc?.children[1] || null;
  }

  function ensureBezierOverlay(root) {
    const sc = getRightScrollContainer(root);
    const abs = getAbsoluteLayer(root);
    if (!sc || !abs) return null;
    let overlay = sc.querySelector('.kuiper-bezier-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'kuiper-bezier-overlay';
      const svg = document.createElementNS(BEZIER_NS, 'svg');
      svg.className = 'kuiper-bezier-svg';
      const defs = document.createElementNS(BEZIER_NS, 'defs');
      const marker = document.createElementNS(BEZIER_NS, 'marker');
      marker.setAttribute('id', 'kuiper-bezier-arrow');
      marker.setAttribute('markerWidth', '8');
      marker.setAttribute('markerHeight', '8');
      marker.setAttribute('refX', '7');
      marker.setAttribute('refY', '4');
      marker.setAttribute('orient', 'auto');
      const arrow = document.createElementNS(BEZIER_NS, 'path');
      arrow.setAttribute('d', 'M0,0 L8,4 L0,8');
      arrow.setAttribute('class', 'kuiper-bezier-arrow');
      marker.append(arrow);
      defs.append(marker);
      svg.append(defs);
      const group = document.createElementNS(BEZIER_NS, 'g');
      group.setAttribute('id', BEZIER_GROUP_ID);
      svg.append(group);
      overlay.append(svg);
      sc.append(overlay);
    }
    overlay.style.top = abs.style.top || '52px';
    overlay.style.width = abs.style.width;
    overlay.style.height = abs.style.height;
    const svg = overlay.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', parseFloat(abs.style.width) || abs.scrollWidth);
      svg.setAttribute('height', parseFloat(abs.style.height) || abs.scrollHeight);
    }
    return overlay.querySelector(`#${BEZIER_GROUP_ID}`);
  }

  function syncBezierDeps(root) {
    if (!root) return;
    const group = ensureBezierOverlay(root);
    if (!group) return;
    while (group.firstChild) group.removeChild(group.firstChild);

    for (const link of idMaps.links) {
      const from = root.querySelector(
        `.gantt-bar[data-task-id="${link.source}"], .gantt-milestone[data-task-id="${link.source}"]`,
      );
      const to = root.querySelector(
        `.gantt-bar[data-task-id="${link.target}"], .gantt-milestone[data-task-id="${link.target}"]`,
      );
      if (!from || !to) continue;
      const a = barAnchor(from, 'end');
      const b = barAnchor(to, 'start');
      const path = document.createElementNS(BEZIER_NS, 'path');
      path.setAttribute('d', bezierPath(a.x, a.y, b.x, b.y));
      path.setAttribute('class', 'kuiper-gantt-bezier');
      path.setAttribute('marker-end', 'url(#kuiper-bezier-arrow)');
      group.append(path);
    }
  }

  function scrollToToday(root, smooth = false) {
    const scrollEl = root?.children[0];
    if (!scrollEl || !ganttLib || !chartOpts.viewportStart) return;
    const focusYmd = windowCenter();
    const { createPixelMapper } = ganttLib;
    const mapper = createPixelMapper(
      chartOpts.scale,
      new Date(`${chartOpts.viewportStart}T00:00:00Z`),
    );
    const focusX = mapper.toX(new Date(`${focusYmd}T12:00:00Z`));
    const leftPane = root.querySelector('[data-pane="left"]');
    const leftW = leftPane?.offsetWidth || 0;
    const visibleRight = Math.max(120, scrollEl.clientWidth - leftW);
    const target = Math.max(0, focusX - Math.round(visibleRight * 0.38));
    const behavior = smooth ? 'smooth' : 'auto';
    if (typeof scrollEl.scrollTo === 'function') {
      scrollEl.scrollTo({ left: target, behavior });
    } else {
      scrollEl.scrollLeft = target;
    }
  }

  function stretchTimelineHeight(root) {
    const scrollEl = root?.children[0];
    if (!scrollEl || scrollEl.clientHeight <= 0) return;
    const minBody = Math.max(0, scrollEl.clientHeight - 52);
    const left = root.querySelector('[data-pane="left"]');
    const leftBody = leftPaneBody(root);
    const sc = getRightScrollContainer(root);
    const stripe = sc?.children[0];
    const abs = getAbsoluteLayer(root);
    if (leftBody) leftBody.style.minHeight = `${minBody}px`;
    if (stripe) stripe.style.minHeight = `${minBody}px`;
    if (abs) {
      const contentH = parseFloat(abs.style.height) || 0;
      const h = Math.max(contentH, minBody);
      abs.style.height = `${h}px`;
      const overlay = sc?.querySelector('.kuiper-bezier-overlay');
      if (overlay) {
        overlay.style.height = `${h}px`;
        overlay.style.width = abs.style.width;
        const svg = overlay.querySelector('svg');
        if (svg) {
          svg.setAttribute('width', parseFloat(abs.style.width) || abs.scrollWidth);
          svg.setAttribute('height', h);
        }
      }
    }
  }

  function bindWheelPan(scrollEl) {
    if (!scrollEl || scrollEl.dataset.kuiperWheelPan) return;
    scrollEl.dataset.kuiperWheelPan = '1';
    scrollEl.addEventListener('wheel', e => {
      const horizontal = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!horizontal) return;
      e.preventDefault();
      const delta = e.shiftKey ? (e.deltaY + e.deltaX) : e.deltaX;
      scrollEl.scrollLeft += delta;
      const root = scrollEl.closest('.gantt-root');
      if (root) scheduleViewportShiftCheck(root);
    }, { passive: false });
  }

  function dateFromTimelineClick(event, root) {
    const { createPixelMapper } = ganttLib;
    const scrollEl = root.children[0];
    const right = root.querySelector('[data-pane="right"]');
    if (!right || !scrollEl) return null;
    const rect = right.getBoundingClientRect();
    const x = event.clientX - rect.left + scrollEl.scrollLeft;
    const y = event.clientY - rect.top;
    if (y < TIMELINE_HEADER_H) return null;
    const mapper = createPixelMapper(chartOpts.scale, new Date(`${chartOpts.viewportStart || BoardCore.ymd()}T00:00:00Z`));
    const d = mapper.toDate(x);
    const ymd = BoardCore.ymd(d);
    return BoardCore.validateSchedule(ymd, ymd).ok ? ymd : null;
  }

  function cardIdFromTimelineEvent(event, root) {
    const scrollEl = root.children[0];
    const leftBody = leftPaneBody(root);
    if (!scrollEl || !leftBody) return null;
    const scrollRect = scrollEl.getBoundingClientRect();
    const yInContent = event.clientY - scrollRect.top + scrollEl.scrollTop - TIMELINE_HEADER_H;
    if (yInContent < 0) return null;
    const pad = leftBody.firstElementChild;
    const paddingTop = pad && !pad.classList.contains('gantt-row')
      ? parseFloat(pad.style.height) || 0
      : 0;
    const rowH = rowHeightPx();
    const idx = Math.floor((yInContent - paddingTop) / rowH);
    const rows = leftBody.querySelectorAll('.gantt-row');
    if (idx < 0 || idx >= rows.length) return null;
    return cardIdFromRowNum(Number(rows[idx].dataset.taskId));
  }

  function applyScheduleRange(cardId, start, end) {
    const v = BoardCore.validateSchedule(start, end);
    if (!v.ok) {
      ctx.toast?.(tr('scheduleSaveFailed'));
      return;
    }
    timelineRangePick = null;
    persistPatches([{
      id: cardId,
      schedule_start_date: start,
      schedule_end_date: end,
    }]);
  }

  async function scheduleAtClick(cardId, day) {
    await applyScheduleRange(cardId, day, day);
  }

  function schedulePatchesForDateEdit(cardId, field, ymd) {
    const tasks = ctx.state?.().tasks || [];
    const t = tasks.find(x => x.id === cardId);
    if (!t) return null;
    const start = field === 'start' ? ymd : (t.scheduleStartDate || ymd);
    const end = field === 'end' ? ymd : (t.scheduleEndDate || ymd);
    if (!BoardCore.validateSchedule(start, end).ok) return null;
    const graph = BoardCore.buildBlockingGraph(tasks);
    if (field === 'end') {
      const origEnd = t.scheduleEndDate || t.scheduleStartDate;
      if (origEnd && end !== origEnd) {
        return BoardCore.cascadeEndResize(tasks, graph, cardId, end);
      }
    }
    return {
      patches: [{ id: cardId, schedule_start_date: start, schedule_end_date: end }],
      cycle: false,
    };
  }

  function patchScheduleField(cardId, field, ymd) {
    const result = schedulePatchesForDateEdit(cardId, field, ymd);
    if (!result) {
      ctx.toast?.(tr('scheduleSaveFailed'));
      return;
    }
    if (result.cycle) ctx.toast?.(tr('ganttCycleWarning'));
    persistPatches(result.patches);
  }

  function ensureDatePicker() {
    if (typeof KuiperDateTimePicker === 'undefined') return;
    KuiperDateTimePicker.init?.({
      tr: (k, v) => tr(k, v),
      locale: () => (ctx.locale?.() === 'en' ? 'en' : 'es'),
    });
  }

  function openSchedulePicker(anchor, cardId, field, current) {
    ensureDatePicker();
    if (typeof KuiperDateTimePicker === 'undefined') return;
    KuiperDateTimePicker.openDate({
      anchor,
      value: current || BoardCore.ymd(),
      scrim: false,
      onPick: ymd => patchScheduleField(cardId, field, ymd),
    });
  }

  function enhanceKeyCell(cell, cardId) {
    if (cell.dataset.kuiperEnhanced === 'key') return;
    cell.dataset.kuiperEnhanced = 'key';
    cell.classList.add('kuiper-gantt-key-cell');
    cell.textContent = '';
    const wrap = document.createElement('div');
    wrap.className = 'kuiper-gantt-key-wrap';
    const idSpan = document.createElement('span');
    idSpan.className = 'kuiper-gantt-key-id mono';
    idSpan.textContent = cardId;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon sm kuiper-gantt-hover-btn kuiper-gantt-key-btn';
    btn.innerHTML = ICON_COPY;
    btn.title = tr('copyLink');
    btn.setAttribute('aria-label', tr('copyLink'));
    wrap.append(idSpan, btn);
    cell.append(wrap);
  }

  function enhanceDateCell(cell, cardId, field, value) {
    if (cell.dataset.kuiperEnhanced === `date-${field}`) {
      const valEl = cell.querySelector('.kuiper-gantt-date-val');
      if (valEl) valEl.textContent = value ? formatScheduleCell(value) : tr('ganttPickDate');
      return;
    }
    cell.dataset.kuiperEnhanced = `date-${field}`;
    cell.classList.add('kuiper-gantt-date-cell');
    cell.textContent = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kuiper-gantt-date-btn';
    btn.dataset.field = field;
    btn.innerHTML = `<span class="kuiper-gantt-date-icon kuiper-gantt-hover-btn">${ICON_CAL}</span>`
      + `<span class="kuiper-gantt-date-val">${value ? formatScheduleCell(value) : tr('ganttPickDate')}</span>`;
    btn.title = field === 'start' ? tr('ganttColStart') : tr('ganttColEnd');
    btn.setAttribute('aria-label', btn.title);
    cell.append(btn);
  }

  function enhanceIssueCell(nameCell, cardId, title) {
    if (nameCell.dataset.kuiperEnhanced === 'issue') {
      const label = nameCell.querySelector('.kuiper-gantt-issue-label');
      if (label && title) label.textContent = title;
      return;
    }
    nameCell.dataset.kuiperEnhanced = 'issue';
    nameCell.classList.add('kuiper-gantt-issue-cell');
    const label = nameCell.querySelector('span:last-child');
    if (label) {
      label.classList.add('kuiper-gantt-issue-label');
      if (title) label.textContent = title;
    }
    if (!nameCell.querySelector('.kuiper-gantt-issue-hover')) {
      const icon = document.createElement('span');
      icon.className = 'kuiper-gantt-issue-hover kuiper-gantt-hover-btn';
      icon.innerHTML = ICON_OPEN;
      icon.title = tr('ganttOpenIssue');
      icon.setAttribute('aria-hidden', 'true');
      if (label) nameCell.insertBefore(icon, label);
      else nameCell.append(icon);
    }
  }

  function enhanceLeftPaneRows(root) {
    const leftBody = leftPaneBody(root);
    if (!leftBody) return;
    const tasksById = new Map((ctx.state?.().tasks || []).map(t => [t.id, t]));
    leftBody.querySelectorAll('.gantt-row').forEach(row => {
      const cardId = cardIdFromRowNum(Number(row.dataset.taskId));
      if (!cardId) {
        row.classList.remove('kuiper-gantt-card-row');
        row.removeAttribute('data-card-row');
        return;
      }
      const t = tasksById.get(cardId);
      if (!t) return;
      row.classList.add('kuiper-gantt-card-row');
      row.dataset.cardRow = cardId;
      const cells = getRowCells(row);
      if (cells[0]) enhanceKeyCell(cells[0], cardId);
      if (cells[1]) enhanceIssueCell(cells[1], cardId, t.title);
      if (cells[2]) enhanceDateCell(cells[2], cardId, 'start', t.scheduleStartDate);
      if (cells[3]) enhanceDateCell(cells[3], cardId, 'end', t.scheduleEndDate);
    });
  }

  function wireLeftPaneActions(host) {
    if (!host || host.dataset.kuiperLeftActions) return;
    host.dataset.kuiperLeftActions = '1';
    host.addEventListener('click', e => {
      if (!e.target.closest('[data-pane="left"]')) return;
      if (e.target.closest('.gantt-toggle, .gantt-add-btn')) return;
      const row = e.target.closest('.gantt-row');
      if (!row) return;
      const cardId = cardIdFromRowNum(Number(row.dataset.taskId));
      if (!cardId) return;
      const colIdx = rowColumnIndex(row, e.target);
      if (colIdx < 0) return;
      const cells = getRowCells(row);
      if (colIdx === 0) {
        e.stopPropagation();
        e.preventDefault();
        copyCardKey(cardId);
        return;
      }
      if (colIdx === 1) {
        e.stopPropagation();
        e.preventDefault();
        selectedCardId = cardId;
        ctx.openEditor?.(cardId);
        return;
      }
      if (colIdx === 2 || colIdx === 3) {
        e.stopPropagation();
        e.preventDefault();
        selectedCardId = cardId;
        const field = colIdx === 2 ? 'start' : 'end';
        const t = cardTask(cardId);
        const anchor = cells[colIdx]?.querySelector('.kuiper-gantt-date-btn') || cells[colIdx];
        const current = field === 'start' ? t?.scheduleStartDate : t?.scheduleEndDate;
        openSchedulePicker(anchor, cardId, field, current);
      }
    }, true);
  }

  function bindLeftPaneObserver(root, token) {
    const leftBody = leftPaneBody(root);
    if (!leftBody || typeof MutationObserver === 'undefined') {
      enhanceLeftPaneRows(root);
      return;
    }
    if (leftPaneObserver && leftPaneObservedEl === leftBody) {
      enhanceLeftPaneRows(root);
      return;
    }
    if (leftPaneObserver) leftPaneObserver.disconnect();
    leftPaneObservedEl = leftBody;
    leftPaneObserver = new MutationObserver(() => {
      if (token !== renderToken) return;
      enhanceLeftPaneRows(root);
    });
    leftPaneObserver.observe(leftBody, { childList: true });
    enhanceLeftPaneRows(root);
  }


  function wireTimelineSchedule(root) {
    const scrollEl = root.children[0];
    if (!scrollEl || scrollEl.dataset.kuiperTimelineSchedule) return;
    scrollEl.dataset.kuiperTimelineSchedule = '1';
    scrollEl.addEventListener('pointerdown', async e => {
      if (e.button !== 0) return;
      if (e.target.closest('.gantt-bar, .gantt-milestone, .gantt-resize-handle')) return;
      const right = root.querySelector('[data-pane="right"]');
      if (!right?.contains(e.target)) return;
      const day = dateFromTimelineClick(e, root);
      const cardId = cardIdFromTimelineEvent(e, root) || selectedCardId;
      if (!day || !cardId) return;
      const t = (ctx.state?.().tasks || []).find(x => x.id === cardId);
      if (!t) return;
      selectedCardId = cardId;
      if (!isScheduled(t)) {
        if (timelineRangePick?.cardId === cardId && timelineRangePick.day !== day) {
          const a = timelineRangePick.day;
          const b = day;
          await applyScheduleRange(cardId, a <= b ? a : b, a <= b ? b : a);
        } else if (timelineRangePick?.cardId === cardId && timelineRangePick.day === day) {
          await scheduleAtClick(cardId, day);
        } else {
          timelineRangePick = { cardId, day };
          ctx.toast?.(tr('ganttPickEndDate'));
        }
        return;
      }
      if (e.shiftKey) {
        if (timelineRangePick?.cardId === cardId) {
          const a = timelineRangePick.day;
          const b = day;
          await applyScheduleRange(cardId, a <= b ? a : b, a <= b ? b : a);
        } else {
          timelineRangePick = { cardId, day };
          ctx.toast?.(tr('ganttPickEndDate'));
        }
      }
    });
  }

  function changeColZoom(delta) {
    const next = Math.max(0, Math.min(COL_ZOOM_LEVELS.length - 1, colZoomIndex() + delta));
    if (next === colZoomIndex()) return;
    savePrefs({ ganttColZoomIdx: next });
    if (hostEl) render(hostEl);
    else ctx.renderBoard?.();
  }

  function wireZoomKeys() {
    if (document.body.dataset.kuiperGanttZoomKeys) return;
    document.body.dataset.kuiperGanttZoomKeys = '1';
    document.addEventListener('keydown', e => {
      if (KuiperUI.getBoardView?.() !== 'gantt') return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        changeColZoom(1);
      } else if (e.key === '-') {
        e.preventDefault();
        changeColZoom(-1);
      }
    });
  }

  function measureChartHeight() {
    const host = shellEl?.querySelector('.kuiper-gantt-chart-host');
    if (host) {
      const h = host.getBoundingClientRect().height;
      if (h > 0) return Math.floor(h);
    }
    const board = shellEl?.closest('.board');
    if (board && shellEl) {
      const toolbar = shellEl.querySelector('.kuiper-gantt-toolbar');
      const boardH = board.getBoundingClientRect().height;
      const toolbarH = toolbar?.getBoundingClientRect().height || 0;
      return Math.max(260, Math.floor(boardH - toolbarH - 20));
    }
    return Math.max(280, window.innerHeight - 200);
  }

  function bindLayoutObserver() {
    if (layoutObserver) layoutObserver.disconnect();
    const host = shellEl?.querySelector('.kuiper-gantt-chart-host');
    const board = shellEl?.closest('.board');
    if ((!host && !board) || typeof ResizeObserver === 'undefined') return;
    layoutObserver = new ResizeObserver(() => {
      if (!chart) return;
      const h = measureChartHeight();
      if (h > 0) chart.setOptions({ height: h });
      const root = shellEl?.querySelector('.gantt-root');
      if (root) {
        stretchTimelineHeight(root);
        scheduleBezierSync(root);
      }
    });
    if (host) layoutObserver.observe(host);
    if (board) layoutObserver.observe(board);
  }

  function leftPaneWidth() {
    const min = 404;
    const saved = prefs().ganttPaneWidth;
    const w = window.innerWidth || 1200;
    const responsive = Math.min(460, Math.max(min, Math.round(w * 0.34)));
    return Math.max(min, saved || responsive);
  }

  function bindBezierObserver(root, token) {
    const abs = getAbsoluteLayer(root);
    if (!abs || typeof MutationObserver === 'undefined') return;
    if (bezierObserver && bezierObservedEl === abs) return;
    if (bezierObserver) bezierObserver.disconnect();
    bezierObservedEl = abs;
    bezierObserver = new MutationObserver(() => {
      if (token !== renderToken) return;
      scheduleBezierSync(root);
    });
    bezierObserver.observe(abs, { childList: true, subtree: true });
  }

  function afterChartUpdate(root, token) {
    stretchTimelineHeight(root);
    scheduleBezierSync(root);
    enhanceLeftPaneRows(root);
  }

  function wirePostRender(root, token) {
    afterChartUpdate(root, token);
    bindBezierObserver(root, token);
    bindLeftPaneObserver(root, token);
    wireTimelineSchedule(root);
    const scrollEl = root.children[0];
    if (scrollEl) {
      scrollEl.classList.add('kuiper-scroll', 'kuiper-gantt-scroll');
      bindWheelPan(scrollEl);
      scrollEl.onscroll = () => {
        if (token !== renderToken) return;
        scheduleBezierSync(root);
        scheduleViewportShiftCheck(root);
      };
    }
  }

  async function render(host) {
    try {
    hostEl = host;
    const lib = await loadLib();
    const { GanttChart, setColumnWidthMultiplier } = lib;
    setColumnWidthMultiplier(colZoomMultiplier());
    const token = ++renderToken;

    if (chart && host.querySelector('.kuiper-gantt-shell')) {
      shellEl = host.querySelector('.kuiper-gantt-shell');
      wireLeftPaneActions(shellEl);
      await refreshChartData({ autoScroll: false });
      return;
    }

    host.innerHTML = '';
    host.className = 'board kuiper-gantt kuiper-gantt-v2';
    shellEl = document.createElement('div');
    shellEl.className = 'kuiper-gantt-shell';

    const toolbar = document.createElement('div');
    toolbar.className = 'kuiper-gantt-toolbar';
    const zoomPct = Math.round(colZoomMultiplier() * 100);
    toolbar.innerHTML = `
      <div class="kuiper-gantt-zoom seg">
        <button type="button" data-zoom="day" aria-pressed="${zoom() === 'day'}">${tr('ganttZoomDay')}</button>
        <button type="button" data-zoom="week" aria-pressed="${zoom() === 'week'}">${tr('ganttZoomWeek')}</button>
        <button type="button" data-zoom="month" aria-pressed="${zoom() === 'month'}">${tr('ganttZoomMonth')}</button>
      </div>
      <div class="kuiper-gantt-colzoom" role="group" aria-label="${tr('ganttColZoom')}">
        <button type="button" class="icon sm" data-act="zoom-out" aria-label="${tr('ganttZoomOut')}" ${colZoomIndex() <= 0 ? 'disabled' : ''}>−</button>
        <span class="kuiper-gantt-colzoom-label" title="${tr('ganttColZoomHint')}">${zoomPct}%</span>
        <button type="button" class="icon sm" data-act="zoom-in" aria-label="${tr('ganttZoomIn')}" ${colZoomIndex() >= COL_ZOOM_LEVELS.length - 1 ? 'disabled' : ''}>+</button>
      </div>
      <div class="kuiper-gantt-nav">
        <button type="button" class="icon sm" data-act="prev" aria-label="${tr('ganttNavPrev')}">‹</button>
        <button type="button" class="pill sm" data-act="today">${tr('calendarToday')}</button>
        <button type="button" class="icon sm" data-act="next" aria-label="${tr('ganttNavNext')}">›</button>
      </div>`;
    shellEl.append(toolbar);

    const chartHost = document.createElement('div');
    chartHost.className = 'kuiper-gantt-chart-host';
    shellEl.append(chartHost);

    host.append(shellEl);
    wireLeftPaneActions(shellEl);
    await new Promise(r => requestAnimationFrame(r));

    const { tasks, links } = buildTreeInput();
    const [vpStartYmd, vpEndYmd] = resolveViewport(tasks);
    chartOpts = {
      scale: SCALES[zoom()] || 'week',
      viewportStart: vpStartYmd,
      viewportEnd: vpEndYmd,
    };

    if (chart) {
      chart.destroy();
      chart = null;
    }

    chart = new GanttChart(chartHost, {
      scale: chartOpts.scale,
      theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
      locale: esLocale || locale(),
      height: measureChartHeight(),
      leftPaneWidth: leftPaneWidth(),
      gridColumns: gridColumns(),
      showAddTaskButton: false,
      showTodayMarker: true,
      highlightLinkedDependenciesOnSelect: false,
      linkCreationEnabled: false,
      responsiveSplitPane: true,
      viewportStart: new Date(`${chartOpts.viewportStart}T00:00:00Z`),
      viewportEnd: new Date(`${chartOpts.viewportEnd}T00:00:00Z`),
    });
    bindLayoutObserver();

    chart.setCallbacks({
      onTaskClick: ({ task }) => {
        if (task.data?.cardId) selectedCardId = task.data.cardId;
      },
      onTaskDoubleClick: () => {},
      onTaskMove: async ({ task, newStartDate }) => {
        const cardId = task.data?.cardId;
        if (!cardId || task.data.unscheduled) return false;
        const before = cardTask(cardId);
        if (!before || !isScheduled(before)) return false;
        const anchorYmd = before.scheduleStartDate || before.scheduleEndDate;
        const { diffDays } = ganttLib;
        const delta = Math.round(diffDays(
          new Date(`${anchorYmd}T00:00:00Z`),
          newStartDate,
        ));
        if (!delta) return true;
        const st = ctx.state?.();
        const graph = BoardCore.buildBlockingGraph(st.tasks || []);
        const result = BoardCore.cascadeScheduleMove(st.tasks || [], graph, cardId, delta);
        if (result.cycle) ctx.toast?.(tr('ganttCycleWarning'));
        persistPatches(result.patches);
        return true;
      },
      onTaskResize: async ({ task, newStartDate, newEndDate }) => {
        const cardId = task.data?.cardId;
        if (!cardId || task.data.unscheduled) return false;
        const before = cardTask(cardId);
        if (!before) return false;
        const s = dateToYmd(newStartDate);
        const e = dateToYmd(newEndDate);
        const origStart = before.scheduleStartDate;
        const origEnd = before.scheduleEndDate;
        const v = BoardCore.validateSchedule(s, e);
        if (!v.ok) return false;
        if (s !== origStart && e === origEnd) {
          persistPatches([{ id: cardId, schedule_start_date: s, schedule_end_date: e }]);
          return true;
        }
        if (e !== origEnd) {
          const st = ctx.state?.();
          const graph = BoardCore.buildBlockingGraph(st.tasks || []);
          const result = BoardCore.cascadeEndResize(st.tasks || [], graph, cardId, e);
          if (result.cycle) ctx.toast?.(tr('ganttCycleWarning'));
          persistPatches(result.patches);
          return true;
        }
        if (s !== origStart) {
          persistPatches([{ id: cardId, schedule_start_date: s, schedule_end_date: e }]);
        }
        return true;
      },
      onExpandCollapse: ({ task }) => {
        const key = task.data?.expandKey;
        if (!key) return;
        const open = { ...(prefs().ganttOpen || {}) };
        open[key] = task.open === true;
        savePrefs({ ganttOpen: open });
        requestAnimationFrame(() => {
          const r = chartHost.querySelector('.gantt-root');
          if (r) wirePostRender(r, token);
        });
      },
      onLeftPaneWidthChange: ({ width }) => {
        savePrefs({ ganttPaneWidth: width });
      },
    });

    injectGanttStyles(tasks);
    chart.update({ tasks, links });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const h = measureChartHeight();
        if (h > 0) chart.setOptions({ height: h });
        const root = chartHost.querySelector('.gantt-root');
        if (root) {
          wirePostRender(root, token);
          wireZoomKeys();
          if (prefs().ganttScrollToday) {
            savePrefs({ ganttScrollToday: false, ganttWindowCenter: BoardCore.ymd() });
            goToToday();
          } else {
            scrollToToday(root, false);
          }
        }
      });
    });

    toolbar.querySelectorAll('[data-zoom]').forEach(btn => {
      btn.onclick = () => {
        savePrefs({ ganttZoom: btn.dataset.zoom });
        ctx.renderBoard?.();
      };
    });
    toolbar.querySelector('[data-act="prev"]').onclick = () => panTimeline(-1);
    toolbar.querySelector('[data-act="next"]').onclick = () => panTimeline(1);
    toolbar.querySelector('[data-act="today"]').onclick = () => {
      if (chart) goToToday();
      else savePrefs({ ganttScrollToday: true });
    };
    toolbar.querySelector('[data-act="zoom-in"]')?.addEventListener('click', () => changeColZoom(1));
    toolbar.querySelector('[data-act="zoom-out"]')?.addEventListener('click', () => changeColZoom(-1));

    } catch (err) {
      console.error('KuiperGantt render failed', err);
      host.innerHTML = `<div class="kuiper-gantt-error">${String(err.message || err)}</div>`;
    }
  }

  function init(hooks) {
    ctx = hooks;
  }

  function destroy() {
    cancelAnimationFrame(bezierRaf);
    cancelAnimationFrame(viewportScrollRaf);
    bezierRaf = 0;
    viewportScrollRaf = 0;
    viewportShiftLock = false;
    if (bezierObserver) {
      bezierObserver.disconnect();
      bezierObserver = null;
    }
    if (leftPaneObserver) {
      leftPaneObserver.disconnect();
      leftPaneObserver = null;
    }
    leftPaneObservedEl = null;
    bezierObservedEl = null;
    document.getElementById('kuiper-gantt-theme')?.remove();
    if (layoutObserver) {
      layoutObserver.disconnect();
      layoutObserver = null;
    }
    if (chart) {
      chart.destroy();
      chart = null;
    }
  }

  return { init, render, destroy };
})();

if (typeof module !== 'undefined') module.exports = { KuiperGantt };
