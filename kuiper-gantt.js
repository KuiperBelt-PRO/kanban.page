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
  let selectedCardId = null;
  let renderToken = 0;
  let layoutObserver = null;
  let bezierObserver = null;
  let bezierRaf = 0;

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

  /** Ventana visible acotada (no 2 años de ancho); se desplaza con prev/next. */
  function timelineViewport(tasks) {
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
    return [startYmd, endYmd];
  }

  function refreshTimelineWindow() {
    if (!chart || !shellEl) return;
    const [start, end] = timelineWindowFromCenter(windowCenter());
    chartOpts.viewportStart = start;
    chartOpts.viewportEnd = end;
    chart.setOptions({
      viewportStart: new Date(`${start}T00:00:00Z`),
      viewportEnd: new Date(`${end}T00:00:00Z`),
    });
    const root = shellEl.querySelector('.gantt-root');
    if (!root) return;
    requestAnimationFrame(() => {
      stretchTimelineHeight(root);
      scrollToToday(root);
      scheduleBezierSync(root);
    });
  }

  function panTimeline(direction) {
    const pan = PAN_DAYS[zoom()] || PAN_DAYS.week;
    const next = clampWindowCenter(BoardCore.addDays(windowCenter(), direction * pan));
    savePrefs({ ganttWindowCenter: next });
    refreshTimelineWindow();
  }

  function goToToday() {
    savePrefs({ ganttWindowCenter: BoardCore.ymd() });
    refreshTimelineWindow();
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

  function gridColumns() {
    const fmt = (v, task) => {
      if (task.data?.unscheduled) return '—';
      if (!v) return '—';
      try {
        const d = new Date(`${v}T12:00:00Z`);
        return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
      } catch (e) {
        return String(v);
      }
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
          + `font-size:11px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;`
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
          + `font-size:11px;font-weight:500;`
          + `}`,
          `.kuiper-gantt-v2 [data-pane="left"] .gantt-row[data-task-id="${num}"] > div:nth-child(2) > span:last-child{`
          + `color:color-mix(in srgb,${c} 45%,var(--text))!important;`
          + `}`,
        );
      } else if (kind === 'group') {
        rules.push(
          `.kuiper-gantt-v2 [data-pane="left"] .gantt-row[data-task-id="${num}"]{`
          + `background:color-mix(in srgb,var(--raise) 45%,var(--surface))!important;`
          + `font-size:11px;font-weight:500;`
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
      bezierRaf = requestAnimationFrame(() => {
        bezierRaf = requestAnimationFrame(() => {
          const ganttRoot = root || shellEl?.querySelector('.gantt-root');
          if (ganttRoot) syncBezierDeps(ganttRoot);
        });
      });
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
    if (!root || prefs().showDependencies === false) return;
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

  function scrollToToday(root) {
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
    if (typeof scrollEl.scrollTo === 'function') {
      scrollEl.scrollTo({ left: target, behavior: 'smooth' });
    } else {
      scrollEl.scrollLeft = target;
    }
  }

  function stretchTimelineHeight(root) {
    const scrollEl = root?.children[0];
    if (!scrollEl || scrollEl.clientHeight <= 0) return;
    const minBody = Math.max(0, scrollEl.clientHeight - 52);
    const left = root.querySelector('[data-pane="left"]');
    const leftBody = left?.children[1];
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
    }, { passive: false });
  }

  function dateFromTimelineClick(event, root) {
    const { createPixelMapper } = ganttLib;
    const scrollEl = root.children[0];
    const right = root.querySelector('[data-pane="right"]');
    if (!right || !scrollEl) return null;
    const headerH = 52;
    const rect = right.getBoundingClientRect();
    const x = event.clientX - rect.left + scrollEl.scrollLeft;
    const y = event.clientY - rect.top;
    if (y < headerH) return null;
    const mapper = createPixelMapper(chartOpts.scale, new Date(`${chartOpts.viewportStart || BoardCore.ymd()}T00:00:00Z`));
    const d = mapper.toDate(x);
    const ymd = BoardCore.ymd(d);
    return BoardCore.validateSchedule(ymd, ymd).ok ? ymd : null;
  }

  async function scheduleAtClick(cardId, day) {
    await KuiperUI.applySchedulePatches([{
      id: cardId,
      schedule_start_date: day,
      schedule_end_date: day,
    }]);
    ctx.renderBoard?.();
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
    if (bezierObserver) bezierObserver.disconnect();
    const abs = getAbsoluteLayer(root);
    if (!abs || typeof MutationObserver === 'undefined') return;
    bezierObserver = new MutationObserver(() => {
      if (token !== renderToken) return;
      scheduleBezierSync(root);
    });
    bezierObserver.observe(abs, { childList: true, subtree: true });
  }

  function wirePostRender(root, token) {
    stretchTimelineHeight(root);
    scheduleBezierSync(root);
    bindBezierObserver(root, token);
    const scrollEl = root.children[0];
    if (scrollEl) {
      scrollEl.classList.add('kuiper-scroll', 'kuiper-gantt-scroll');
      bindWheelPan(scrollEl);
      scrollEl.onscroll = () => {
        if (token !== renderToken) return;
        scheduleBezierSync(root);
      };
    }
    const abs = root.querySelector('[data-pane="right"]')?.parentElement?.querySelector('div[style*="absolute"]');
    if (abs && !abs.dataset.kuiperScheduleClick) {
      abs.dataset.kuiperScheduleClick = '1';
      abs.addEventListener('click', async e => {
        if (e.target.closest('.gantt-bar, .gantt-milestone, .gantt-resize-handle')) return;
        const day = dateFromTimelineClick(e, root);
        if (!day || !selectedCardId) return;
        const t = (ctx.state?.().tasks || []).find(x => x.id === selectedCardId);
        if (t && !isScheduled(t)) await scheduleAtClick(selectedCardId, day);
      });
    }
  }

  async function render(host) {
    try {
    const lib = await loadLib();
    const { GanttChart } = lib;
    const token = ++renderToken;

    host.innerHTML = '';
    host.className = 'board kuiper-gantt kuiper-gantt-v2';
    shellEl = document.createElement('div');
    shellEl.className = 'kuiper-gantt-shell';

    const toolbar = document.createElement('div');
    toolbar.className = 'kuiper-gantt-toolbar';
    toolbar.innerHTML = `
      <div class="kuiper-gantt-zoom seg">
        <button type="button" data-zoom="day" aria-pressed="${zoom() === 'day'}">${tr('ganttZoomDay')}</button>
        <button type="button" data-zoom="week" aria-pressed="${zoom() === 'week'}">${tr('ganttZoomWeek')}</button>
        <button type="button" data-zoom="month" aria-pressed="${zoom() === 'month'}">${tr('ganttZoomMonth')}</button>
      </div>
      <div class="kuiper-gantt-nav">
        <button type="button" class="icon sm" data-act="prev" aria-label="${tr('ganttNavPrev')}">‹</button>
        <button type="button" class="pill sm" data-act="today">${tr('calendarToday')}</button>
        <button type="button" class="icon sm" data-act="next" aria-label="${tr('ganttNavNext')}">›</button>
      </div>
      <label class="kuiper-gantt-deps-toggle"><input type="checkbox" id="kuiperGanttDeps" ${prefs().showDependencies !== false ? 'checked' : ''}> ${tr('ganttShowDeps')}</label>`;
    shellEl.append(toolbar);

    const chartHost = document.createElement('div');
    chartHost.className = 'kuiper-gantt-chart-host';
    shellEl.append(chartHost);

    host.append(shellEl);
    await new Promise(r => requestAnimationFrame(r));

    const { tasks, links } = buildTreeInput();
    const [vpStartYmd, vpEndYmd] = timelineViewport(tasks);
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
        if (task.data?.cardId) {
          selectedCardId = task.data.cardId;
          if (!task.data.unscheduled) ctx.openEditor?.(task.data.cardId);
        }
      },
      onTaskDoubleClick: ({ task }) => {
        if (task.data?.cardId) ctx.openEditor?.(task.data.cardId);
      },
      onTaskMove: async ({ task, newStartDate, newEndDate }) => {
        if (!task.data?.cardId || task.data.unscheduled) return false;
        const st = ctx.state?.();
        const graph = BoardCore.buildBlockingGraph(st.tasks || []);
        const { diffDays } = ganttLib;
        const delta = Math.round(diffDays(
          new Date(`${task.startDate}T00:00:00Z`),
          newStartDate,
        ));
        if (delta) {
          const result = BoardCore.cascadeScheduleMove(st.tasks || [], graph, task.data.cardId, delta);
          if (result.cycle) ctx.toast?.(tr('ganttCycleWarning'));
          await KuiperUI.applySchedulePatches(result.patches);
          ctx.renderBoard?.();
          return true;
        }
        const s = newStartDate.toISOString().slice(0, 10);
        const e = newEndDate.toISOString().slice(0, 10);
        await KuiperUI.applySchedulePatches([{
          id: task.data.cardId,
          schedule_start_date: s,
          schedule_end_date: e,
        }]);
        ctx.renderBoard?.();
        return true;
      },
      onTaskResize: async ({ task, newStartDate, newEndDate }) => {
        if (!task.data?.cardId || task.data.unscheduled) return false;
        const e = newEndDate.toISOString().slice(0, 10);
        const st = ctx.state?.();
        const graph = BoardCore.buildBlockingGraph(st.tasks || []);
        const result = BoardCore.cascadeAfterResizeEnd(st.tasks || [], graph, task.data.cardId, e);
        if (result.cycle) ctx.toast?.(tr('ganttCycleWarning'));
        await KuiperUI.applySchedulePatches(result.patches);
        ctx.renderBoard?.();
        return true;
      },
      onExpandCollapse: ({ task }) => {
        const key = task.data?.expandKey;
        if (!key) return;
        const open = { ...(prefs().ganttOpen || {}) };
        open[key] = task.open === true;
        savePrefs({ ganttOpen: open });
        requestAnimationFrame(() => wirePostRender(chartHost.querySelector('.gantt-root'), token));
      },
      onLeftPaneWidthChange: ({ width }) => {
        savePrefs({ ganttPaneWidth: width });
      },
    });

    injectGanttStyles(tasks);
    chart.update({ tasks, links: prefs().showDependencies === false ? [] : links });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const h = measureChartHeight();
        if (h > 0) chart.setOptions({ height: h });
        const root = chartHost.querySelector('.gantt-root');
        if (root) {
          wirePostRender(root, token);
          if (prefs().ganttScrollToday) {
            savePrefs({ ganttScrollToday: false, ganttWindowCenter: BoardCore.ymd() });
            goToToday();
          } else {
            scrollToToday(root);
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
    toolbar.querySelector('#kuiperGanttDeps')?.addEventListener('change', e => {
      savePrefs({ showDependencies: e.target.checked });
      ctx.renderBoard?.();
    });

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
    bezierRaf = 0;
    if (bezierObserver) {
      bezierObserver.disconnect();
      bezierObserver = null;
    }
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
