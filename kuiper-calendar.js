/* Vista calendario Kuiper — mes / semana / día */
const KuiperCalendar = (() => {
  let ctx = {};

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

  function formatMonthTitle(y, mo) {
    const d = new Date(Date.UTC(y, mo - 1, 1));
    return d.toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  }

  function formatDayTitle(day) {
    const d = new Date(`${day}T12:00:00Z`);
    return d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function chipHtml(t, { deadline = false } = {}) {
    const p = KuiperUI.projectOf(t);
    const color = p?.color || '#9AA5B8';
    const cls = deadline ? 'kuiper-cal-chip is-deadline' : 'kuiper-cal-chip';
    return `<button type="button" class="${cls}" data-task-id="${esc(t.id)}" style="--c:${esc(color)}" title="${esc(t.title)}">
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
    const track = root.querySelector('.kuiper-cal-bar-track, .kuiper-cal-week-head');
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

  function renderMonth(body, tasks) {
    const anchor = anchorDate();
    const { year, month, weeks } = BoardCore.calendarMonthGrid(anchor);
    const today = BoardCore.ymd();
    const groups = groupedVisibleTasks();
    let html = '<div class="kuiper-cal-grid" role="grid">';
    const wd = locale().startsWith('es')
      ? ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    html += `<div class="kuiper-cal-head" role="row">${wd.map(w => `<span role="columnheader">${w}</span>`).join('')}</div>`;
    for (const week of weeks) {
      html += '<div class="kuiper-cal-row" role="row">';
      for (const day of week) {
        if (!day) {
          html += '<div class="kuiper-cal-cell is-pad" role="gridcell"></div>';
          continue;
        }
        const isToday = day === today;
        const dayTasks = BoardCore.issuesForDay(tasks, day);
        html += `<div class="kuiper-cal-cell${isToday ? ' is-today' : ''}" role="gridcell" data-day="${day}" aria-label="${esc(day)}">
          <div class="kuiper-cal-daynum">${+day.split('-')[2]}</div>
          <div class="kuiper-cal-cell-body">`;
        const st = ctx.state?.();
        const grouped = (st?.groupBy && st.groupBy !== 'none')
          ? groups.map(g => ({ header: g.header, items: g.tasks.filter(t => BoardCore.issueOnDay(t, day)) })).filter(g => g.items.length)
          : [{ header: null, items: dayTasks }];
        for (const g of grouped) {
          if (g.header) html += `<div class="kuiper-cal-group">${esc(g.header)}</div>`;
          const max = document.documentElement.dataset.density === 'compact' ? 2 : 3;
          g.items.slice(0, max).forEach(t => {
            const deadline = !t.scheduleStartDate && !!t.scheduleEndDate;
            html += chipHtml(t, { deadline });
          });
          if (g.items.length > max) {
            html += `<button type="button" class="kuiper-cal-more" data-day="${day}">${tr('calendarMore', { n: g.items.length - max })}</button>`;
          }
        }
        html += '</div></div>';
      }
      html += '</div>';
    }
    html += '</div>';
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
        const day = cell.dataset.day;
        ctx.openEditor?.('new');
      });
    });
  }

  function renderWeek(body, tasks) {
    const days = BoardCore.calendarWeekDays(anchorDate());
    const today = BoardCore.ymd();
    const groups = groupedVisibleTasks();
    let html = '<div class="kuiper-cal-week">';
    html += `<div class="kuiper-cal-week-head">${days.map(day => {
      const d = new Date(`${day}T12:00:00Z`);
      const label = d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric' });
      return `<div class="kuiper-cal-week-col${day === today ? ' is-today' : ''}" data-day="${day}"><span>${label}</span></div>`;
    }).join('')}</div>`;
    html += '<div class="kuiper-cal-week-body">';
    for (const g of groups) {
      if (g.header) html += `<div class="kuiper-cal-week-group">${esc(g.header)}</div>`;
      for (const t of g.tasks) {
        const span = BoardCore.spanWeekRows(t, days);
        if (!span) continue;
        const p = KuiperUI.projectOf(t);
        const color = p?.color || '#9AA5B8';
        const deadline = !t.scheduleStartDate && !!t.scheduleEndDate;
        html += `<div class="kuiper-cal-bar-row">
          <div class="kuiper-cal-bar-label">${esc(t.id)}</div>
          <div class="kuiper-cal-bar-track">
            <button type="button" class="kuiper-cal-bar${deadline ? ' is-deadline' : ''}" data-task-id="${esc(t.id)}"
              style="--c:${esc(color)};grid-column:${span.from + 1} / span ${span.span};">${esc(t.title)}</button>
          </div>
        </div>`;
      }
    }
    html += '</div></div>';
    body.innerHTML = html;
    bindChips(body);
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
        html += chipHtml(t, { deadline: !t.scheduleStartDate && !!t.scheduleEndDate });
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

  function unscheduledCount() {
    return KuiperUI.visibleTasks({ includeUnscheduled: true })
      .filter(t => !t.scheduleStartDate && !t.scheduleEndDate).length;
  }

  function render(host) {
    const tasks = KuiperUI.visibleTasks({ includeUnscheduled: false });
    host.innerHTML = '';
    host.className = 'board kuiper-calendar';
    const shell = document.createElement('div');
    shell.className = 'kuiper-cal-shell';
    const toolbar = document.createElement('div');
    toolbar.className = 'kuiper-cal-toolbar';
    const anchor = anchorDate();
    const [y, mo] = anchor.split('-').map(Number);
    const title = mode() === 'month'
      ? formatMonthTitle(y, mo)
      : mode() === 'week'
        ? formatDayTitle(BoardCore.calendarWeekDays(anchor)[0])
        : formatDayTitle(anchor);
    toolbar.innerHTML = `
      <div class="kuiper-cal-mode seg">
        <button type="button" data-mode="month" aria-pressed="${mode() === 'month'}">${esc(tr('calendarMonth'))}</button>
        <button type="button" data-mode="week" aria-pressed="${mode() === 'week'}">${esc(tr('calendarWeek'))}</button>
        <button type="button" data-mode="day" aria-pressed="${mode() === 'day'}">${esc(tr('calendarDay'))}</button>
      </div>
      <div class="kuiper-cal-nav">
        <button type="button" class="icon sm" data-act="prev" aria-label="Previous">‹</button>
        <button type="button" class="pill" data-act="today">${esc(tr('calendarToday'))}</button>
        <button type="button" class="icon sm" data-act="next" aria-label="Next">›</button>
        <span class="kuiper-cal-title">${esc(title)}</span>
      </div>
      <button type="button" class="pill sm kuiper-cal-unscheduled" id="kuiperCalUnscheduled" hidden>
        ${esc(tr('calendarUnscheduled'))} (<span id="kuiperCalUnschedCount">0</span>)
      </button>`;
    shell.append(toolbar);
    const body = document.createElement('div');
    body.className = 'kuiper-cal-body kuiper-scroll';
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

    const unsched = unscheduledCount();
    const unBtn = toolbar.querySelector('#kuiperCalUnscheduled');
    const unCount = toolbar.querySelector('#kuiperCalUnschedCount');
    if (unBtn && unCount) {
      unCount.textContent = String(unsched);
      unBtn.hidden = unsched === 0;
      unBtn.onclick = () => ctx.toast?.(tr('calendarUnscheduledHint'));
    }

    toolbar.querySelectorAll('[data-mode]').forEach(btn => {
      btn.onclick = () => setMode(btn.dataset.mode);
    });
    toolbar.querySelector('[data-act="prev"]').onclick = () => shiftAnchor(-1);
    toolbar.querySelector('[data-act="next"]').onclick = () => shiftAnchor(1);
    toolbar.querySelector('[data-act="today"]').onclick = () => goToday();
  }

  function init(hooks) {
    ctx = hooks;
  }

  return { init, render };
})();

if (typeof module !== 'undefined') module.exports = { KuiperCalendar };
