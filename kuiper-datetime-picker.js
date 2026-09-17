/* Selectores de fecha y hora (24h) con estilo de la app — sin controles nativos */
const KuiperDateTimePicker = (() => {
  let layer = null;
  let onClose = null;
  let ctx = { tr: k => k, locale: () => 'es' };

  const WEEKDAYS = {
    en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
    es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
  };

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function escAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function parseYmd(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: +m[1], mo: +m[2], d: +m[3] };
  }

  function toYmd(y, mo, d) {
    return `${y}-${pad2(mo)}-${pad2(d)}`;
  }

  const CLOCK_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 5v3.5l2 1.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';

  function tryParseHm(value) {
    const s = String(value || '').trim();
    if (!s) return null;
    const colon = s.match(/^(\d{1,2}):(\d{1,2})$/);
    if (colon) {
      const h = +colon[1];
      const m = +colon[2];
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { h, m };
      return null;
    }
    const digits = s.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length <= 2) {
      const h = +digits;
      if (h >= 0 && h <= 23) return { h, m: 0 };
      return null;
    }
    if (digits.length === 3) {
      const h = +digits[0];
      const m = +digits.slice(1);
      if (h >= 0 && h <= 9 && m >= 0 && m <= 59) return { h, m };
      return null;
    }
    if (digits.length === 4) {
      const h = +digits.slice(0, 2);
      const m = +digits.slice(2);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { h, m };
      return null;
    }
    return null;
  }

  function parseHm(value) {
    return tryParseHm(value) || { h: 9, m: 0 };
  }

  function normalizeTimeInput(value) {
    const p = tryParseHm(value);
    return p ? toHm(p.h, p.m) : '';
  }

  function nowHm(offsetMinutes = 0) {
    const d = new Date(Date.now() + offsetMinutes * 60000);
    return toHm(d.getHours(), d.getMinutes());
  }

  function addMinutesToHm(hm, minutes) {
    const p = tryParseHm(hm);
    if (!p) return '';
    const d = new Date();
    d.setHours(p.h, p.m + minutes, 0, 0);
    return toHm(d.getHours(), d.getMinutes());
  }

  function toHm(h, m) {
    return `${pad2(h)}:${pad2(m)}`;
  }

  function todayYmd() {
    const d = new Date();
    return toYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function localeTag() {
    const loc = ctx.locale?.() || 'es';
    return loc === 'es' ? 'es-ES' : 'en-GB';
  }

  function monthLabel(y, mo) {
    const d = new Date(y, mo - 1, 1);
    return d.toLocaleDateString(localeTag(), { month: 'long', year: 'numeric' });
  }

  function formatDateDisplay(ymd) {
    const p = parseYmd(ymd);
    if (!p) return '';
    const d = new Date(p.y, p.mo - 1, p.d);
    return d.toLocaleDateString(localeTag(), { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatTimeDisplay(hm) {
    const { h, m } = parseHm(hm);
    return toHm(h, m);
  }

  function ensureLayer() {
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'kuiperPickerLayer';
    layer.hidden = true;
    layer.innerHTML = `
      <div class="kuiper-picker-scrim" data-act="close"></div>
      <div class="kuiper-picker-pop" role="dialog" aria-modal="true">
        <div class="kuiper-picker-body"></div>
        <div class="kuiper-picker-foot" hidden>
          <div class="seg kuiper-picker-foot-seg" role="group">
            <button type="button" data-act="cancel"></button>
            <button type="button" data-act="ok"></button>
          </div>
        </div>
      </div>`;
    document.body.append(layer);
    layer.querySelector('[data-act="close"]').addEventListener('click', close);
    layer.querySelector('[data-act="cancel"]').addEventListener('click', close);
    layer.addEventListener('keydown', e => {
      if (e.key === 'Escape') close();
    });
    return layer;
  }

  function close() {
    if (onClose) onClose();
    onClose = null;
    if (layer) {
      layer.hidden = true;
      layer.querySelector('.kuiper-picker-body').innerHTML = '';
    }
  }

  function positionPop(anchor, { clientX, clientY } = {}) {
    const pop = layer.querySelector('.kuiper-picker-pop');
    if (!pop || !anchor) return;
    const margin = 8;
    const gap = 6;
    const rect = anchor.getBoundingClientRect();
    const maxW = Math.min(280, window.innerWidth - margin * 2);
    pop.style.width = `${maxW}px`;
    pop.style.left = '0';
    pop.style.top = '0';
    pop.style.visibility = 'hidden';
    const popH = pop.offsetHeight;
    const popW = pop.offsetWidth;
    const anchorX = Number.isFinite(clientX) ? clientX : (rect.left + rect.width / 2);
    const anchorY = Number.isFinite(clientY) ? clientY : (rect.top + rect.height / 2);
    let left = anchorX - (popW / 2);
    if (left + popW > window.innerWidth - margin) {
      left = window.innerWidth - popW - margin;
    }
    if (left < margin) left = margin;
    let top = rect.bottom + gap;
    if (Number.isFinite(clientY) && clientY > rect.bottom - 2) {
      top = clientY + gap;
    }
    if (top + popH > window.innerHeight - margin) {
      top = rect.top - popH - gap;
      if (Number.isFinite(clientY) && clientY < rect.top + 2) {
        top = clientY - popH - gap;
      }
    }
    if (top < margin) top = Math.max(margin, window.innerHeight - popH - margin);
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
    pop.style.visibility = '';
  }

  function repositionPop(anchor, point = {}) {
    requestAnimationFrame(() => positionPop(anchor, point));
  }

  function openDate({ anchor, value, onPick, clientX, clientY }) {
    ensureLayer();
    if (!layer.hidden) close();
    const body = layer.querySelector('.kuiper-picker-body');
    const foot = layer.querySelector('.kuiper-picker-foot');
    const okBtn = layer.querySelector('[data-act="ok"]');
    const cancelBtn = layer.querySelector('[data-act="cancel"]');
    cancelBtn.textContent = ctx.tr('cancel') || 'Cancel';
    okBtn.textContent = ctx.tr('save') || 'Save';
    foot.hidden = true;

    let view = parseYmd(value) || parseYmd(todayYmd());

    function pickDay(y, mo, d) {
      onPick(toYmd(y, mo, d));
      close();
    }

    function render() {
      const { y, mo } = view;
      const first = new Date(y, mo - 1, 1);
      const startPad = (first.getDay() + 6) % 7;
      const daysInMonth = new Date(y, mo, 0).getDate();
      const wd = WEEKDAYS[ctx.locale?.() === 'en' ? 'en' : 'es'];
      const cells = [];
      for (let i = 0; i < startPad; i++) cells.push('');
      for (let d = 1; d <= daysInMonth; d++) cells.push(d);

      body.innerHTML = `
        <div class="kuiper-picker-cal">
          <div class="kuiper-picker-cal-head">
            <button type="button" class="icon sm kuiper-picker-nav" data-act="prev" aria-label="Previous month">‹</button>
            <span class="kuiper-picker-cal-title">${monthLabel(y, mo)}</span>
            <button type="button" class="icon sm kuiper-picker-nav" data-act="next" aria-label="Next month">›</button>
          </div>
          <div class="kuiper-picker-cal-weekdays">${wd.map(w => `<span>${w}</span>`).join('')}</div>
          <div class="kuiper-picker-cal-grid">
            ${cells.map(cell => {
              if (!cell) return '<span class="kuiper-picker-cal-pad"></span>';
              const sel = value && parseYmd(value)?.y === y && parseYmd(value)?.mo === mo && parseYmd(value)?.d === cell;
              const today = parseYmd(todayYmd());
              const isToday = today && today.y === y && today.mo === mo && today.d === cell;
              return `<button type="button" class="kuiper-picker-cal-day${sel ? ' is-selected' : ''}${isToday ? ' is-today' : ''}" data-day="${cell}">${cell}</button>`;
            }).join('')}
          </div>
        </div>`;

      body.querySelector('[data-act="prev"]').onclick = () => {
        const d = new Date(y, mo - 2, 1);
        view = { y: d.getFullYear(), mo: d.getMonth() + 1, d: 1 };
        render();
      };
      body.querySelector('[data-act="next"]').onclick = () => {
        const d = new Date(y, mo, 1);
        view = { y: d.getFullYear(), mo: d.getMonth() + 1, d: 1 };
        render();
      };
      body.querySelectorAll('[data-day]').forEach(btn => {
        btn.onclick = () => pickDay(y, mo, +btn.dataset.day);
      });
    }

    const pop = layer.querySelector('.kuiper-picker-pop');
    layer.hidden = false;
    pop?.classList.remove('is-time');
    render();
    repositionPop(anchor, { clientX, clientY });
    onClose = () => {};
  }

  function openTime({ anchor, value, onPick, labelKey, clientX, clientY }) {
    ensureLayer();
    if (!layer.hidden) close();
    const body = layer.querySelector('.kuiper-picker-body');
    const foot = layer.querySelector('.kuiper-picker-foot');
    const okBtn = layer.querySelector('[data-act="ok"]');
    const cancelBtn = layer.querySelector('[data-act="cancel"]');
    cancelBtn.textContent = ctx.tr('cancel') || 'Cancel';
    okBtn.textContent = ctx.tr('save') || 'Save';
    foot.hidden = false;
    const pop = layer.querySelector('.kuiper-picker-pop');
    pop?.classList.add('is-time');

    let sel = parseHm(value);
    const label = ctx.tr(labelKey || 'timeManualStart') || 'Time';

    function render() {
      const hours = Array.from({ length: 24 }, (_, i) => i);
      const mins = Array.from({ length: 60 }, (_, i) => i);
      body.innerHTML = `
        <div class="kuiper-picker-time">
          <div class="kuiper-picker-time-head">
            <span>${label}</span>
            <strong class="kuiper-picker-time-preview">${toHm(sel.h, sel.m)}</strong>
          </div>
          <div class="kuiper-picker-time-cols">
            <div class="kuiper-picker-time-col kuiper-scroll" data-part="h">
              ${hours.map(h => `<button type="button" data-val="${h}" aria-pressed="${h === sel.h}">${pad2(h)}</button>`).join('')}
            </div>
            <div class="kuiper-picker-time-col kuiper-scroll" data-part="m">
              ${mins.map(m => `<button type="button" data-val="${m}" aria-pressed="${m === sel.m}">${pad2(m)}</button>`).join('')}
            </div>
          </div>
        </div>`;

      body.querySelectorAll('.kuiper-picker-time-col button').forEach(btn => {
        btn.onclick = () => {
          const part = btn.closest('[data-part]').dataset.part;
          sel[part] = +btn.dataset.val;
          body.querySelector('.kuiper-picker-time-preview').textContent = toHm(sel.h, sel.m);
          body.querySelectorAll(`.kuiper-picker-time-col[data-part="${part}"] button`).forEach(b => {
            b.setAttribute('aria-pressed', String(+b.dataset.val === sel[part]));
          });
          const col = btn.closest('.kuiper-picker-time-col');
          const active = col.querySelector('[aria-pressed="true"]');
          if (active) active.scrollIntoView({ block: 'nearest' });
        };
      });

      ['h', 'm'].forEach(part => {
        const active = body.querySelector(`.kuiper-picker-time-col[data-part="${part}"] [aria-pressed="true"]`);
        if (active) active.scrollIntoView({ block: 'center' });
      });
    }

    okBtn.onclick = () => {
      onPick(toHm(sel.h, sel.m));
      close();
    };

    layer.hidden = false;
    render();
    repositionPop(anchor, { clientX, clientY });
    onClose = () => {};
  }

  function syncTrigger(hidden, trigger) {
    const val = hidden.value || '';
    const display = trigger.querySelector('.kuiper-dt-trigger-val');
    const isDate = hidden.dataset.kind === 'date';
    const text = val
      ? (isDate ? formatDateDisplay(val) : formatTimeDisplay(val))
      : (trigger.dataset.placeholder || '—');
    if (display) display.textContent = text;
    trigger.classList.toggle('is-empty', !val);
  }

  function syncTimeInput(input) {
    const normalized = normalizeTimeInput(input.value);
    if (normalized) input.dataset.lastValid = normalized;
    input.classList.toggle('is-empty', !input.value.trim());
  }

  function commitTimeInput(input) {
    const raw = input.value.trim();
    if (!raw) {
      input.value = '';
      delete input.dataset.lastValid;
      syncTimeInput(input);
      return;
    }
    const normalized = normalizeTimeInput(raw);
    if (!normalized) {
      input.value = input.dataset.lastValid || '';
    } else {
      input.value = normalized;
      input.dataset.lastValid = normalized;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    syncTimeInput(input);
  }

  function wireDateField({ hiddenId, triggerId }) {
    const hidden = document.getElementById(hiddenId);
    const trigger = document.getElementById(triggerId);
    if (!hidden || !trigger || trigger.dataset.pickerWired) return;
    trigger.dataset.pickerWired = '1';
    hidden.dataset.kind = 'date';
    trigger.addEventListener('click', e => {
      openDate({
        anchor: trigger,
        clientX: e.clientX,
        clientY: e.clientY,
        value: hidden.value || todayYmd(),
        onPick: v => {
          hidden.value = v;
          syncTrigger(hidden, trigger);
          hidden.dispatchEvent(new Event('change', { bubbles: true }));
        },
      });
    });
    syncTrigger(hidden, trigger);
  }

  function wireTimeField({ inputId, triggerId, labelKey }) {
    const input = document.getElementById(inputId);
    const pickerBtn = document.getElementById(triggerId);
    if (!input || !pickerBtn || input.dataset.pickerWired) return;
    input.dataset.pickerWired = '1';
    input.dataset.kind = 'time';
    if (input.value) input.dataset.lastValid = normalizeTimeInput(input.value) || input.value;

    input.addEventListener('blur', () => commitTimeInput(input));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });

    pickerBtn.addEventListener('click', e => {
      const current = normalizeTimeInput(input.value) || input.dataset.lastValid || '09:00';
      openTime({
        anchor: pickerBtn,
        clientX: e.clientX,
        clientY: e.clientY,
        labelKey,
        value: current,
        onPick: v => {
          input.value = v;
          input.dataset.lastValid = v;
          syncTimeInput(input);
          input.dispatchEvent(new Event('change', { bubbles: true }));
        },
      });
    });

    syncTimeInput(input);
  }

  function mountManualFields() {
    wireDateField({ hiddenId: 'kuiperManualDate', triggerId: 'kuiperManualDateBtn' });
    wireTimeField({ inputId: 'kuiperManualStart', triggerId: 'kuiperManualStartBtn', labelKey: 'timeManualStart' });
    wireTimeField({ inputId: 'kuiperManualEnd', triggerId: 'kuiperManualEndBtn', labelKey: 'timeManualEnd' });
  }

  function upgradeTimeRow(row, { inputId, triggerId, placeholderKey }) {
    if (row.querySelector(`#${inputId}`)?.classList.contains('kuiper-dt-input')) return;
    const oldBtn = row.querySelector(`#${triggerId}`);
    const oldInput = row.querySelector(`#${inputId}`);
    const prevVal = oldInput?.value || '';
    const combo = document.createElement('div');
    combo.className = 'kuiper-dt-combo';
    combo.innerHTML = `
      <input type="text" class="kuiper-dt-input" id="${inputId}" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="09:00" value="${escAttr(prevVal)}">
      <button type="button" class="icon sm kuiper-dt-picker-btn" id="${triggerId}" aria-label="${ctx.tr(placeholderKey) || 'Time'}">${CLOCK_ICON}</button>`;
    if (oldBtn) {
      oldBtn.replaceWith(combo);
      oldInput?.remove();
    } else if (oldInput) {
      oldInput.replaceWith(combo);
    }
  }

  function upgradeDateRow(row, { hiddenId, triggerId, placeholderKey }) {
    const old = row.querySelector('input, button.kuiper-dt-trigger');
    if (!old) return;
    if (row.querySelector(`#${triggerId}`)) return;

    const isNative = old.tagName === 'INPUT';
    const prevVal = isNative ? old.value : (document.getElementById(hiddenId)?.value || '');
    if (isNative) {
      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.id = hiddenId;
      hidden.value = prevVal;
      hidden.dataset.kind = 'date';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kuiper-dt-trigger';
      btn.id = triggerId;
      btn.dataset.placeholder = ctx.tr(placeholderKey) || '—';
      btn.innerHTML = '<span class="kuiper-dt-trigger-val"></span>';

      old.replaceWith(btn);
      btn.after(hidden);
    }
  }

  function upgradeManualDom() {
    const rows = [
      { hiddenId: 'kuiperManualDate', triggerId: 'kuiperManualDateBtn', kind: 'date', placeholderKey: 'timeManualDate' },
      { hiddenId: 'kuiperManualStart', triggerId: 'kuiperManualStartBtn', kind: 'time', placeholderKey: 'timeManualStart' },
      { hiddenId: 'kuiperManualEnd', triggerId: 'kuiperManualEndBtn', kind: 'time', placeholderKey: 'timeManualEnd' },
    ];
    rows.forEach(cfg => {
      const el = document.getElementById(cfg.hiddenId);
      const row = el?.closest('.kuiper-time-dt-row');
      if (!row) return;
      if (cfg.kind === 'time') upgradeTimeRow(row, { inputId: cfg.hiddenId, triggerId: cfg.triggerId, placeholderKey: cfg.placeholderKey });
      else upgradeDateRow(row, cfg);
    });
    mountManualFields();
  }

  function setDefaults({ date, start, end } = {}) {
    const dateEl = document.getElementById('kuiperManualDate');
    const startEl = document.getElementById('kuiperManualStart');
    const endEl = document.getElementById('kuiperManualEnd');
    if (dateEl && !dateEl.value) dateEl.value = date || todayYmd();
    if (startEl && !startEl.value) {
      startEl.value = start || nowHm(0);
      startEl.dataset.lastValid = normalizeTimeInput(startEl.value);
    }
    if (endEl && !endEl.value) {
      const startVal = normalizeTimeInput(startEl?.value) || nowHm(0);
      endEl.value = end || addMinutesToHm(startVal, 60) || nowHm(60);
      endEl.dataset.lastValid = normalizeTimeInput(endEl.value);
    }
    mountManualFields();
    const dateTrigger = document.getElementById('kuiperManualDateBtn');
    const dateHidden = document.getElementById('kuiperManualDate');
    if (dateTrigger && dateHidden) syncTrigger(dateHidden, dateTrigger);
    ['kuiperManualStart', 'kuiperManualEnd'].forEach(id => {
      const input = document.getElementById(id);
      if (input) syncTimeInput(input);
    });
  }

  function init(options = {}) {
    ctx = { ...ctx, ...options };
    upgradeManualDom();
  }

  function mountTimeEntryEdit(entryId) {
    const id = String(entryId || '').replace(/[^\w-]/g, '');
    if (!id) return;
    wireDateField({ hiddenId: `kuiperTimeEditDate-${id}`, triggerId: `kuiperTimeEditDateBtn-${id}` });
    wireTimeField({
      inputId: `kuiperTimeEditStart-${id}`,
      triggerId: `kuiperTimeEditStartBtn-${id}`,
      labelKey: 'timeManualStart',
    });
    wireTimeField({
      inputId: `kuiperTimeEditEnd-${id}`,
      triggerId: `kuiperTimeEditEndBtn-${id}`,
      labelKey: 'timeManualEnd',
    });
    const dateHidden = document.getElementById(`kuiperTimeEditDate-${id}`);
    const dateTrigger = document.getElementById(`kuiperTimeEditDateBtn-${id}`);
    if (dateHidden && dateTrigger) syncTrigger(dateHidden, dateTrigger);
    [`kuiperTimeEditStart-${id}`, `kuiperTimeEditEnd-${id}`].forEach(fieldId => {
      const input = document.getElementById(fieldId);
      if (input) syncTimeInput(input);
    });
  }

  return {
    init,
    close,
    mountManualFields,
    mountTimeEntryEdit,
    upgradeManualDom,
    setDefaults,
    formatDateDisplay,
    formatTimeDisplay,
    normalizeTimeInput,
    addMinutesToHm,
    nowHm,
    todayYmd,
    wireDateField,
    wireTimeField,
  };
})();

if (typeof window !== 'undefined') window.KuiperDateTimePicker = KuiperDateTimePicker;
