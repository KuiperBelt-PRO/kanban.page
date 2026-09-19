/* Vista calendario Kuiper — mes / semana / día */
const KuiperCalendar = (() => {
  let ctx = {};
  let periodPickerDocBound = false;
  let reopenPeriodPicker = false;

  function tr(key, vars) {
    return ctx.tr?.(key, vars) || key;
  }

  function locale() {
    return ctx.locale?.() === 'es' ? 'es-ES' : 'en-GB';
  }

  function localeShort() {
    return ctx.locale?.() === 'es' ? 'es' : 'en';
  }

  function prefs() {
    return KuiperUI.loadViewPrefs?.() || {};
  }

  function savePrefs(extra) {
    KuiperUI.saveUiPrefs?.(extra);
  }

  function anchorDate() {
    return prefs().calendarAnchorDate || BoardCore.ymd();
  }

  function mode() {
    const m = prefs().calendarMode;
    return m === 'week' || m === 'day' ? m : 'month';
  }

  function setMode(next) {
    savePrefs({ calendarMode: next });
    ctx.renderBoard?.();
  }

  function shiftAnchor(delta) {
    const cur = anchorDate();
    let next = cur;
    if (mode() === 'month') {
      const [y, mo] = cur.split('-').map(Number);
      const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
      next = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
    } else {
      next = BoardCore.addDays(cur, delta * (mode() === 'week' ? 7 : 1));
    }
    savePrefs({ calendarAnchorDate: next });
    ctx.renderBoard?.();
  }

  function goToday() {
    savePrefs({ calendarAnchorDate: BoardCore.ymd() });
    ctx.renderBoard?.();
  }

  function setAnchorDate(next, { keepPickerOpen = false } = {}) {
    if (!next) return;
    reopenPeriodPicker = keepPickerOpen;
    savePrefs({ calendarAnchorDate: next });
    ctx.renderBoard?.();
  }

  function anchorMonthYear() {
    const [y, mo] = anchorDate().split('-').map(Number);
    return { year: y, month: mo };
  }

  function anchorIsoYear() {
    const monday = BoardCore.mondayOf(anchorDate());
    return BoardCore.isoWeekFromYmd(monday).year;
  }

  function weeksInIsoYear(isoYear) {
    const out = [];
    for (let w = 1; w <= 53; w++) {
      const monday = BoardCore.mondayOfIsoWeek(isoYear, w);
      const info = BoardCore.isoWeekFromYmd(monday);
      if (info.year < isoYear) continue;
      if (info.year > isoYear) break;
      out.push({
        week: info.week,
        monday,
        label: BoardCore.weekLabel(monday, localeShort()),
      });
    }
    return out;
  }

  function setMonthYear(year, month, opts) {
    const cur = anchorDate();
    const curDay = +cur.split('-')[2];
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const day = Math.min(curDay, daysInMonth);
    setAnchorDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, opts);
  }

  function setWeekYear(isoYear, opts) {
    const monday = BoardCore.mondayOf(anchorDate());
    const { week } = BoardCore.isoWeekFromYmd(monday);
    setAnchorDate(BoardCore.mondayOfIsoWeek(isoYear, week), opts);
  }

  function ensureDatePicker() {
    if (typeof KuiperDateTimePicker === 'undefined') return;
    KuiperDateTimePicker.init?.({
      tr: (k, v) => tr(k, v),
      locale: localeShort,
    });
  }

  function openDayPicker(btn) {
    ensureDatePicker();
    if (typeof KuiperDateTimePicker === 'undefined') return;
    const layer = document.getElementById('kuiperPickerLayer');
    if (layer && !layer.hidden) {
      KuiperDateTimePicker.close();
      btn.setAttribute('aria-expanded', 'false');
      return;
    }
    btn.setAttribute('aria-expanded', 'true');
    KuiperDateTimePicker.openDate({
      anchor: btn,
      value: anchorDate(),
      scrim: false,
      onPick: ymd => {
        btn.setAttribute('aria-expanded', 'false');
        setAnchorDate(ymd);
      },
      onDismiss: () => btn.setAttribute('aria-expanded', 'false'),
    });
  }

  function formatMonthTitle(y, mo) {
    const d = new Date(Date.UTC(y, mo - 1, 1));
    return d.toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  }

  function formatDayTitle(day) {
    const d = new Date(`${day}T12:00:00Z`);
    return d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function periodTitle() {
    const anchor = anchorDate();
    const [y, mo] = anchor.split('-').map(Number);
    if (mode() === 'month') return formatMonthTitle(y, mo);
    if (mode() === 'week') {
      const monday = BoardCore.mondayOf(anchor);
      return BoardCore.weekLabel(monday, localeShort());
    }
    return formatDayTitle(anchor);
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function isMilestone(t) {
    return !t.scheduleStartDate && !!t.scheduleEndDate;
  }

  function chipHtml(t, { milestone = false } = {}) {
    const p = KuiperUI.projectOf(t);
    const color = p?.color || '#9AA5B8';
    const cls = milestone ? 'kuiper-cal-chip is-milestone' : 'kuiper-cal-chip';
    const mark = milestone ? '<span class="kuiper-cal-chip-milestone" aria-hidden="true"></span>' : '';
    return `<button type="button" class="${cls}" data-task-id="${esc(t.id)}" style="--c:${esc(color)}" title="${esc(t.title)}">
      ${mark}
      <span class="kuiper-cal-chip-id">${esc(t.id)}</span>
      <span class="kuiper-cal-chip-title">${esc(t.title)}</span>
    </button>`;
  }

  function dayOffset(fromDay, toDay) {
    const [y1, m1, d1] = fromDay.split('-').map(Number);
    const [y2, m2, d2] = toDay.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  }

  function patchForDrop(task, fromDay, toDay) {
    if (!toDay || fromDay === toDay) return null;
    const start = task.scheduleStartDate || null;
    const end = task.scheduleEndDate || null;
    if (start && end && start !== end) {
      const delta = dayOffset(fromDay, toDay);
      const next = BoardCore.moveScheduleByDays(task, delta);
      return {
        id: task.id,
        schedule_start_date: next.scheduleStartDate,
        schedule_end_date: next.scheduleEndDate,
      };
    }
    if (!start && end) {
      return { id: task.id, schedule_start_date: null, schedule_end_date: toDay };
    }
    if (start && !end) {
      return { id: task.id, schedule_start_date: toDay, schedule_end_date: null };
    }
    return {
      id: task.id,
      schedule_start_date: toDay,
      schedule_end_date: toDay,
    };
  }

  function taskById(id) {
    return (ctx.state?.().tasks || []).find(t => t.id === id) || null;
  }

  function weekDayFromX(root, clientX) {
    const track = root.querySelector('.kuiper-cal-head');
    if (!track) return null;
    const days = BoardCore.calendarWeekDays(anchorDate());
    const rect = track.getBoundingClientRect();
    const col = Math.floor(((clientX - rect.left) / rect.width) * days.length);
    return days[Math.max(0, Math.min(days.length - 1, col))] || null;
  }

  function dayAtPoint(root, clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    return el?.closest?.('[data-day]')?.dataset?.day || weekDayFromX(root, clientX);
  }

  function bindCalendarDrag(root) {
    let drag = null;
    const clearHighlight = () => {
      root.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
    };
    const highlightDay = (clientX, clientY) => {
      clearHighlight();
      const toDay = dayAtPoint(root, clientX, clientY);
      if (toDay) root.querySelectorAll(`[data-day="${toDay}"]`).forEach(cell => cell.classList.add('is-drop-target'));
    };

    root.querySelectorAll('[data-task-id]').forEach(btn => {
      btn.addEventListener('click', e => {
        if (btn.dataset.dragged === '1') {
          delete btn.dataset.dragged;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        e.stopPropagation();
        ctx.openEditor?.(btn.dataset.taskId);
      });
      btn.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const task = taskById(btn.dataset.taskId);
        const fromDay = btn.closest('[data-day]')?.dataset?.day
          || task?.scheduleStartDate
          || task?.scheduleEndDate;
        if (!fromDay) return;
        drag = {
          taskId: btn.dataset.taskId,
          fromDay,
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
        };
        btn.setPointerCapture(e.pointerId);
      });
      btn.addEventListener('pointermove', e => {
        if (!drag || drag.taskId !== btn.dataset.taskId) return;
        drag.moved = drag.moved
          || Math.abs(e.clientX - drag.startX) > 4
          || Math.abs(e.clientY - drag.startY) > 4;
        if (drag.moved) highlightDay(e.clientX, e.clientY);
      });
      btn.addEventListener('pointerup', async e => {
        if (!drag || drag.taskId !== btn.dataset.taskId) return;
        btn.releasePointerCapture(e.pointerId);
        const { moved, fromDay, taskId } = drag;
        drag = null;
        clearHighlight();
        if (!moved) return;
        btn.dataset.dragged = '1';
        const toDay = dayAtPoint(root, e.clientX, e.clientY);
        const task = taskById(taskId);
        if (!task || !toDay) return;
        const patch = patchForDrop(task, fromDay, toDay);
        if (!patch) return;
        await KuiperUI.applySchedulePatches([patch]);
      });
      btn.addEventListener('pointercancel', () => {
        if (drag?.taskId === btn.dataset.taskId) drag = null;
        clearHighlight();
      });
    });
  }

  function bindChips(root) {
    bindCalendarDrag(root);
  }

  function groupedVisibleTasks() {
    const tasks = KuiperUI.visibleTasks({ includeUnscheduled: false });
    return KuiperUI.groupedTasks(KuiperUI.sortTasks(tasks));
  }

  function groupedItemsForDay(day, tasks, groups) {
    const st = ctx.state?.();
    const dayTasks = BoardCore.issuesForDay(tasks, day);
    if (st?.groupBy && st.groupBy !== 'none') {
      return groups
        .map(g => ({ header: g.header, items: g.tasks.filter(t => BoardCore.issueOnDay(t, day)) }))
        .filter(g => g.items.length);
    }
    return [{ header: null, items: dayTasks }];
  }

  function renderCellBody(day, tasks, groups, { maxChips = null } = {}) {
    let html = '';
    const grouped = groupedItemsForDay(day, tasks, groups);
    for (const g of grouped) {
      if (g.header) html += `<div class="kuiper-cal-group">${esc(g.header)}</div>`;
      const limit = maxChips ?? (document.documentElement.dataset.density === 'compact' ? 2 : 3);
      const showAll = maxChips === Infinity;
      const visible = showAll ? g.items : g.items.slice(0, limit);
      visible.forEach(t => {
        html += chipHtml(t, { milestone: isMilestone(t) });
      });
      if (!showAll && g.items.length > limit) {
        html += `<button type="button" class="kuiper-cal-more" data-day="${day}">${tr('calendarMore', { n: g.items.length - limit })}</button>`;
      }
    }
    return html;
  }

  function cellClassNames(day, today) {
    const classes = ['kuiper-cal-cell'];
    if (day === today) classes.push('is-today');
    if (BoardCore.isWeekendYmd(day)) classes.push('is-weekend');
    return classes.join(' ');
  }

  function weekdayHeaders() {
    return locale().startsWith('es')
      ? ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  }

  function renderMonth(body, tasks) {
    const anchor = anchorDate();
    const { weeks } = BoardCore.calendarMonthGrid(anchor);
    const today = BoardCore.ymd();
    const groups = groupedVisibleTasks();
    const wd = weekdayHeaders();
    let html = '<div class="kuiper-cal-scroll-wrap kuiper-scroll"><div class="kuiper-cal-grid" role="grid">';
    html += `<div class="kuiper-cal-head" role="row">${wd.map((w, i) => {
      const weekend = i >= 5;
      return `<span class="${weekend ? 'is-weekend' : ''}" role="columnheader">${w}</span>`;
    }).join('')}</div>`;
    for (const week of weeks) {
      html += '<div class="kuiper-cal-row" role="row">';
      for (const day of week) {
        if (!day) {
          html += '<div class="kuiper-cal-cell is-pad" role="gridcell"></div>';
          continue;
        }
        html += `<div class="${cellClassNames(day, today)}" role="gridcell" data-day="${day}" aria-label="${esc(day)}">
          <div class="kuiper-cal-daynum">${+day.split('-')[2]}</div>
          <div class="kuiper-cal-cell-body">${renderCellBody(day, tasks, groups)}</div>
        </div>`;
      }
      html += '</div>';
    }
    html += '</div></div>';
    body.innerHTML = html;
    bindChips(body);
    body.querySelectorAll('.kuiper-cal-more').forEach(btn => {
      btn.onclick = () => {
        const day = btn.dataset.day;
        const list = BoardCore.issuesForDay(tasks, day).map(t => `${t.id}: ${t.title}`).join('\n');
        ctx.toast?.(list || day);
      };
    });
    body.querySelectorAll('.kuiper-cal-cell[data-day]').forEach(cell => {
      cell.addEventListener('dblclick', () => {
        ctx.openEditor?.('new');
      });
    });
  }

  function renderWeek(body, tasks) {
    const days = BoardCore.calendarWeekDays(anchorDate());
    const today = BoardCore.ymd();
    const groups = groupedVisibleTasks();
    let html = '<div class="kuiper-cal-scroll-wrap kuiper-scroll"><div class="kuiper-cal-grid kuiper-cal-week-grid" role="grid">';
    html += '<div class="kuiper-cal-head" role="row">';
    days.forEach(day => {
      const d = new Date(`${day}T12:00:00Z`);
      const label = d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric' });
      const weekend = BoardCore.isWeekendYmd(day);
      html += `<span class="${weekend ? 'is-weekend' : ''}" role="columnheader">${esc(label)}</span>`;
    });
    html += '</div><div class="kuiper-cal-row kuiper-cal-week-row" role="row">';
    for (const day of days) {
      html += `<div class="${cellClassNames(day, today)} kuiper-cal-week-cell" role="gridcell" data-day="${day}" aria-label="${esc(day)}">
        <div class="kuiper-cal-daynum">${+day.split('-')[2]}</div>
        <div class="kuiper-cal-cell-body">${renderCellBody(day, tasks, groups, { maxChips: Infinity })}</div>
      </div>`;
    }
    html += '</div></div></div>';
    body.innerHTML = html;
    bindChips(body);
    body.querySelectorAll('.kuiper-cal-cell[data-day]').forEach(cell => {
      cell.addEventListener('dblclick', () => {
        ctx.openEditor?.('new');
      });
    });
  }

  function renderDay(body, tasks) {
    const day = anchorDate();
    const groups = groupedVisibleTasks();
    let html = `<div class="kuiper-cal-day-view"><h3 class="kuiper-cal-day-title">${esc(formatDayTitle(day))}</h3>`;
    for (const g of groups) {
      const items = g.tasks.filter(t => BoardCore.issueOnDay(t, day));
      if (!items.length) continue;
      html += `<section class="kuiper-cal-day-section"><h4>${esc(g.header || tr('all'))}</h4><div class="kuiper-cal-day-list">`;
      items.forEach(t => {
        html += chipHtml(t, { milestone: isMilestone(t) });
      });
      html += '</section>';
    }
    if (!html.includes('kuiper-cal-chip')) {
      html += `<p class="kuiper-cal-empty">${esc(tr('calendarEmpty'))}</p>`;
    }
    html += '</div>';
    body.innerHTML = html;
    bindChips(body);
  }

  function monthPickerHtml() {
    const { year, month } = anchorMonthYear();
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const label = new Date(Date.UTC(2026, m - 1, 1)).toLocaleDateString(locale(), { month: 'short' });
      const active = m === month;
      months.push(`<button type="button" class="kuiper-cal-month-opt${active ? ' is-active' : ''}" data-month="${m}">${esc(label)}</button>`);
    }
    return `<div class="kuiper-cal-picker-month">
      <div class="kuiper-cal-year-step">
        <button type="button" class="icon sm" data-year-delta="-1" aria-label="${esc(tr('ganttNavPrev'))}">‹</button>
        <span class="kuiper-cal-year-label">${year}</span>
        <button type="button" class="icon sm" data-year-delta="1" aria-label="${esc(tr('ganttNavNext'))}">›</button>
      </div>
      <div class="kuiper-cal-month-grid">${months.join('')}</div>
    </div>`;
  }

  function weekPickerHtml() {
    const isoYear = anchorIsoYear();
    const currentMonday = BoardCore.mondayOf(anchorDate());
    const weeks = weeksInIsoYear(isoYear);
    const items = weeks.map(w => {
      const active = w.monday === currentMonday;
      return `<button type="button" class="kuiper-cal-week-opt${active ? ' is-active' : ''}" data-monday="${esc(w.monday)}">
        <span class="kuiper-cal-week-num">W${w.week}</span>
        <span class="kuiper-cal-week-label">${esc(w.label)}</span>
      </button>`;
    }).join('');
    return `<div class="kuiper-cal-picker-week">
      <div class="kuiper-cal-year-step">
        <button type="button" class="icon sm" data-year-delta="-1" aria-label="${esc(tr('ganttNavPrev'))}">‹</button>
        <span class="kuiper-cal-year-label">${isoYear}</span>
        <button type="button" class="icon sm" data-year-delta="1" aria-label="${esc(tr('ganttNavNext'))}">›</button>
      </div>
      <div class="kuiper-cal-week-list kuiper-scroll" role="listbox" aria-label="${esc(tr('calendarPickWeek'))}">${items}</div>
    </div>`;
  }

  const periodChevron = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 6.5L8 10l3.5-3.5"/></svg>';

  function positionPeriodPop(btn, pop) {
    const r = btn.getBoundingClientRect();
    pop.style.top = `${Math.round(r.bottom + 8)}px`;
    pop.style.left = `${Math.round(r.left + r.width / 2)}px`;
  }

  function openPeriodPop(btn, pop) {
    if (mode() === 'day') {
      openDayPicker(btn);
      return;
    }
    if (mode() === 'month') pop.innerHTML = monthPickerHtml();
    else pop.innerHTML = weekPickerHtml();
    bindPickerActions(pop);
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    positionPeriodPop(btn, pop);
    pop.querySelector('.kuiper-cal-week-opt.is-active')?.scrollIntoView({ block: 'nearest' });
  }

  function closePeriodPopovers(except) {
    document.querySelectorAll('.kuiper-cal-period-pop').forEach(pop => {
      if (pop !== except) pop.hidden = true;
    });
  }

  function bindPeriodPicker(toolbar) {
    const btn = toolbar.querySelector('.kuiper-cal-period-btn');
    const pop = toolbar.querySelector('.kuiper-cal-period-pop');
    if (!btn || !pop) return;

    btn.onclick = e => {
      e.stopPropagation();
      if (mode() === 'day') {
        closePeriodPopovers();
        openDayPicker(btn);
        return;
      }
      const open = !pop.hidden;
      closePeriodPopovers();
      if (open) {
        pop.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        return;
      }
      openPeriodPop(btn, pop);
    };

    if (!periodPickerDocBound) {
      document.addEventListener('click', e => {
        document.querySelectorAll('.kuiper-cal-period-pop:not([hidden])').forEach(openPop => {
          const openBtn = openPop.parentElement?.querySelector('.kuiper-cal-period-btn');
          if (!openPop.contains(e.target) && !openBtn?.contains(e.target)) {
            openPop.hidden = true;
            openBtn?.setAttribute('aria-expanded', 'false');
          }
        });
      });
      periodPickerDocBound = true;
    }
  }

  function bindPickerActions(pop) {
    pop.querySelectorAll('[data-year-delta]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const delta = +btn.dataset.yearDelta;
        if (pop.querySelector('.kuiper-cal-picker-week')) {
          setWeekYear(anchorIsoYear() + delta, { keepPickerOpen: true });
        } else {
          const { year, month } = anchorMonthYear();
          setMonthYear(year + delta, month, { keepPickerOpen: true });
        }
      });
    });

    pop.querySelectorAll('.kuiper-cal-month-opt').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const month = +btn.dataset.month;
        const { year } = anchorMonthYear();
        setMonthYear(year, month);
      });
    });

    pop.querySelectorAll('.kuiper-cal-week-opt').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const monday = btn.dataset.monday;
        if (!monday) return;
        setAnchorDate(monday);
        pop.hidden = true;
        pop.parentElement?.querySelector('.kuiper-cal-period-btn')?.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function render(host) {
    const tasks = KuiperUI.visibleTasks({ includeUnscheduled: false });
    host.innerHTML = '';
    host.className = 'board kuiper-calendar';
    const shell = document.createElement('div');
    shell.className = 'kuiper-cal-shell';
    const toolbar = document.createElement('div');
    toolbar.className = 'kuiper-cal-toolbar';
    toolbar.innerHTML = `
      <div class="kuiper-cal-mode seg">
        <button type="button" data-mode="month" aria-pressed="${mode() === 'month'}">${esc(tr('calendarMonth'))}</button>
        <button type="button" data-mode="week" aria-pressed="${mode() === 'week'}">${esc(tr('calendarWeek'))}</button>
        <button type="button" data-mode="day" aria-pressed="${mode() === 'day'}">${esc(tr('calendarDay'))}</button>
      </div>
      <div class="kuiper-cal-nav">
        <div class="kuiper-cal-period-nav" data-period="${esc(mode())}">
          <button type="button" class="icon sm kuiper-cal-step" data-act="prev" aria-label="${esc(tr('ganttNavPrev'))}">‹</button>
          <div class="kuiper-cal-period">
            <button type="button" class="kuiper-cal-period-btn" aria-haspopup="true" aria-expanded="false">
              <span class="kuiper-cal-period-label">${esc(periodTitle())}</span>
              ${periodChevron}
            </button>
            <div class="kuiper-cal-period-pop" hidden${mode() === 'day' ? ' data-skip-pop="1"' : ''}></div>
          </div>
          <button type="button" class="icon sm kuiper-cal-step" data-act="next" aria-label="${esc(tr('ganttNavNext'))}">›</button>
        </div>
        <button type="button" class="pill" data-act="today">${esc(tr('calendarToday'))}</button>
      </div>`;
    shell.append(toolbar);
    const body = document.createElement('div');
    body.className = mode() === 'day' ? 'kuiper-cal-body kuiper-scroll' : 'kuiper-cal-body';
    shell.append(body);
    host.append(shell);

    if (mode() === 'month') renderMonth(body, tasks);
    else if (mode() === 'week') renderWeek(body, tasks);
    else renderDay(body, tasks);

    if (!tasks.length) {
      const empty = document.createElement('p');
      empty.className = 'kuiper-cal-empty kuiper-cal-empty-banner';
      empty.textContent = tr('calendarEmpty');
      body.append(empty);
    }

    toolbar.querySelectorAll('[data-mode]').forEach(btn => {
      btn.onclick = () => setMode(btn.dataset.mode);
    });
    toolbar.querySelector('[data-act="prev"]').onclick = () => shiftAnchor(-1);
    toolbar.querySelector('[data-act="next"]').onclick = () => shiftAnchor(1);
    toolbar.querySelector('[data-act="today"]').onclick = () => goToday();
    bindPeriodPicker(toolbar);

    if (reopenPeriodPicker) {
      reopenPeriodPicker = false;
      const pop = toolbar.querySelector('.kuiper-cal-period-pop');
      const btn = toolbar.querySelector('.kuiper-cal-period-btn');
      if (pop && btn && mode() !== 'day') openPeriodPop(btn, pop);
    }
  }

  function init(hooks) {
    ctx = hooks;
    ensureDatePicker();
  }

  return { init, render };
})();

if (typeof module !== 'undefined') module.exports = { KuiperCalendar };
