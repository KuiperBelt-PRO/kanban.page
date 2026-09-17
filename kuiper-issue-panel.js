/* Panel lateral y pestañas inferiores de issue (modo Kuiper) */
const KuiperIssuePanel = (() => {
  const TAG_COLORS = [
    '#FFB454', '#7FD1AE', '#8FB8FF', '#F58FA8', '#C79BFF', '#6FD3E8', '#D6C36B', '#9AA5B8',
  ];

  let ctx = {};
  let panelReady = false;
  let currentCardId = null;
  let detail = null;
  let timerTick = null;
  let activeTab = 'comments';
  let timeMode = 'timer';
  let linkedOpen = true;
  let editingCommentId = null;
  let editingTimeEntryId = null;

  const DISCARD_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5h11M6 4.5V3.25A.75.75 0 0 1 6.75 2.5h2.5a.75.75 0 0 1 .75.75V4.5m-5.5 0v8.25a1 1 0 0 0 1 1h6.5a1 1 0 0 0 1-1V4.5H4.5z"/><path d="M6.75 7.25v4.25M9.25 7.25v4.25"/></svg>';
  const EDIT_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.25 2.75 13.25 4.75 5.5 12.5 3.25 12.75 3.5 10.5 11.25 2.75z"/><path d="M10 4 12 6"/></svg>';
  const TIME_CLOCK_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 5v3.5l2 1.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';

  function tr(key, vars) {
    return ctx.tr?.(key, vars) || key;
  }

  function esc(s) {
    return ctx.esc?.(s) ?? String(s ?? '');
  }

  function renderMd(raw) {
    return ctx.renderMarkdown?.(raw) || esc(raw);
  }

  function boardTasks() {
    return (ctx.state?.()?.tasks || []).filter(t => !t.archivedAt);
  }

  function tagColor(name) {
    return ctx.tagColor?.(name) || (() => {
      const s = String(name || '');
      let h = 0;
      for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
      return TAG_COLORS[Math.abs(h) % TAG_COLORS.length];
    })();
  }

  function boardTagNames() {
    const raw = detail?.boardTags || ctx.state?.()?._kuiper?.boardTags || [];
    return raw.map(t => (typeof t === 'string' ? t : t?.name)).filter(Boolean);
  }

  function normalizeLink(item) {
    return {
      id: item.id,
      title: item.title,
      linkId: item.link_id || item.linkId,
    };
  }

  function taskMeta(cardId) {
    const t = boardTasks().find(x => x.id === cardId);
    if (!t) return { stage: '', done: false };
    const col = (ctx.state?.().columns || []).find(c => c.id === t.columnId);
    const name = col?.name || '';
    const done = String(name).toUpperCase() === 'DONE';
    const stage = ctx.stageLabel?.(name) || name;
    return { stage, done };
  }

  function formatDurationHMS(totalSec) {
    const sec = Math.max(0, Math.floor(totalSec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function formatMinutes(mins) {
    const m = Math.max(0, Math.round(Number(mins) || 0));
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h && r) return `${h}h ${r}m`;
    if (h) return `${h}h`;
    return `${r}m`;
  }

  function formatWhen(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const loc = ctx.locale?.() || 'es';
    return d.toLocaleString(loc === 'es' ? 'es-ES' : 'en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }

  function syncTaskFromDetail() {
    if (!detail || !currentCardId) return;
    const st = ctx.state?.();
    const t = st?.tasks?.find(x => x.id === currentCardId);
    if (!t) return;
    t.tags = (detail.tags || []).map(x => x.name);
    t.estimatedMinutes = detail.card?.estimated_minutes ?? null;
    t.blockedBy = (detail.links?.blockedBy || []).map(l => ({
      id: l.id, title: l.title, linkId: l.link_id,
    }));
    t.blocks = (detail.links?.blocks || []).map(l => ({
      id: l.id, title: l.title, linkId: l.link_id,
    }));
    t.related = (detail.links?.related || []).map(l => ({
      id: l.id, title: l.title, linkId: l.link_id,
    }));
    t.timeLoggedMinutes = detail.timeLoggedMinutes || 0;
    t.activeTimer = detail.activeTimer ? {
      id: detail.activeTimer.id,
      startedAt: detail.activeTimer.started_at,
      label: detail.activeTimer.label || '',
    } : null;
    if (st?._kuiper) {
      st._kuiper.boardTags = (detail.boardTags || []).map(x => x.name);
    }
  }

  async function reloadDetail() {
    if (!currentCardId || currentCardId === 'new') return;
    detail = await KuiperStore.loadCardDetail(currentCardId);
    syncTaskFromDetail();
    renderAll();
    ctx.onDetailChanged?.();
  }

  function ensureLayout() {
    if (panelReady) return;
    const aside = document.getElementById('kuiperEditorAside');
    const main = document.querySelector('.kuiper-editor-main');
    const notesWrap = document.querySelector('.kuiper-notes-wrap');
    const stackParent = notesWrap?.parentElement;
    if (!aside || !main || !stackParent || !notesWrap) return;
    panelReady = true;

    const extras = document.createElement('div');
    extras.id = 'kuiperIssueAsideExtras';
    extras.className = 'kuiper-issue-aside-extras';
    extras.innerHTML = `
      <div class="kuiper-aside-group">
        <div class="kuiper-ed-field" id="kuiperEdTagsField">
          <span class="kuiper-ed-lbl" data-i18n="tags"></span>
          <div class="kuiper-tag-editor" id="kuiperTagEditor">
            <div class="kuiper-tag-chips" id="kuiperTagChips"></div>
            <input type="text" id="kuiperTagInput" class="kuiper-tag-input" autocomplete="off" spellcheck="false">
            <div class="kuiper-tag-suggest" id="kuiperTagSuggest" hidden></div>
          </div>
        </div>
      </div>
      <div class="kuiper-aside-group">
        <div class="kuiper-ed-field kuiper-time-tracker" id="kuiperTimeTracker">
        <span class="kuiper-ed-lbl" data-i18n="trackTime"></span>
        <div class="kuiper-time-estimate" id="kuiperEdEstimateField">
          <span class="kuiper-time-dt-lbl" data-i18n="estimatedHours"></span>
          <div class="kuiper-estimate-row">
            <input type="text" id="kuiperEstimateInput" class="kuiper-estimate-input" data-i18n-placeholder="estimatePlaceholder" autocomplete="off" spellcheck="false">
          </div>
        </div>
        <div class="kuiper-time-summary" id="kuiperTimeSummary"></div>
        <div class="kuiper-time-progress" id="kuiperTimeProgress" hidden>
          <div class="kuiper-time-progress-track">
            <div class="kuiper-time-progress-green" id="kuiperTimeProgressGreen"></div>
            <div class="kuiper-time-progress-red" id="kuiperTimeProgressRed"></div>
          </div>
        </div>
        <div class="kuiper-time-controls">
        <div class="seg kuiper-time-modebar" role="tablist">
          <button type="button" data-mode="timer" aria-pressed="true" data-i18n="timeTimerTab"></button>
          <button type="button" data-mode="manual" aria-pressed="false" data-i18n="timeManualTab"></button>
        </div>
        <div class="kuiper-time-pane" data-pane="timer">
          <input type="text" id="kuiperTimerLabel" class="kuiper-time-field" data-i18n-placeholder="timeLabelOptional">
          <div class="kuiper-time-running" id="kuiperTimeRunning" hidden>
            <div class="seg kuiper-time-seg">
              <span class="kuiper-time-clock-val running" id="kuiperTimeElapsed">00:00:00</span>
            </div>
            <div class="kuiper-time-actions">
              <button type="button" class="danger kuiper-time-stop" id="kuiperTimerStop" data-i18n="stopTimer"></button>
              <button type="button" class="kuiper-time-discard" id="kuiperTimerDiscard">
                <span class="kuiper-time-discard-icon" aria-hidden="true">${DISCARD_ICON}</span>
                <span data-i18n="discardTimer"></span>
              </button>
            </div>
          </div>
          <div class="kuiper-time-idle" id="kuiperTimeIdle">
            <div class="seg kuiper-time-seg muted">
              <span class="kuiper-time-clock-val" id="kuiperTimeIdleDisplay">00:00:00</span>
            </div>
            <button type="button" class="primary kuiper-time-start" id="kuiperTimerStart" data-i18n="startTimer"></button>
          </div>
        </div>
        <div class="kuiper-time-pane" data-pane="manual" hidden>
          <input type="text" id="kuiperManualLabel" class="kuiper-time-field" data-i18n-placeholder="timeLabelOptional">
          <div class="kuiper-time-manual-dt">
            <div class="kuiper-time-dt-row">
              <span class="kuiper-time-dt-lbl" data-i18n="timeManualDate"></span>
              <button type="button" class="kuiper-dt-trigger" id="kuiperManualDateBtn" data-placeholder="—">
                <span class="kuiper-dt-trigger-val"></span>
              </button>
              <input type="hidden" id="kuiperManualDate">
            </div>
            <div class="kuiper-time-dt-row">
              <span class="kuiper-time-dt-lbl" data-i18n="timeManualStart"></span>
              <div class="kuiper-dt-combo">
                <input type="text" class="kuiper-dt-input" id="kuiperManualStart" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="09:00">
                <button type="button" class="icon sm kuiper-dt-picker-btn" id="kuiperManualStartBtn" aria-label="Start time">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 5v3.5l2 1.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                </button>
              </div>
            </div>
            <div class="kuiper-time-dt-row">
              <span class="kuiper-time-dt-lbl" data-i18n="timeManualEnd"></span>
              <div class="kuiper-dt-combo">
                <input type="text" class="kuiper-dt-input" id="kuiperManualEnd" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="10:00">
                <button type="button" class="icon sm kuiper-dt-picker-btn" id="kuiperManualEndBtn" aria-label="End time">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 5v3.5l2 1.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
                </button>
              </div>
            </div>
          </div>
          <button type="button" class="primary kuiper-time-add" id="kuiperManualAdd" data-i18n="addTime"></button>
        </div>
        </div>
        </div>
      </div>`;
    aside.append(extras);

    let stack = stackParent.querySelector('.kuiper-issue-main-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'kuiper-issue-main-stack';
      stackParent.insertBefore(stack, notesWrap);
      stack.append(notesWrap);
    }

    const linked = document.createElement('section');
    linked.id = 'kuiperLinkedSection';
    linked.className = 'kuiper-linked';
    linked.innerHTML = `
      <header class="kuiper-linked-head">
        <button type="button" class="kuiper-linked-toggle" id="kuiperLinkedToggle" aria-expanded="true">
          <span class="kuiper-linked-chev" aria-hidden="true"></span>
          <span data-i18n="linkedActivities"></span>
        </button>
        <button type="button" class="icon sm kuiper-linked-add" id="kuiperLinkedAddBtn" title="">+</button>
      </header>
      <div class="kuiper-linked-body" id="kuiperLinkedBody">
        <div class="kuiper-linked-groups" id="kuiperLinkedGroups"></div>
        <div class="kuiper-linked-compose" id="kuiperLinkedCompose" hidden>
          <select id="kuiperLinkKind" class="kuiper-linked-kindsel" aria-label="">
            <option value="blocks" data-i18n="linkKindBlocks"></option>
            <option value="blockedBy" data-i18n="linkKindBlockedBy"></option>
            <option value="related" data-i18n="linkKindRelated"></option>
          </select>
          <input type="text" id="kuiperLinkInput" class="kuiper-linked-input" list="kuiperCardPicker" autocomplete="off" spellcheck="false">
          <button type="button" class="ghost sm" id="kuiperLinkConfirm" data-i18n="add"></button>
        </div>
      </div>
      <datalist id="kuiperCardPicker"></datalist>`;
    stack.append(linked);

    const tabs = document.createElement('div');
    tabs.id = 'kuiperIssueTabs';
    tabs.className = 'kuiper-issue-tabs';
    tabs.innerHTML = `
      <div class="seg kuiper-issue-tabbar" role="tablist">
        <button type="button" class="kuiper-issue-tab" data-tab="comments" role="tab" aria-pressed="true" data-i18n="tabComments"></button>
        <button type="button" class="kuiper-issue-tab" data-tab="time" role="tab" aria-pressed="false" data-i18n="tabTimeLog"></button>
        <button type="button" class="kuiper-issue-tab" data-tab="history" role="tab" aria-pressed="false" data-i18n="tabHistory"></button>
      </div>
      <div class="kuiper-issue-tabpanels">
        <section class="kuiper-issue-panel active" data-panel="comments" role="tabpanel">
          <div class="kuiper-comments-shell">
            <form class="kuiper-comment-form" id="kuiperCommentForm">
              <textarea id="kuiperCommentInput" rows="3" placeholder=""></textarea>
              <button type="submit" class="primary sm" data-i18n="addComment"></button>
            </form>
            <div class="kuiper-comment-list-scroll kuiper-scroll">
              <div class="kuiper-comment-list" id="kuiperCommentList"></div>
            </div>
          </div>
        </section>
        <section class="kuiper-issue-panel" data-panel="time" role="tabpanel" hidden>
          <div class="kuiper-issue-scroll kuiper-scroll">
            <div class="kuiper-time-log-list" id="kuiperTimeLogList"></div>
          </div>
        </section>
        <section class="kuiper-issue-panel" data-panel="history" role="tabpanel" hidden>
          <div class="kuiper-issue-scroll kuiper-scroll">
            <div class="kuiper-history-list" id="kuiperHistoryList"></div>
          </div>
        </section>
      </div>`;
    stack.append(tabs);

    const tagInput = document.getElementById('kuiperTagInput');
    tagInput?.addEventListener('keydown', onTagKeydown);
    tagInput?.addEventListener('input', onTagInput);
    tagInput?.addEventListener('focus', onTagInput);
    tagInput?.addEventListener('blur', () => {
      setTimeout(() => document.getElementById('kuiperTagSuggest')?.setAttribute('hidden', ''), 120);
    });
    document.getElementById('kuiperEstimateInput')?.addEventListener('change', onEstimateChange);
    document.getElementById('kuiperManualAdd')?.addEventListener('click', logManualTime);
    document.getElementById('kuiperTimerStart')?.addEventListener('click', startTimer);
    document.getElementById('kuiperTimerStop')?.addEventListener('click', stopTimer);
    document.getElementById('kuiperTimerDiscard')?.addEventListener('click', discardTimer);
    document.getElementById('kuiperCommentForm')?.addEventListener('submit', submitComment);
    document.getElementById('kuiperCommentList')?.addEventListener('click', onCommentListClick);
    document.getElementById('kuiperCommentList')?.addEventListener('keydown', onCommentEditKeydown);
    document.getElementById('kuiperTimeLogList')?.addEventListener('click', onTimeLogListClick);
    document.getElementById('kuiperLinkedToggle')?.addEventListener('click', () => {
      linkedOpen = !linkedOpen;
      document.getElementById('kuiperLinkedBody')?.toggleAttribute('hidden', !linkedOpen);
      document.getElementById('kuiperLinkedToggle')?.setAttribute('aria-expanded', String(linkedOpen));
      document.getElementById('kuiperLinkedToggle')?.classList.toggle('collapsed', !linkedOpen);
    });
    document.getElementById('kuiperLinkedAddBtn')?.addEventListener('click', () => {
      const compose = document.getElementById('kuiperLinkedCompose');
      compose?.removeAttribute('hidden');
      document.getElementById('kuiperLinkInput')?.focus();
    });
    document.getElementById('kuiperLinkConfirm')?.addEventListener('click', () => {
      addLink(document.getElementById('kuiperLinkKind')?.value || 'blocks');
    });
    document.getElementById('kuiperLinkInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addLink(document.getElementById('kuiperLinkKind')?.value || 'blocks');
      }
    });
    document.querySelectorAll('.kuiper-time-modebar button[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => setTimeMode(btn.dataset.mode));
    });
    if (typeof KuiperDateTimePicker !== 'undefined') {
      KuiperDateTimePicker.init({ tr, locale: () => ctx.locale?.() || 'es' });
    }
    tabs.querySelectorAll('.kuiper-issue-tab').forEach(btn => {
      btn.addEventListener('click', () => setTab(btn.dataset.tab));
    });
  }

  function resolveCardRef(raw) {
    const q = String(raw || '').trim();
    if (!q) return null;
    const tasks = boardTasks();
    const byId = tasks.find(t => t.id.toLowerCase() === q.toLowerCase());
    if (byId) return byId.id;
    const byTitle = tasks.find(t => t.title.toLowerCase() === q.toLowerCase());
    if (byTitle) return byTitle.id;
    const partial = tasks.find(t => t.title.toLowerCase().includes(q.toLowerCase()) || t.id.toLowerCase().includes(q.toLowerCase()));
    return partial?.id || null;
  }

  async function persistTags(names) {
    if (!currentCardId || currentCardId === 'new') return;
    await KuiperStore.patchCard(currentCardId, { tags: names });
    await reloadDetail();
    ctx.refreshBoard?.();
  }

  function parseDurationText(text) {
    return (typeof BoardCore !== 'undefined' && BoardCore.parseDuration)
      ? BoardCore.parseDuration(text)
      : null;
  }

  function formatDurationShort(mins) {
    return (typeof BoardCore !== 'undefined' && BoardCore.formatDurationShort)
      ? BoardCore.formatDurationShort(mins)
      : formatMinutes(mins);
  }

  function localYmd(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  async function onEstimateChange() {
    if (!currentCardId || currentCardId === 'new') return;
    const input = document.getElementById('kuiperEstimateInput');
    const raw = input?.value?.trim() || '';
    let minutes = null;
    if (raw) {
      const parsed = parseDurationText(raw);
      if (parsed === null) {
        renderEstimate();
        return;
      }
      minutes = parsed;
    }
    await KuiperStore.patchCard(currentCardId, { estimated_minutes: minutes });
    await reloadDetail();
    ctx.refreshBoard?.();
  }

  function onTagKeydown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const first = document.querySelector('#kuiperTagSuggest .kuiper-tag-suggest-item');
      if (first) { e.preventDefault(); first.focus(); }
      return;
    }
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const input = e.target;
    const name = input.value.replace(/,/g, '').trim();
    if (!name) return;
    addTagName(name);
    input.value = '';
    hideTagSuggest();
  }

  function addTagName(name) {
    const tags = [...(detail?.tags || []).map(t => t.name), name];
    persistTags([...new Set(tags)]);
  }

  function hideTagSuggest() {
    document.getElementById('kuiperTagSuggest')?.setAttribute('hidden', '');
  }

  function onTagInput() {
    const input = document.getElementById('kuiperTagInput');
    const box = document.getElementById('kuiperTagSuggest');
    if (!input || !box) return;
    const q = input.value.replace(/,/g, '').trim().toLowerCase();
    const current = (detail?.tags || []).map(t => t.name);
    const matches = boardTagNames()
      .filter(n => !current.includes(n))
      .filter(n => !q || n.toLowerCase().includes(q))
      .slice(0, 8);
    if (!matches.length) {
      hideTagSuggest();
      return;
    }
    box.innerHTML = matches.map(name => {
      const c = tagColor(name);
      return `<button type="button" class="kuiper-tag-suggest-item" data-name="${esc(name)}" style="--c:${esc(c)}">${esc(name)}</button>`;
    }).join('');
    box.removeAttribute('hidden');
    box.querySelectorAll('.kuiper-tag-suggest-item').forEach(btn => {
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        addTagName(btn.dataset.name);
        input.value = '';
        hideTagSuggest();
      });
    });
  }

  async function addLink(kind) {
    const map = {
      blockedBy: { from: 'other', to: 'self', type: 'blocks', label: 'linkKindBlockedBy' },
      blocks: { from: 'self', to: 'other', type: 'blocks', label: 'linkKindBlocks' },
      related: { from: 'self', to: 'other', type: 'relates', label: 'linkKindRelated' },
    };
    const cfg = map[kind] || map.blocks;
    const otherId = resolveCardRef(document.getElementById('kuiperLinkInput')?.value);
    if (!otherId || otherId === currentCardId) return;
    const body = cfg.from === 'self'
      ? { to_card_id: otherId, link_type: cfg.type }
      : { from_card_id: otherId, to_card_id: currentCardId, link_type: cfg.type };
    await KuiperStore.addCardLink(currentCardId, body);
    const input = document.getElementById('kuiperLinkInput');
    if (input) input.value = '';
    document.getElementById('kuiperLinkedCompose')?.setAttribute('hidden', '');
    await reloadDetail();
    ctx.refreshBoard?.();
  }

  function setTimeMode(mode) {
    timeMode = mode;
    document.querySelectorAll('.kuiper-time-modebar button[data-mode]').forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
    });
    document.querySelectorAll('.kuiper-time-pane').forEach(pane => {
      const on = pane.dataset.pane === mode;
      pane.hidden = !on;
    });
    if (mode === 'manual') ensureManualDefaults();
  }

  async function removeLink(linkId) {
    await KuiperStore.removeCardLink(currentCardId, linkId);
    await reloadDetail();
    ctx.refreshBoard?.();
  }

  async function logManualTime() {
    if (!currentCardId || currentCardId === 'new') return;
    ensureManualDefaults();
    const date = document.getElementById('kuiperManualDate')?.value;
    const startEl = document.getElementById('kuiperManualStart');
    const endEl = document.getElementById('kuiperManualEnd');
    startEl?.blur();
    endEl?.blur();
    const norm = v => (KuiperDateTimePicker?.normalizeTimeInput?.(v) || v || '').trim();
    let startTime = norm(startEl?.value);
    let endTime = norm(endEl?.value);
    if (startTime && !endTime && KuiperDateTimePicker?.addMinutesToHm) {
      endTime = KuiperDateTimePicker.addMinutesToHm(startTime, 60);
      if (endEl) endEl.value = endTime;
    }
    const label = document.getElementById('kuiperManualLabel')?.value?.trim() || '';
    if (!date || !startTime || !endTime) return;
    const started_at = new Date(`${date}T${startTime}:00`).toISOString();
    const ended_at = new Date(`${date}T${endTime}:00`).toISOString();
    if (!Number.isFinite(Date.parse(started_at)) || !Number.isFinite(Date.parse(ended_at))) return;
    if (Date.parse(ended_at) <= Date.parse(started_at)) return;
    try {
      await KuiperStore.addTimeEntry(currentCardId, { started_at, ended_at, label });
    } catch {
      return;
    }
    document.getElementById('kuiperManualLabel').value = '';
    if (endEl) endEl.value = '';
    if (startEl && endTime) {
      startEl.value = endTime;
      startEl.dataset.lastValid = endTime;
    }
    if (endEl && startEl?.value && KuiperDateTimePicker?.addMinutesToHm) {
      endEl.value = KuiperDateTimePicker.addMinutesToHm(startEl.value, 60);
      endEl.dataset.lastValid = norm(endEl.value);
    }
    await reloadDetail();
    ctx.refreshBoard?.();
  }

  async function startTimer() {
    const label = document.getElementById('kuiperTimerLabel')?.value?.trim() || '';
    await KuiperStore.addTimeEntry(currentCardId, { action: 'start_timer', label });
    await reloadDetail();
    ctx.refreshBoard?.();
  }

  async function stopTimer() {
    const id = detail?.activeTimer?.id;
    if (!id) return;
    const label = document.getElementById('kuiperTimerLabel')?.value?.trim() || '';
    await KuiperStore.stopTimer(currentCardId, id, { label });
    await reloadDetail();
    ctx.refreshBoard?.();
  }

  async function discardTimer() {
    const id = detail?.activeTimer?.id;
    if (!id) return;
    await KuiperStore.discardTimer(currentCardId, id);
    const labelInput = document.getElementById('kuiperTimerLabel');
    if (labelInput) labelInput.value = '';
    await reloadDetail();
    ctx.refreshBoard?.();
  }

  async function submitComment(e) {
    e.preventDefault();
    const input = document.getElementById('kuiperCommentInput');
    const body = input?.value?.trim();
    if (!body) return;
    await KuiperStore.addComment(currentCardId, body);
    input.value = '';
    await reloadDetail();
  }

  function onCommentListClick(e) {
    const btn = e.target.closest('[data-comment-act]');
    if (!btn) return;
    const item = btn.closest('[data-comment-id]');
    const commentId = item?.dataset.commentId;
    if (!commentId) return;
    if (btn.dataset.commentAct === 'edit') {
      editingCommentId = commentId;
      renderComments();
      const ta = document.querySelector(`#kuiperCommentList [data-comment-id="${CSS.escape(commentId)}"] .kuiper-comment-edit-input`);
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
      return;
    }
    if (btn.dataset.commentAct === 'cancel') {
      editingCommentId = null;
      renderComments();
      return;
    }
    if (btn.dataset.commentAct === 'save') {
      e.preventDefault();
      saveCommentEdit(commentId, item);
    }
  }

  function onCommentEditKeydown(e) {
    if (!e.target.classList.contains('kuiper-comment-edit-input')) return;
    if (e.key === 'Escape') {
      editingCommentId = null;
      renderComments();
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const item = e.target.closest('[data-comment-id]');
      const commentId = item?.dataset.commentId;
      if (commentId) saveCommentEdit(commentId, item);
    }
  }

  function timeEntryDomSuffix(entryId) {
    return String(entryId || '').replace(/[^\w-]/g, '');
  }

  function isoToLocalHm(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function mountTimeEntryEditFields(entryId) {
    if (typeof KuiperDateTimePicker === 'undefined') return;
    KuiperDateTimePicker.mountTimeEntryEdit(entryId);
  }

  function readTimeEntryEditValues(entryId) {
    const sid = timeEntryDomSuffix(entryId);
    const date = document.getElementById(`kuiperTimeEditDate-${sid}`)?.value;
    const startEl = document.getElementById(`kuiperTimeEditStart-${sid}`);
    const endEl = document.getElementById(`kuiperTimeEditEnd-${sid}`);
    startEl?.blur();
    endEl?.blur();
    const norm = v => (KuiperDateTimePicker?.normalizeTimeInput?.(v) || v || '').trim();
    const startTime = norm(startEl?.value);
    const endTime = norm(endEl?.value);
    const label = document.getElementById(`kuiperTimeEditLabel-${sid}`)?.value?.trim() || '';
    return { date, startTime, endTime, label };
  }

  function timeEntryEditIsoRange(entryId) {
    const { date, startTime, endTime, label } = readTimeEntryEditValues(entryId);
    if (!date || !startTime || !endTime) return null;
    const started_at = new Date(`${date}T${startTime}:00`);
    let ended_at = new Date(`${date}T${endTime}:00`);
    if (Number.isNaN(started_at.getTime()) || Number.isNaN(ended_at.getTime())) return null;
    if (ended_at <= started_at) ended_at.setDate(ended_at.getDate() + 1);
    return { started_at: started_at.toISOString(), ended_at: ended_at.toISOString(), label };
  }

  function onTimeLogListClick(e) {
    const btn = e.target.closest('[data-time-act]');
    if (!btn) return;
    const item = btn.closest('[data-time-entry-id]');
    const entryId = item?.dataset.timeEntryId;
    if (!entryId) return;
    if (btn.dataset.timeAct === 'edit') {
      editingTimeEntryId = entryId;
      renderTimeLog();
      mountTimeEntryEditFields(entryId);
      document.getElementById(`kuiperTimeEditStart-${timeEntryDomSuffix(entryId)}`)?.focus();
      return;
    }
    if (btn.dataset.timeAct === 'cancel') {
      editingTimeEntryId = null;
      renderTimeLog();
      return;
    }
    if (btn.dataset.timeAct === 'save') {
      e.preventDefault();
      saveTimeEntryEdit(entryId, item);
      return;
    }
    if (btn.dataset.timeAct === 'delete') {
      e.preventDefault();
      deleteTimeEntry(entryId);
    }
  }

  async function saveTimeEntryEdit(entryId, itemEl) {
    const item = itemEl || document.querySelector(`#kuiperTimeLogList [data-time-entry-id="${CSS.escape(entryId)}"]`);
    const saveBtn = item?.querySelector('[data-time-act="save"]');
    const payload = timeEntryEditIsoRange(entryId);
    if (!payload) return;
    if (saveBtn) saveBtn.disabled = true;
    try {
      await KuiperStore.updateTimeEntry(currentCardId, entryId, payload);
      editingTimeEntryId = null;
      await reloadDetail();
      ctx.refreshBoard?.();
    } catch (err) {
      console.warn('time entry update failed', err);
      ctx.toast?.(tr('timeEntrySaveFailed'));
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function deleteTimeEntry(entryId) {
    try {
      await KuiperStore.deleteTimeEntry(currentCardId, entryId);
      if (String(editingTimeEntryId) === String(entryId)) editingTimeEntryId = null;
      await reloadDetail();
      ctx.refreshBoard?.();
    } catch (err) {
      console.warn('time entry delete failed', err);
      ctx.toast?.(tr('timeEntryDeleteFailed'));
    }
  }

  async function saveCommentEdit(commentId, itemEl) {
    const item = itemEl || document.querySelector(`#kuiperCommentList [data-comment-id="${CSS.escape(commentId)}"]`);
    const input = item?.querySelector('.kuiper-comment-edit-input');
    const saveBtn = item?.querySelector('[data-comment-act="save"]');
    const body = input?.value?.trim();
    if (!body) return;
    if (saveBtn) saveBtn.disabled = true;
    try {
      await KuiperStore.updateComment(currentCardId, commentId, body);
      editingCommentId = null;
      await reloadDetail();
    } catch (err) {
      console.warn('comment update failed', err);
      ctx.toast?.(tr('commentSaveFailed'));
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function setTab(name) {
    activeTab = name;
    document.querySelectorAll('.kuiper-issue-tab').forEach(btn => {
      const on = btn.dataset.tab === name;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    document.querySelectorAll('.kuiper-issue-panel').forEach(panel => {
      const on = panel.dataset.panel === name;
      panel.classList.toggle('active', on);
      panel.hidden = !on;
    });
  }

  function linkRowHtml(kind, item) {
    const meta = taskMeta(item.id);
    const doneCls = meta.done ? ' done' : '';
    return `
      <div class="kuiper-linked-row">
        <span class="kuiper-linked-status${doneCls}" aria-hidden="true"></span>
        <button type="button" class="kuiper-linked-open" data-card-id="${esc(item.id)}">
          <span class="kuiper-linked-id">${esc(item.id)}</span>
          <span class="kuiper-linked-title">${esc(item.title)}</span>
        </button>
        ${meta.stage ? `<span class="kuiper-linked-stage">${esc(meta.stage)}</span>` : ''}
        <button type="button" class="icon sm kuiper-linked-remove" data-link-id="${esc(item.linkId)}" data-kind="${esc(kind)}" title="${esc(tr('remove'))}">×</button>
      </div>`;
  }

  function renderLinked() {
    const el = document.getElementById('kuiperLinkedGroups');
    if (!el) return;
    const groups = [
      { kind: 'blockedBy', label: 'linkKindBlockedBy', items: (detail?.links?.blockedBy || []).map(normalizeLink) },
      { kind: 'blocks', label: 'linkKindBlocks', items: (detail?.links?.blocks || []).map(normalizeLink) },
      { kind: 'related', label: 'linkKindRelated', items: (detail?.links?.related || []).map(normalizeLink) },
    ].filter(g => g.items.length);
    if (!groups.length) {
      el.innerHTML = `<p class="kuiper-linked-empty">${esc(tr('none'))}</p>`;
    } else {
      el.innerHTML = groups.map(g => `
        <div class="kuiper-linked-group">
          <div class="kuiper-linked-kindlbl">${esc(tr(g.label))}</div>
          ${g.items.map(item => linkRowHtml(g.kind, item)).join('')}
        </div>`).join('');
    }
    el.querySelectorAll('.kuiper-linked-open').forEach(btn => {
      btn.onclick = () => ctx.openCard?.(btn.dataset.cardId);
    });
    el.querySelectorAll('.kuiper-linked-remove').forEach(btn => {
      btn.onclick = () => removeLink(btn.dataset.linkId);
    });
    const kindSel = document.getElementById('kuiperLinkKind');
    if (kindSel) {
      kindSel.querySelectorAll('option[data-i18n]').forEach(opt => {
        opt.textContent = tr(opt.dataset.i18n);
      });
    }
    const addBtn = document.getElementById('kuiperLinkedAddBtn');
    if (addBtn) addBtn.title = tr('add');
  }

  function renderTags() {
    const chips = document.getElementById('kuiperTagChips');
    const names = (detail?.tags || []).map(t => t.name);
    if (chips) {
      chips.innerHTML = names.map(name => {
        const c = tagColor(name);
        return `
        <span class="kuiper-tag-chip" style="--c:${esc(c)}">
          <span>${esc(name)}</span>
          <button type="button" class="kuiper-tag-remove" data-name="${esc(name)}" aria-label="${esc(tr('remove'))}">×</button>
        </span>`;
      }).join('');
      chips.querySelectorAll('.kuiper-tag-remove').forEach(btn => {
        btn.onclick = () => persistTags(names.filter(n => n !== btn.dataset.name));
      });
    }
  }

  function renderEstimate() {
    const input = document.getElementById('kuiperEstimateInput');
    if (!input || document.activeElement === input) return;
    const mins = detail?.card?.estimated_minutes;
    input.value = mins != null && mins > 0 ? formatDurationShort(mins) : '';
  }

  function renderCardPicker() {
    const list = document.getElementById('kuiperCardPicker');
    if (!list) return;
    list.innerHTML = boardTasks()
      .filter(t => t.id !== currentCardId)
      .map(t => `<option value="${esc(t.id)}">${esc(t.id)} — ${esc(t.title)}</option>`)
      .join('');
  }

  function timerElapsedMs() {
    const started = detail?.activeTimer?.started_at;
    if (!started) return 0;
    return Math.max(0, Date.now() - Date.parse(started));
  }

  function moveEstimateIntoTimeTracker() {
    const tracker = document.getElementById('kuiperTimeTracker');
    if (!tracker) return;
    let estimateWrap = document.getElementById('kuiperEdEstimateField');
    const progress = document.getElementById('kuiperTimeProgress');
    const modebar = tracker.querySelector('.kuiper-time-modebar');
    if (!modebar) return;

    if (estimateWrap && !tracker.contains(estimateWrap)) {
      const field = estimateWrap.closest('.kuiper-ed-field') || estimateWrap;
      const inner = document.createElement('div');
      inner.className = 'kuiper-time-estimate';
      inner.id = 'kuiperEdEstimateField';
      inner.innerHTML = field.innerHTML;
      field.remove();
      estimateWrap = inner;
    } else if (estimateWrap && estimateWrap.classList.contains('kuiper-ed-field')) {
      const inner = document.createElement('div');
      inner.className = 'kuiper-time-estimate';
      inner.id = 'kuiperEdEstimateField';
      inner.innerHTML = estimateWrap.innerHTML;
      estimateWrap.replaceWith(inner);
      estimateWrap = inner;
    }

    if (estimateWrap && !estimateWrap.classList.contains('kuiper-time-estimate')) {
      estimateWrap.classList.add('kuiper-time-estimate');
      const lbl = estimateWrap.querySelector('.kuiper-ed-lbl');
      if (lbl) lbl.classList.replace('kuiper-ed-lbl', 'kuiper-time-dt-lbl');
    }

    const summary = document.getElementById('kuiperTimeSummary');
    if (estimateWrap) {
      const anchor = summary || progress || modebar.closest('.kuiper-time-controls') || modebar;
      if (estimateWrap.nextElementSibling !== anchor && estimateWrap !== anchor.previousElementSibling) {
        anchor.before(estimateWrap);
      }
    }

    let controls = tracker.querySelector('.kuiper-time-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'kuiper-time-controls';
      modebar.before(controls);
      controls.append(modebar);
      tracker.querySelectorAll('.kuiper-time-pane').forEach(pane => controls.append(pane));
    }
  }

  function upgradeManualLayout() {
    const pane = document.querySelector('.kuiper-time-pane[data-pane="manual"]');
    if (!pane) return;
    const oldGrid = pane.querySelector('.kuiper-time-manual-grid');
    if (oldGrid) {
      const wrap = document.createElement('div');
      wrap.className = 'kuiper-time-manual-dt';
      wrap.innerHTML = `
        <div class="kuiper-time-dt-row">
          <span class="kuiper-time-dt-lbl" data-i18n="timeManualDate">${esc(tr('timeManualDate'))}</span>
          <button type="button" class="kuiper-dt-trigger" id="kuiperManualDateBtn" data-placeholder="—"><span class="kuiper-dt-trigger-val"></span></button>
          <input type="hidden" id="kuiperManualDate">
        </div>
        <div class="kuiper-time-dt-row">
          <span class="kuiper-time-dt-lbl" data-i18n="timeManualStart">${esc(tr('timeManualStart'))}</span>
          <div class="kuiper-dt-combo">
            <input type="text" class="kuiper-dt-input" id="kuiperManualStart" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="09:00">
            <button type="button" class="icon sm kuiper-dt-picker-btn" id="kuiperManualStartBtn" aria-label="${esc(tr('timeManualStart'))}">
              <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 5v3.5l2 1.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>
        <div class="kuiper-time-dt-row">
          <span class="kuiper-time-dt-lbl" data-i18n="timeManualEnd">${esc(tr('timeManualEnd'))}</span>
          <div class="kuiper-dt-combo">
            <input type="text" class="kuiper-dt-input" id="kuiperManualEnd" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="10:00">
            <button type="button" class="icon sm kuiper-dt-picker-btn" id="kuiperManualEndBtn" aria-label="${esc(tr('timeManualEnd'))}">
              <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 5v3.5l2 1.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>`;
      oldGrid.replaceWith(wrap);
    }
    if (typeof KuiperDateTimePicker !== 'undefined') {
      KuiperDateTimePicker.upgradeManualDom();
    }
  }

  function ensureManualDefaults() {
    if (typeof KuiperDateTimePicker !== 'undefined') {
      KuiperDateTimePicker.mountManualFields();
      KuiperDateTimePicker.setDefaults({ date: localYmd() });
      return;
    }
    const dateInput = document.getElementById('kuiperManualDate');
    if (dateInput && !dateInput.value) dateInput.value = localYmd();
  }

  function loggedMinutesLive() {
    const closed = (detail?.timeEntries || [])
      .filter(e => e.ended_at)
      .reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
    if (detail?.activeTimer?.started_at) {
      return closed + Math.floor(timerElapsedMs() / 60000);
    }
    return detail?.timeLoggedMinutes ?? closed;
  }

  function renderTimeProgress() {
    const bar = document.getElementById('kuiperTimeProgress');
    const green = document.getElementById('kuiperTimeProgressGreen');
    const red = document.getElementById('kuiperTimeProgressRed');
    if (!bar || !green || !red) return;
    const est = detail?.card?.estimated_minutes;
    const logged = loggedMinutesLive();
    if (!est || est <= 0) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    let greenPct = 0;
    let redPct = 0;
    if (logged <= est) {
      greenPct = Math.min(100, (logged / est) * 100);
    } else {
      greenPct = (est / logged) * 100;
      redPct = 100 - greenPct;
    }
    green.style.width = `${greenPct}%`;
    red.style.width = `${redPct}%`;
  }

  function formatTimeRange(startIso, endIso) {
    if (!startIso || !endIso) return formatWhen(endIso || startIso);
    const start = new Date(startIso);
    const end = new Date(endIso);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return formatWhen(endIso || startIso);
    }
    const loc = ctx.locale?.() || 'es';
    const locale = loc === 'es' ? 'es-ES' : 'en-GB';
    const sameDay = localYmd(start) === localYmd(end);
    const dateFmt = { day: 'numeric', month: 'short' };
    const timeFmt = { hour: '2-digit', minute: '2-digit' };
    if (sameDay) {
      const day = start.toLocaleDateString(locale, dateFmt);
      const from = start.toLocaleTimeString(locale, timeFmt);
      const to = end.toLocaleTimeString(locale, timeFmt);
      return `${day} · ${from}–${to}`;
    }
    return `${start.toLocaleString(locale, { ...dateFmt, ...timeFmt })} – ${end.toLocaleString(locale, { ...dateFmt, ...timeFmt })}`;
  }

  function tickTimerDisplay() {
    const elapsedEl = document.getElementById('kuiperTimeElapsed');
    if (detail?.activeTimer && elapsedEl) {
      elapsedEl.textContent = formatDurationHMS(timerElapsedMs() / 1000);
    }
    renderTimeProgress();
  }

  function upgradeTimerLayout() {
    const pane = document.querySelector('.kuiper-time-pane[data-pane="timer"]');
    const running = document.getElementById('kuiperTimeRunning');
    const idle = document.getElementById('kuiperTimeIdle');
    const label = document.getElementById('kuiperTimerLabel');
    const stop = document.getElementById('kuiperTimerStop');
    if (!pane || !running || !idle || !label) return;
    upgradeManualLayout();
    moveEstimateIntoTimeTracker();
    const estimateInput = document.getElementById('kuiperEstimateInput');
    if (estimateInput && estimateInput.type === 'number') {
      estimateInput.type = 'text';
      estimateInput.removeAttribute('min');
      estimateInput.removeAttribute('step');
      estimateInput.dataset.i18nPlaceholder = 'estimatePlaceholder';
      estimateInput.placeholder = tr('estimatePlaceholder');
      estimateInput.closest('.kuiper-estimate-row')
        ?.querySelector('.kuiper-estimate-unit')
        ?.remove();
    }
    const modebar = document.querySelector('.kuiper-time-modebar');
    if (modebar && !modebar.classList.contains('seg')) modebar.classList.add('seg');
    modebar?.querySelectorAll('button[data-mode]').forEach(btn => {
      if (!btn.hasAttribute('aria-pressed')) {
        btn.setAttribute('aria-pressed', String(btn.classList.contains('active') || btn.dataset.mode === timeMode));
      }
      btn.classList.remove('kuiper-time-mode', 'active');
    });
    if (!document.getElementById('kuiperTimeProgress')) {
      const summary = document.getElementById('kuiperTimeSummary');
      if (summary) {
        const progress = document.createElement('div');
        progress.className = 'kuiper-time-progress';
        progress.id = 'kuiperTimeProgress';
        progress.hidden = true;
        progress.innerHTML = `
          <div class="kuiper-time-progress-track">
            <div class="kuiper-time-progress-green" id="kuiperTimeProgressGreen"></div>
            <div class="kuiper-time-progress-red" id="kuiperTimeProgressRed"></div>
          </div>`;
        summary.after(progress);
      }
    }
    const runningDisplay = running.querySelector('.kuiper-time-display');
    if (runningDisplay && !running.querySelector('.kuiper-time-seg')) {
      const seg = document.createElement('div');
      seg.className = 'seg kuiper-time-seg';
      runningDisplay.replaceWith(seg);
      const val = document.createElement('span');
      val.className = 'kuiper-time-clock-val running';
      val.id = 'kuiperTimeElapsed';
      val.textContent = '00:00:00';
      seg.append(val);
    }
    const idleDisplay = idle.querySelector('.kuiper-time-display');
    if (idleDisplay && !idle.querySelector('.kuiper-time-seg')) {
      const seg = document.createElement('div');
      seg.className = 'seg kuiper-time-seg muted';
      idleDisplay.replaceWith(seg);
      const val = document.createElement('span');
      val.className = 'kuiper-time-clock-val';
      val.id = 'kuiperTimeIdleDisplay';
      val.textContent = '00:00:00';
      seg.append(val);
    }
    if (idle.contains(label)) {
      pane.insertBefore(label, running);
    }
    let actions = running.querySelector('.kuiper-time-actions');
    if (!actions && stop) {
      actions = document.createElement('div');
      actions.className = 'kuiper-time-actions';
      stop.replaceWith(actions);
      actions.append(stop);
    }
    let discard = document.getElementById('kuiperTimerDiscard');
    if (!discard && actions) {
      discard = document.createElement('button');
      discard.type = 'button';
      discard.className = 'kuiper-time-discard';
      discard.id = 'kuiperTimerDiscard';
      discard.innerHTML = `<span class="kuiper-time-discard-icon" aria-hidden="true">${DISCARD_ICON}</span><span data-i18n="discardTimer">${esc(tr('discardTimer'))}</span>`;
      discard.addEventListener('click', discardTimer);
      actions.append(discard);
    } else if (discard && !discard.querySelector('.kuiper-time-discard-icon')) {
      discard.innerHTML = `<span class="kuiper-time-discard-icon" aria-hidden="true">${DISCARD_ICON}</span><span data-i18n="discardTimer">${esc(tr('discardTimer'))}</span>`;
      if (actions && !actions.contains(discard)) {
        discard.remove();
        actions.append(discard);
      }
    }
  }

  function renderTimer() {
    upgradeTimerLayout();
    ensureManualDefaults();
    const running = document.getElementById('kuiperTimeRunning');
    const idle = document.getElementById('kuiperTimeIdle');
    const elapsedEl = document.getElementById('kuiperTimeElapsed');
    const labelInput = document.getElementById('kuiperTimerLabel');
    const active = detail?.activeTimer;
    if (running) running.hidden = !active;
    if (idle) idle.hidden = !!active;
    if (labelInput && active && document.activeElement !== labelInput) {
      labelInput.value = active.label || '';
    }
    if (active && elapsedEl) {
      elapsedEl.textContent = formatDurationHMS(timerElapsedMs() / 1000);
    }
    const summary = document.getElementById('kuiperTimeSummary');
    if (summary) {
      const logged = loggedMinutesLive();
      const est = detail?.card?.estimated_minutes;
      let text = `${tr('timeLogged')}: ${formatMinutes(logged)}`;
      if (est) text += ` · ${tr('estimatedShort')}: ${formatDurationShort(est)}`;
      summary.textContent = text;
    }
    renderTimeProgress();
    setTimeMode(timeMode);
  }

  function renderTimeLogView(entry, { actions = true } = {}) {
    const actionsHtml = actions ? `
          <div class="kuiper-time-log-actions">
            <button type="button" class="icon sm kuiper-time-log-act kuiper-time-log-act-edit" data-time-act="edit" title="${esc(tr('editComment'))}" aria-label="${esc(tr('editComment'))}">${EDIT_ICON}</button>
            <button type="button" class="icon sm kuiper-time-log-act kuiper-time-log-act-delete" data-time-act="delete" title="${esc(tr('deleteTimeEntry'))}" aria-label="${esc(tr('deleteTimeEntry'))}">${DISCARD_ICON}</button>
          </div>` : '';
    return `
      <div class="kuiper-time-log-view">
        <div class="kuiper-time-log-head">
          <div class="kuiper-time-log-meta">
            <strong>${esc(formatMinutes(entry.duration_minutes))}</strong>
            <span class="kuiper-time-log-when">${esc(formatTimeRange(entry.started_at, entry.ended_at))}</span>
          </div>
          ${actionsHtml}
        </div>
        ${entry.label ? `<p class="kuiper-time-log-label">${esc(entry.label)}</p>` : ''}
        <span class="kuiper-time-log-src">${esc(entry.source === 'timer' ? tr('sourceTimer') : tr('sourceManual'))}</span>
      </div>`;
  }

  function renderTimeLogEditForm(entry) {
    const sid = timeEntryDomSuffix(entry.id);
    const dateVal = entry.started_at ? localYmd(new Date(entry.started_at)) : localYmd();
    const startVal = isoToLocalHm(entry.started_at) || '09:00';
    const endVal = isoToLocalHm(entry.ended_at) || '10:00';
    const dateDisplay = KuiperDateTimePicker?.formatDateDisplay?.(dateVal) || dateVal;
    return `
      <div class="kuiper-time-log-edit-form">
        <div class="kuiper-time-log-edit-grid">
          <div class="kuiper-time-log-edit-col kuiper-time-log-edit-col-meta">
            <input type="text" class="kuiper-time-field kuiper-time-log-edit-label" id="kuiperTimeEditLabel-${sid}" placeholder="${esc(tr('timeLabelOptional'))}" value="${esc(entry.label || '')}">
            <button type="button" class="kuiper-dt-trigger kuiper-time-log-edit-date" id="kuiperTimeEditDateBtn-${sid}" aria-label="${esc(tr('timeManualDate'))}" data-placeholder="—"><span class="kuiper-dt-trigger-val">${esc(dateDisplay)}</span></button>
            <input type="hidden" id="kuiperTimeEditDate-${sid}" value="${esc(dateVal)}">
          </div>
          <div class="kuiper-time-log-edit-col kuiper-time-log-edit-col-times">
            <div class="kuiper-dt-combo kuiper-time-log-edit-time">
              <input type="text" class="kuiper-dt-input" id="kuiperTimeEditStart-${sid}" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="09:00" value="${esc(startVal)}" aria-label="${esc(tr('timeManualStart'))}">
              <button type="button" class="icon sm kuiper-dt-picker-btn" id="kuiperTimeEditStartBtn-${sid}" aria-label="${esc(tr('timeManualStart'))}">${TIME_CLOCK_ICON}</button>
            </div>
            <div class="kuiper-dt-combo kuiper-time-log-edit-time">
              <input type="text" class="kuiper-dt-input" id="kuiperTimeEditEnd-${sid}" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="10:00" value="${esc(endVal)}" aria-label="${esc(tr('timeManualEnd'))}">
              <button type="button" class="icon sm kuiper-dt-picker-btn" id="kuiperTimeEditEndBtn-${sid}" aria-label="${esc(tr('timeManualEnd'))}">${TIME_CLOCK_ICON}</button>
            </div>
          </div>
          <div class="kuiper-time-log-edit-col kuiper-time-log-edit-col-actions">
            <button type="button" class="ghost sm" data-time-act="cancel">${esc(tr('cancel'))}</button>
            <button type="button" class="primary sm" data-time-act="save">${esc(tr('save'))}</button>
          </div>
        </div>
      </div>`;
  }

  function renderTimeLogItem(entry) {
    if (!entry.ended_at) {
      return `
      <article class="kuiper-time-log-item is-active" data-time-entry-id="${esc(entry.id)}">
        <div class="kuiper-time-log-head">
          <strong>${esc(formatMinutes(entry.duration_minutes))}</strong>
          <span class="kuiper-time-log-when">${esc(formatTimeRange(entry.started_at, entry.ended_at))}</span>
        </div>
        ${entry.label ? `<p class="kuiper-time-log-label">${esc(entry.label)}</p>` : ''}
        <span class="kuiper-time-log-src">${esc(entry.source === 'timer' ? tr('sourceTimer') : tr('sourceManual'))}</span>
      </article>`;
    }
    if (String(editingTimeEntryId) === String(entry.id)) {
      return `
      <article class="kuiper-time-log-item is-editing" data-time-entry-id="${esc(entry.id)}">
        <div class="kuiper-time-log-edit-layout">
          ${renderTimeLogView(entry, { actions: false })}
          ${renderTimeLogEditForm(entry)}
        </div>
      </article>`;
    }
    return `
      <article class="kuiper-time-log-item" data-time-entry-id="${esc(entry.id)}">
        ${renderTimeLogView(entry)}
      </article>`;
  }

  function renderTimeLog() {
    const el = document.getElementById('kuiperTimeLogList');
    if (!el) return;
    const entries = detail?.timeEntries || [];
    if (!entries.length) {
      el.innerHTML = `<p class="kuiper-panel-empty">${esc(tr('noTimeEntries'))}</p>`;
      return;
    }
    el.innerHTML = entries.map(renderTimeLogItem).join('');
    if (editingTimeEntryId) mountTimeEntryEditFields(editingTimeEntryId);
  }

  function eventSummary(ev) {
    const p = ev.payload || {};
    switch (ev.event_type) {
      case 'created': return tr('histCreated');
      case 'moved': return tr('histMoved');
      case 'archived': return tr('histArchived');
      case 'restored': return tr('histRestored');
      case 'updated':
        if (p.title != null) return tr('histTitleChanged');
        if (p.notes != null) return tr('histNotesChanged');
        if (p.priority != null) return tr('histPriorityChanged');
        if (p.project_id != null) return tr('histProjectChanged');
        if (p.epic_id != null) return tr('histEpicChanged');
        return tr('histUpdated');
      case 'estimated_changed': return tr('histEstimateChanged', { value: formatMinutes(p.estimated_minutes) });
      case 'tags_changed': return tr('histTagsChanged', { value: (p.tags || []).join(', ') });
      case 'comment_added': return tr('histCommentAdded');
      case 'comment_updated': return tr('histCommentUpdated');
      case 'time_logged': return tr('histTimeLogged', { value: formatMinutes(p.duration_minutes) });
      case 'time_updated': return tr('histTimeUpdated', { value: formatMinutes(p.duration_minutes) });
      case 'time_removed': return tr('histTimeRemoved', { value: formatMinutes(p.duration_minutes) });
      case 'timer_started': return tr('histTimerStarted');
      case 'timer_stopped': return tr('histTimerStopped', { value: formatMinutes(p.duration_minutes) });
      case 'timer_discarded': return tr('histTimerDiscarded');
      case 'link_added': return tr('histLinkAdded', { type: p.link_type });
      case 'link_removed': return tr('histLinkRemoved', { type: p.link_type });
      default: return ev.event_type;
    }
  }

  function renderHistory() {
    const el = document.getElementById('kuiperHistoryList');
    if (!el) return;
    const events = detail?.events || [];
    if (!events.length) {
      el.innerHTML = `<p class="kuiper-panel-empty">${esc(tr('noHistory'))}</p>`;
      return;
    }
    el.innerHTML = events.map(ev => `
      <article class="kuiper-history-item">
        <time>${esc(formatWhen(ev.created_at))}</time>
        <p>${esc(eventSummary(ev))}</p>
      </article>`).join('');
  }

  function renderCommentItem(c) {
    if (String(editingCommentId) === String(c.id)) {
      return `
      <article class="kuiper-comment-item is-editing" data-comment-id="${esc(c.id)}">
        <div class="kuiper-comment-head">
          <time>${esc(formatWhen(c.created_at))}</time>
        </div>
        <textarea class="kuiper-comment-edit-input" rows="4">${esc(c.body)}</textarea>
        <div class="kuiper-comment-edit-actions">
          <button type="button" class="ghost sm" data-comment-act="cancel">${esc(tr('cancel'))}</button>
          <button type="button" class="primary sm" data-comment-act="save">${esc(tr('save'))}</button>
        </div>
      </article>`;
    }
    return `
      <article class="kuiper-comment-item" data-comment-id="${esc(c.id)}">
        <div class="kuiper-comment-head">
          <time>${esc(formatWhen(c.created_at))}</time>
          <button type="button" class="icon sm kuiper-comment-edit" data-comment-act="edit" title="${esc(tr('editComment'))}" aria-label="${esc(tr('editComment'))}">${EDIT_ICON}</button>
        </div>
        <div class="kuiper-md kuiper-comment-body">${renderMd(c.body)}</div>
      </article>`;
  }

  function renderComments() {
    const el = document.getElementById('kuiperCommentList');
    if (!el) return;
    const items = detail?.comments || [];
    if (!items.length) {
      el.innerHTML = `<p class="kuiper-panel-empty">${esc(tr('noComments'))}</p>`;
      return;
    }
    el.innerHTML = items.map(renderCommentItem).join('');
  }

  function renderAll() {
    if (!panelReady) return;
    renderTags();
    renderEstimate();
    renderCardPicker();
    renderLinked();
    renderTimer();
    renderComments();
    renderTimeLog();
    renderHistory();
    i18nPanel();
  }

  function i18nPanel() {
    document.querySelectorAll('#kuiperIssueAsideExtras [data-i18n], #kuiperIssueTabs [data-i18n], #kuiperLinkedSection [data-i18n]').forEach(el => {
      el.textContent = tr(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = tr(el.dataset.i18nPlaceholder);
    });
    const commentInput = document.getElementById('kuiperCommentInput');
    if (commentInput) commentInput.placeholder = tr('commentPlaceholder');
    const linkInput = document.getElementById('kuiperLinkInput');
    if (linkInput) linkInput.placeholder = tr('linkPlaceholder');
  }

  function startTimerTick() {
    stopTimerTick();
    timerTick = setInterval(() => {
      if (detail?.activeTimer) tickTimerDisplay();
    }, 1000);
  }

  function stopTimerTick() {
    if (timerTick) clearInterval(timerTick);
    timerTick = null;
  }

  async function onEditorOpen(cardId, draft) {
    ensureLayout();
    editingCommentId = null;
    editingTimeEntryId = null;
    currentCardId = cardId;
    if (cardId === 'new') {
      detail = {
        card: { estimated_minutes: draft?.estimatedMinutes ?? null },
        tags: (draft?.tags || []).map(n => ({ name: n })),
        boardTags: ctx.state?.()?._kuiper?.boardTags || [],
        links: { blockedBy: [], blocks: [], related: [] },
        timeEntries: [],
        comments: [],
        events: [],
        activeTimer: null,
        timeLoggedMinutes: 0,
      };
      renderAll();
      return;
    }
    try {
      detail = await KuiperStore.loadCardDetail(cardId);
      syncTaskFromDetail();
      renderAll();
      startTimerTick();
    } catch (err) {
      console.warn('card detail load failed', err);
    }
  }

  function onEditorClose() {
    editingCommentId = null;
    editingTimeEntryId = null;
    currentCardId = null;
    detail = null;
    stopTimerTick();
  }

  function patchFromTask(prev, t) {
    const patch = {};
    const prevTags = (prev.tags || []).join('\0');
    const nextTags = (t.tags || []).join('\0');
    if (prevTags !== nextTags) patch.tags = t.tags || [];
    if ((prev.estimatedMinutes ?? null) !== (t.estimatedMinutes ?? null)) {
      patch.estimated_minutes = t.estimatedMinutes ?? null;
    }
    return patch;
  }

  function init(hooks) {
    ctx = hooks;
  }

  return {
    init,
    ensureLayout,
    onEditorOpen,
    onEditorClose,
    patchFromTask,
    reloadDetail,
    i18nPanel,
  };
})();

if (typeof module !== 'undefined') module.exports = { KuiperIssuePanel };
