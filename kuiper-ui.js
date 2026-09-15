/* Kuiper UI — panel lateral, vista del tablero y agrupación (?kuiper=1) */
const KuiperUI = (() => {
  let ctx = {};
  let navigation = null;
  let dropBound = false;

  const STAGE_LABELS = {
    en: { INBOX: 'Inbox', DOING: 'Doing', WAITING: 'Waiting', DONE: 'Done' },
    es: { INBOX: 'Entrada', DOING: 'En curso', WAITING: 'En espera', DONE: 'Hecho' },
  };

  const PRIORITY_LEVELS = [0, 1, 2, 3, 4];

  const ENTITY_COLORS = [
    '#FFB454', '#7FD1AE', '#8FB8FF', '#F58FA8', '#C79BFF', '#6FD3E8', '#D6C36B', '#9AA5B8',
  ];

  const ICON = {
    side: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3.5 4h9M3.5 8h9M3.5 12h9"/><path d="M2.5 3.5v9" stroke-width="1.8"/></svg>',
    more: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="3.4" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="12.6" cy="8" r="1.2"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6"/></svg>',
    chev: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>',
    star: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M8 2.5L9.47 6.28 13.52 6.51 10.38 9.07 11.41 12.99 8 10.8 4.59 12.99 5.62 9.07 2.48 6.51 6.53 6.28Z"/></svg>',
    starFill: '<svg viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M8 2.5L9.47 6.28 13.52 6.51 10.38 9.07 11.41 12.99 8 10.8 4.59 12.99 5.62 9.07 2.48 6.51 6.53 6.28Z"/></svg>',
    filter: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.5h11L9.5 9v4l-3 1.5V9L2.5 3.5z"/></svg>',
    copy: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="7" height="7" rx="1"/><path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/></svg>',
  };

  const GROUP_OPTS = [
    ['none', 'groupNone'],
    ['epic', 'groupEpic'],
    ['project', 'groupProject'],
    ['priority', 'groupPriority'],
  ];

  const SORT_OPTS = [
    ['position', 'sortPosition'],
    ['priority', 'sortPriority'],
    ['updated', 'sortUpdated'],
  ];

  function locale() {
    return ctx.locale?.() || 'en';
  }

  function tr(key, vars) {
    return ctx.tr?.(key, vars) || key;
  }

  function stageLabel(name) {
    const key = String(name || '').toUpperCase();
    const loc = locale();
    return (STAGE_LABELS[loc] || STAGE_LABELS.en)[key] || name;
  }

  function priorityKey(level) {
    return ['priorityNone', 'priorityLow', 'priorityMedium', 'priorityHigh', 'priorityCritical'][level] || 'priorityNone';
  }

  function priorityLabel(level) {
    return tr(priorityKey(level));
  }

  function priorityIconSvg(level) {
    const n = Number(level) || 0;
    if (n <= 0) return '';
    const stroke = 'stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
    if (n === 1) {
      return `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.5l4 4 4-4" ${stroke}/></svg>`;
    }
    const count = Math.min(n - 1, 3);
    const ups = count === 3
      ? ['M4 14l4-3 4 3', 'M4 11l4-3 4 3', 'M4 8l4-3 4 3']
      : ['M4 12l4-3.5 4 3.5', 'M4 8.5l4-3.5 4 3.5'];
    const paths = ups.slice(0, count).map(d => `<path d="${d}" ${stroke}/>`).join('');
    const tall = count >= 2;
    const vb = count === 3 ? '0 2 16 16' : '0 0 16 16';
    const cls = tall ? ' class="kuiper-pri-svg-tall"' : '';
    return `<svg viewBox="${vb}"${cls} aria-hidden="true">${paths}</svg>`;
  }

  function priorityMarkHtml(level, { label = false } = {}) {
    const n = Number(level) || 0;
    if (n <= 0) return '';
    const icon = priorityIconSvg(n);
    const cls = `kuiper-pri p${n}`;
    const title = esc(priorityLabel(n));
    if (label) {
      return `<span class="${cls} kuiper-pri-mark" title="${title}">${icon}<span class="kuiper-pri-text">${title}</span></span>`;
    }
    return `<span class="${cls} kuiper-pri-icon" title="${title}" aria-label="${title}">${icon}</span>`;
  }

  function cardPriorityBadge(t) {
    const n = Number(t.priority) || 0;
    if (n <= 0) return '';
    const title = esc(priorityLabel(n));
    return `<span class="kuiper-pri kuiper-pri-badge p${n}" title="${title}" aria-label="${title}">${priorityIconSvg(n)}</span>`;
  }

  function epicOf(id) {
    return (ctx.state?.().epics || []).find(e => e.id === id) || null;
  }

  function epicColor(epic) {
    if (!epic) return null;
    if (epic.color) return epic.color;
    const list = ctx.state?.().epics || [];
    const idx = list.findIndex(e => e.id === epic.id);
    return ENTITY_COLORS[(idx >= 0 ? idx : 0) % ENTITY_COLORS.length];
  }

  function epicMarkHtml(epic, { label } = {}) {
    const color = epicColor(epic);
    const style = color ? ` style="--c:${esc(color)}"` : '';
    const text = esc(label || epic.title);
    return `<span class="kuiper-opt-epic"${style}><span class="tri" aria-hidden="true"></span><span>${text}</span></span>`;
  }

  function priorityOptHtml(opt) {
    const n = Number(opt.level) || 0;
    const icon = priorityIconSvg(n);
    const label = esc(opt.label || priorityLabel(n));
    if (n <= 0) return `<span class="kuiper-drop-opt">${label}</span>`;
    return `<span class="kuiper-drop-opt kuiper-opt-pri kuiper-pri p${n}">${icon}<span>${label}</span></span>`;
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function boardKey(orgSlug, boardSlug) {
    return `${orgSlug}/${boardSlug}`;
  }

  function getFavorites() {
    const raw = ctx.loadKuiperPrefs?.()?.favoriteBoards;
    return Array.isArray(raw) ? raw : [];
  }

  function findBoard(key) {
    if (!navigation) return null;
    const [orgSlug, boardSlug] = key.split('/');
    const org = (navigation.organizations || []).find(o => o.slug === orgSlug);
    const board = org?.boards?.find(b => b.slug === boardSlug);
    if (!org || !board) return null;
    return { org, board };
  }

  function ensureFilterState(st) {
    if (!st) return;
    if (!Array.isArray(st.projectFilters)) st.projectFilters = [];
    if (!Array.isArray(st.epicFilters)) st.epicFilters = [];
  }

  function filterSet(arr) {
    return new Set((arr || []).filter(Boolean));
  }

  function toggleFilterId(arr, id) {
    const set = filterSet(arr);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    return [...set];
  }

  function getFavoriteProjects() {
    const raw = ctx.loadKuiperPrefs?.()?.favoriteProjects;
    return Array.isArray(raw) ? raw.filter(Boolean) : [];
  }

  function toggleFavoriteProject(projectId) {
    const favs = new Set(getFavoriteProjects());
    if (favs.has(projectId)) favs.delete(projectId);
    else favs.add(projectId);
    saveUiPrefs({ favoriteProjects: [...favs] });
    renderProjectList();
    renderFiltersMenu();
  }

  function migratePrefsToState(st, prefs = {}) {
    ensureFilterState(st);
    if (Array.isArray(prefs.projectFilters)) st.projectFilters = prefs.projectFilters;
    else if (prefs.filter) st.projectFilters = [prefs.filter];
    if (Array.isArray(prefs.epicFilters)) st.epicFilters = prefs.epicFilters;
    else if (prefs.epicFilter) st.epicFilters = [prefs.epicFilter];
  }

  function filteredEpicsForFilters(st) {
    const projSel = filterSet(st.projectFilters);
    let list = st.epics || [];
    if (projSel.size) list = list.filter(e => projSel.has(e.projectId));
    return list;
  }

  function cardLinkUrl(id) {
    const u = new URL(location.href);
    u.searchParams.set('kuiper', '1');
    if (!u.searchParams.get('board')) u.searchParams.set('board', currentBoardSlug());
    const org = currentOrgSlug();
    if (org) u.searchParams.set('org', org);
    else u.searchParams.delete('org');
    u.searchParams.set('card', id);
    u.hash = '';
    return u.toString();
  }

  function syncCardUrl(id) {
    const u = new URL(location.href);
    if (id && id !== 'new') u.searchParams.set('card', id);
    else u.searchParams.delete('card');
    history.replaceState(null, '', `${u.pathname}${u.search}${u.hash}`);
  }

  async function copyCardLink(id) {
    const url = cardLinkUrl(id);
    const ok = await ctx.copyText?.(url);
    if (ok) ctx.toast?.(tr('linkCopied'));
    else ctx.toast?.(tr('couldNotCopy'));
  }

  function cardIdButtonHtml(id) {
    if (!id || id === 'new') return '';
    return `<button type="button" class="kuiper-card-id" data-card-id="${esc(id)}" title="${esc(tr('copyLink'))}">
      <span class="kuiper-card-id-lbl">${esc(id)}</span>
      <span class="kuiper-card-id-ico">${ICON.copy}</span>
    </button>`;
  }

  function bindCardIdButtons(root) {
    (root || document).querySelectorAll('.kuiper-card-id').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        e.preventDefault();
        copyCardLink(btn.dataset.cardId);
      };
    });
  }

  function cardIdRowHtml(t) {
    const html = cardIdButtonHtml(t?.id);
    return html ? `<div class="kuiper-card-id-wrap">${html}</div>` : '';
  }

  function syncEditorCardId(id) {
    const row = document.getElementById('kuiperEditorIdHead');
    if (!row) return;
    if (!id || id === 'new') {
      row.hidden = true;
      row.innerHTML = '';
      return;
    }
    row.hidden = false;
    row.innerHTML = cardIdButtonHtml(id);
    bindCardIdButtons(row);
  }

  function saveUiPrefs(extra = {}) {
    const st = ctx.state?.();
    if (!st || !ctx.saveKuiperPrefs) return;
    ensureFilterState(st);
    ctx.saveKuiperPrefs({
      ...(ctx.loadKuiperPrefs?.() || {}),
      projectFilters: st.projectFilters || [],
      epicFilters: st.epicFilters || [],
      groupBy: st.groupBy || 'none',
      sortBy: st.sortBy || 'position',
      locale: locale(),
      favoriteBoards: getFavorites(),
      favoriteProjects: getFavoriteProjects(),
      ...extra,
    });
  }

  async function loadNavigation() {
    if (typeof KuiperStore === 'undefined' || !KuiperStore.loadNavigation) return null;
    try {
      navigation = await KuiperStore.loadNavigation();
      return navigation;
    } catch (err) {
      console.warn('kuiper navigation failed —', err);
      return null;
    }
  }

  function ensureSidebar() {
    if (document.getElementById('kuiperSide')) return;
    const side = document.createElement('aside');
    side.id = 'kuiperSide';
    side.className = 'kuiper-side';
    side.hidden = true;
    side.setAttribute('aria-label', tr('workspace'));
    side.innerHTML = `
      <header class="panel-head">
        <h2 id="kuiperSideTitle">${esc(tr('workspace'))}</h2>
        <button type="button" class="icon sm" id="kuiperSideClose" title="${esc(tr('close'))}">${ICON.close}</button>
      </header>
      <div class="panel-body kuiper-side-body">
        <div class="menu-label" data-i18n="favorites"></div>
        <div id="kuiperFavList" class="kuiper-list"></div>
        <div class="menu-label" data-i18n="boards"></div>
        <div id="kuiperBoardTree" class="kuiper-tree"></div>
        <div class="menu-label" data-i18n="projects"></div>
        <p class="kuiper-hint" data-i18n="projectsHint"></p>
        <div id="kuiperProjectList" class="kuiper-list"></div>
      </div>`;
    document.body.append(side);
    document.getElementById('kuiperSideClose').onclick = () => setSidebarOpen(false);
  }

  function ensureToggle() {
    if (document.getElementById('kuiperSideToggle')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon';
    btn.id = 'kuiperSideToggle';
    btn.title = tr('workspace');
    btn.innerHTML = ICON.side;
    btn.onclick = () => setSidebarOpen(!isSidebarOpen());
    const brand = document.querySelector('.brand');
    if (brand?.parentNode) brand.parentNode.insertBefore(btn, brand);
    else document.querySelector('.rail')?.prepend(btn);
  }

  function dropdownMarkup(ctrlId, headerKey) {
    return `<div class="kuiper-ctrl" id="${ctrlId}">
      <button type="button" class="pill kuiper-drop-btn" aria-haspopup="listbox" aria-expanded="false">
        <span class="kuiper-drop-label"></span>
      </button>
      <div class="menu kuiper-drop-menu" role="listbox" hidden>
        <div class="menu-label" data-i18n="${headerKey}"></div>
        <div class="kuiper-drop-items"></div>
      </div>
    </div>`;
  }

  function filtersDropdownMarkup() {
    return `<div class="kuiper-filters-wrap">
      <div class="kuiper-ctrl" id="kuiperFiltersCtrl">
        <button type="button" class="pill kuiper-drop-btn kuiper-filters-btn" aria-haspopup="listbox" aria-expanded="false">
          <span class="kuiper-filters-icon">${ICON.filter}</span>
          <span class="kuiper-drop-label" data-i18n="filters"></span>
          <span class="kuiper-filters-badge" hidden></span>
        </button>
        <div class="menu kuiper-drop-menu kuiper-filters-menu" role="listbox" hidden>
          <div class="menu-label" data-i18n="projects"></div>
          <div class="kuiper-drop-items" id="kuiperProjectFilterItems"></div>
          <div class="menu-label kuiper-filters-epic-label" data-i18n="epic"></div>
          <div class="kuiper-drop-items" id="kuiperEpicFilterItems"></div>
        </div>
      </div>
      <button type="button" class="icon sm kuiper-filters-clear" id="kuiperFiltersClear" hidden title=""></button>
    </div>`;
  }

  function clearAllFilters() {
    applyFilterChange(st => {
      ensureFilterState(st);
      st.projectFilters = [];
      st.epicFilters = [];
    });
  }

  function ensureRailControls(container) {
    let view = document.getElementById('kuiperView');
    if (!view) {
      view = document.createElement('div');
      view.id = 'kuiperView';
      view.className = 'kuiper-view';
      view.innerHTML = `
        ${filtersDropdownMarkup()}
        ${dropdownMarkup('kuiperGroupCtrl', 'groupBy')}
        ${dropdownMarkup('kuiperSortCtrl', 'sortBy')}`;
      bindDropdowns();
      view.querySelectorAll('.kuiper-ctrl').forEach(wireCtrl);
    }
    if (container && !container.contains(view)) container.append(view);
    view.querySelectorAll('.kuiper-ctrl').forEach(wireCtrl);
  }

  function mountRailControls(container, opts = {}) {
    if (!opts.keepFiltersOpen) {
      closeDropMenus();
      document.querySelectorAll('body > .kuiper-drop-menu').forEach(m => m.remove());
    }
    ensureRailControls(container);
    renderRailControls(opts);
  }

  let openMenuCtrl = null;

  function pinFiltersMenu() {
    if (openMenuCtrl !== 'kuiperFiltersCtrl') return null;
    const ctrl = document.getElementById('kuiperFiltersCtrl');
    const menu = ctrl ? menuOf(ctrl) : null;
    const btn = dropBtnOf(ctrl);
    if (!ctrl || !menu || !btn || menu.hidden) return null;
    return { ctrl, menu, btn };
  }

  function restorePinnedFiltersMenu(pin) {
    if (!pin?.ctrl || !pin.menu || !pin.btn) return;
    if (pin.menu.parentElement !== document.body) document.body.append(pin.menu);
    pin.menu.hidden = false;
    pin.btn.setAttribute('aria-expanded', 'true');
    openMenuCtrl = pin.ctrl.id;
    positionDropMenu(pin.menu, pin.btn);
  }

  function applyFilterChange(mutate) {
    const st = ctx.state?.();
    if (!st) return;
    ensureFilterState(st);
    const pin = pinFiltersMenu();
    mutate(st);
    saveUiPrefs();
    ctx.save?.();
    renderFiltersMenu();
    restorePinnedFiltersMenu(pin);
    ctx.renderBoard?.();
  }

  function wireCtrl(ctrl) {
    if (!ctrl || ctrl._menu) return;
    const menu = ctrl.querySelector('.kuiper-drop-menu');
    if (!menu) return;
    ctrl._menu = menu;
    menu._home = ctrl;
  }

  function menuOf(ctrl) {
    if (!ctrl) return null;
    wireCtrl(ctrl);
    return ctrl._menu || null;
  }

  function closeDropMenus() {
    document.querySelectorAll('.kuiper-drop-menu').forEach(m => {
      m.hidden = true;
      if (m._home && m.parentElement === document.body) m._home.append(m);
    });
    document.querySelectorAll('.kuiper-drop-btn, .kuiper-select-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
    openMenuCtrl = null;
  }

  function positionDropMenu(menu, btn) {
    const r = btn.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 16);
    let left = Math.max(8, r.left);
    if (left + width > window.innerWidth - 8) left = window.innerWidth - 8 - width;
    menu.style.position = 'fixed';
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.left = `${left}px`;
    menu.style.right = 'auto';
    menu.style.bottom = 'auto';
    menu.style.width = `${width}px`;
    menu.style.zIndex = '120';
  }

  function dropBtnOf(ctrl) {
    return ctrl?.querySelector('.kuiper-drop-btn, .kuiper-select-btn') || null;
  }

  function openDropMenu(ctrl) {
    const menu = menuOf(ctrl);
    const btn = dropBtnOf(ctrl);
    if (!menu || !btn) return;
    closeDropMenus();
    document.body.append(menu);
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    openMenuCtrl = ctrl.id;
    positionDropMenu(menu, btn);
  }

  function toggleDropMenu(ctrl) {
    const menu = menuOf(ctrl);
    if (!menu) return;
    if (!menu.hidden && openMenuCtrl === ctrl.id) closeDropMenus();
    else openDropMenu(ctrl);
  }

  function bindDropdowns() {
    if (dropBound) return;
    dropBound = true;
    document.addEventListener('pointerdown', e => {
      if (e.target.closest('.kuiper-ctrl, .kuiper-drop-menu, .kuiper-filters-wrap')) return;
      closeDropMenus();
    });
    window.addEventListener('resize', closeDropMenus);
  }

  function updateDropdown(ctrlId, options, current, onPick, { optionHtml } = {}) {
    const ctrl = document.getElementById(ctrlId);
    if (!ctrl) return;
    wireCtrl(ctrl);
    const menu = menuOf(ctrl);
    const btnLabel = ctrl.querySelector('.kuiper-drop-label');
    const items = menu?.querySelector('.kuiper-drop-items');
    const header = menu?.querySelector('.menu-label');
    if (header) header.textContent = tr(header.dataset.i18n);
    if (!items || !btnLabel) return;
    items.innerHTML = '';
    let activeLabel = '';
    let activeHtml = '';
    for (const opt of options) {
      const value = opt.value;
      const label = opt.label;
      const active = value === current;
      const html = optionHtml ? optionHtml(opt, active) : `<span class="kuiper-drop-opt">${esc(label)}</span>`;
      if (active) {
        activeLabel = label;
        activeHtml = html;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(active));
      b.innerHTML = `${html}<span class="tick">✓</span>`;
      b.onclick = e => {
        e.stopPropagation();
        onPick(value);
        closeDropMenus();
      };
      items.append(b);
    }
    if (optionHtml) btnLabel.innerHTML = activeHtml || esc(activeLabel);
    else btnLabel.textContent = activeLabel;
    const btn = dropBtnOf(ctrl);
    if (btn) {
      btn.title = header ? `${header.textContent}: ${activeLabel}` : activeLabel;
      btn.onpointerdown = e => e.stopPropagation();
      btn.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        toggleDropMenu(ctrl);
      };
    }
  }

  function renderFiltersMenu() {
    const st = ctx.state?.();
    if (!st) return;
    ensureFilterState(st);
    const projItems = document.getElementById('kuiperProjectFilterItems');
    const epicItems = document.getElementById('kuiperEpicFilterItems');
    const ctrl = document.getElementById('kuiperFiltersCtrl');
    if (!projItems || !epicItems || !ctrl) return;
    wireCtrl(ctrl);

    const projSel = filterSet(st.projectFilters);
    const epicSel = filterSet(st.epicFilters);
    const favProjects = getFavoriteProjects();

    const mkBtn = (html, active, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(active));
      b.innerHTML = `${html}<span class="tick">✓</span>`;
      b.onpointerdown = e => e.stopPropagation();
      b.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      };
      return b;
    };

    const count = projSel.size + epicSel.size;
    const badge = ctrl.querySelector('.kuiper-filters-badge');
    if (badge) {
      badge.hidden = !count;
      badge.textContent = String(count);
    }
    const btnLabel = ctrl.querySelector('.kuiper-drop-label');
    if (btnLabel) btnLabel.textContent = count ? `${tr('filters')} (${count})` : tr('filters');
    const clearBtn = document.getElementById('kuiperFiltersClear');
    if (clearBtn) {
      clearBtn.hidden = !count;
      clearBtn.title = tr('clearFilters');
      clearBtn.setAttribute('aria-label', tr('clearFilters'));
      clearBtn.innerHTML = ICON.close;
      clearBtn.onclick = e => {
        e.stopPropagation();
        clearAllFilters();
      };
    }

    projItems.innerHTML = '';
    projItems.append(mkBtn(`<span class="kuiper-drop-opt">${esc(tr('all'))}</span>`, projSel.size === 0, () => {
      applyFilterChange(s => { s.projectFilters = []; });
    }));
    const favActive = favProjects.length > 0
      && favProjects.every(id => projSel.has(id))
      && projSel.size === favProjects.length;
    projItems.append(mkBtn(
      `<span class="kuiper-drop-opt kuiper-opt-fav">${ICON.star}<span>${esc(tr('projectFavorites'))}</span></span>`,
      favActive,
      () => {
        applyFilterChange(s => {
          s.projectFilters = favProjects.length ? [...favProjects] : [];
        });
      },
    ));
    for (const p of st.projects || []) {
      const html = `<span class="kuiper-drop-opt kuiper-opt-proj" style="--c:${esc(p.color)}"><span class="dot"></span><span>${esc(p.name)}</span></span>`;
      projItems.append(mkBtn(html, projSel.has(p.id), () => {
        applyFilterChange(s => {
          s.projectFilters = toggleFilterId(s.projectFilters, p.id);
        });
      }));
    }

    epicItems.innerHTML = '';
    const epics = filteredEpicsForFilters(st);
    const epicLabel = ctrl.querySelector('.kuiper-filters-epic-label');
    if (epicLabel) epicLabel.hidden = !epics.length;
    if (!epics.length) {
      epicItems.append(mkBtn(
        `<span class="kuiper-drop-opt kuiper-hint-inline">${esc(tr('noEpicsFilter'))}</span>`,
        false,
        () => {},
      ));
    } else {
      epicItems.append(mkBtn(`<span class="kuiper-drop-opt">${esc(tr('all'))}</span>`, epicSel.size === 0, () => {
        applyFilterChange(s => { s.epicFilters = []; });
      }));
      epicItems.append(mkBtn(`<span class="kuiper-drop-opt">${esc(tr('noEpic'))}</span>`, epicSel.has('__none__'), () => {
        applyFilterChange(s => {
          s.epicFilters = toggleFilterId(s.epicFilters, '__none__');
        });
      }));
      for (const e of epics) {
        epicItems.append(mkBtn(epicMarkHtml(e, { label: e.title }), epicSel.has(e.id), () => {
          applyFilterChange(s => {
            s.epicFilters = toggleFilterId(s.epicFilters, e.id);
          });
        }));
      }
    }

    ctrl.querySelectorAll('.menu-label[data-i18n]').forEach(el => {
      el.textContent = tr(el.dataset.i18n);
    });
    const btn = dropBtnOf(ctrl);
    if (btn) {
      btn.title = tr('filters');
      btn.onpointerdown = e => e.stopPropagation();
      btn.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        toggleDropMenu(ctrl);
      };
    }
  }

  function renderRailControls(opts = {}) {
    const st = ctx.state?.();
    if (!st) return;
    renderFiltersMenu();
    const groupOpts = GROUP_OPTS.map(([value, key]) => ({ value, label: tr(key) }));
    updateDropdown('kuiperGroupCtrl', groupOpts, st.groupBy || 'none', value => {
      st.groupBy = value;
      saveUiPrefs();
      ctx.save?.();
      ctx.render?.();
    });
    const sortOpts = SORT_OPTS.map(([value, key]) => ({ value, label: tr(key) }));
    updateDropdown('kuiperSortCtrl', sortOpts, st.sortBy || 'position', value => {
      st.sortBy = value;
      saveUiPrefs();
      ctx.save?.();
      ctx.render?.();
    });
  }

  function isSidebarOpen() {
    return document.documentElement.dataset.kuiperSide === 'open';
  }

  function setSidebarOpen(open) {
    const side = document.getElementById('kuiperSide');
    if (!side) return;
    side.hidden = false;
    side.classList.toggle('open', open);
    side.setAttribute('aria-hidden', String(!open));
    document.documentElement.dataset.kuiperSide = open ? 'open' : '';
    ctx.syncScrim?.();
    saveUiPrefs({ sidebarOpen: open });
    const toggle = document.getElementById('kuiperSideToggle');
    if (toggle) toggle.setAttribute('aria-expanded', String(open));
  }

  function listItem(label, active, onClick, dotColor, sublabel) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'kuiper-item';
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', String(active));
    if (active) b.setAttribute('aria-current', 'true');
    b.innerHTML = `${dotColor ? '<span class="dot"></span>' : ''}<span class="kuiper-item-text"><span class="kuiper-item-label">${esc(label)}</span>${sublabel ? `<span class="kuiper-item-sub">${esc(sublabel)}</span>` : ''}</span><span class="tick">✓</span>`;
    if (dotColor) b.style.setProperty('--c', dotColor);
    b.onclick = onClick;
    return b;
  }

  function currentOrgSlug() {
    const fromUrl = new URLSearchParams(location.search).get('org');
    if (fromUrl) return fromUrl;
    const kuiper = ctx.state?.()._kuiper;
    return kuiper?.organization?.slug || null;
  }

  function currentBoardSlug() {
    return typeof KuiperStore !== 'undefined' ? KuiperStore.boardSlug() : '';
  }

  function navigateToBoard(boardSlug, orgSlug) {
    const u = new URL(location.href);
    u.searchParams.set('kuiper', '1');
    u.searchParams.set('board', boardSlug);
    if (orgSlug) u.searchParams.set('org', orgSlug);
    location.assign(u.toString());
  }

  function toggleFavorite(orgSlug, boardSlug, e) {
    e?.stopPropagation();
    e?.preventDefault();
    const key = boardKey(orgSlug, boardSlug);
    const favs = new Set(getFavorites());
    if (favs.has(key)) favs.delete(key);
    else favs.add(key);
    saveUiPrefs({ favoriteBoards: [...favs] });
    renderSidebar();
  }

  function boardRow(org, board) {
    const key = boardKey(org.slug, board.slug);
    const active = org.slug === currentOrgSlug() && board.slug === currentBoardSlug();
    const fav = getFavorites().includes(key);
    const row = document.createElement('div');
    row.className = 'kuiper-board-row';
    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'kuiper-star';
    star.title = fav ? tr('removeFavorite') : tr('addFavorite');
    star.setAttribute('aria-pressed', String(fav));
    star.innerHTML = fav ? ICON.starFill : ICON.star;
    star.onclick = e => toggleFavorite(org.slug, board.slug, e);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kuiper-item kuiper-board-item';
    if (active) btn.setAttribute('aria-current', 'true');
    btn.innerHTML = `<span class="kuiper-item-label">${esc(board.name)}</span><span class="tick">✓</span>`;
    btn.onclick = () => navigateToBoard(board.slug, org.slug);
    row.append(star, btn);
    return row;
  }

  function renderFavorites() {
    const el = document.getElementById('kuiperFavList');
    if (!el) return;
    el.innerHTML = '';
    const favs = getFavorites();
    if (!favs.length) {
      const empty = document.createElement('p');
      empty.className = 'kuiper-hint kuiper-empty';
      empty.textContent = tr('noFavorites');
      el.append(empty);
      return;
    }
    for (const key of favs) {
      const found = findBoard(key);
      if (!found) continue;
      const { org, board } = found;
      const active = org.slug === currentOrgSlug() && board.slug === currentBoardSlug();
      el.append(listItem(board.name, active, () => navigateToBoard(board.slug, org.slug), null, org.name));
    }
  }

  function isOrgExpanded(orgSlug) {
    const prefs = ctx.loadKuiperPrefs?.() || {};
    const collapsed = prefs.collapsedOrgs || [];
    if (collapsed.includes(orgSlug)) return false;
    if (orgSlug === currentOrgSlug()) return true;
    return prefs.expandAllOrgs !== false;
  }

  function toggleOrgExpanded(orgSlug) {
    const prefs = ctx.loadKuiperPrefs?.() || {};
    const collapsed = new Set(prefs.collapsedOrgs || []);
    if (collapsed.has(orgSlug)) collapsed.delete(orgSlug);
    else collapsed.add(orgSlug);
    saveUiPrefs({ collapsedOrgs: [...collapsed] });
    renderBoardTree();
  }

  function renderBoardTree() {
    const el = document.getElementById('kuiperBoardTree');
    if (!el || !navigation) return;
    el.innerHTML = '';
    for (const org of navigation.organizations || []) {
      const node = document.createElement('div');
      node.className = 'kuiper-tree-node';
      const expanded = isOrgExpanded(org.slug);
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'kuiper-tree-org';
      head.setAttribute('aria-expanded', String(expanded));
      head.innerHTML = `<span class="kuiper-chev${expanded ? ' open' : ''}">${ICON.chev}</span><span class="kuiper-tree-org-name">${esc(org.name)}</span>`;
      head.onclick = () => toggleOrgExpanded(org.slug);
      node.append(head);
      const kids = document.createElement('div');
      kids.className = 'kuiper-tree-kids';
      kids.hidden = !expanded;
      for (const board of org.boards || []) {
        kids.append(boardRow(org, board));
      }
      node.append(kids);
      el.append(node);
    }
  }

  function renderProjectList() {
    const el = document.getElementById('kuiperProjectList');
    const st = ctx.state?.();
    if (!el || !st) return;
    ensureFilterState(st);
    el.innerHTML = '';
    const projSel = filterSet(st.projectFilters);
    const favProjects = getFavoriteProjects();
    el.append(listItem(tr('all'), projSel.size === 0, () => {
      applyFilterChange(s => { s.projectFilters = []; });
      renderProjectList();
    }));
    const favActive = favProjects.length > 0
      && favProjects.every(id => projSel.has(id))
      && projSel.size === favProjects.length;
    el.append(listItem(tr('projectFavorites'), favActive, () => {
      applyFilterChange(s => {
        s.projectFilters = favProjects.length ? [...favProjects] : [];
      });
      renderProjectList();
    }));
    for (const p of st.projects || []) {
      const row = document.createElement('div');
      row.className = 'kuiper-project-row';
      const fav = getFavoriteProjects().includes(p.id);
      const star = document.createElement('button');
      star.type = 'button';
      star.className = 'kuiper-star';
      star.title = fav ? tr('removeFavorite') : tr('addFavorite');
      star.setAttribute('aria-pressed', String(fav));
      star.innerHTML = fav ? ICON.starFill : ICON.star;
      star.onclick = e => {
        e.stopPropagation();
        e.preventDefault();
        toggleFavoriteProject(p.id);
      };
      const btn = listItem(p.name, projSel.has(p.id), () => {
        applyFilterChange(s => {
          s.projectFilters = toggleFilterId(s.projectFilters, p.id);
          s.flagFilter = false;
        });
        renderProjectList();
      }, p.color);
      row.append(star, btn);
      el.append(row);
    }
  }

  function renderSidebar() {
    const side = document.getElementById('kuiperSide');
    if (!side) return;
    side.querySelectorAll('[data-i18n]').forEach(node => {
      node.textContent = tr(node.dataset.i18n);
    });
    const title = document.getElementById('kuiperSideTitle');
    if (title) title.textContent = tr('workspace');
    renderFavorites();
    renderBoardTree();
    renderProjectList();
  }

  function findCurrentBoard() {
    const orgSlug = currentOrgSlug();
    const boardSlug = currentBoardSlug();
    const org = (navigation?.organizations || []).find(o => o.slug === orgSlug);
    return org?.boards?.find(b => b.slug === boardSlug) || null;
  }

  function boardDisplayName() {
    const st = ctx.state?.();
    if (st?._kuiper?.boardName) return st._kuiper.boardName;
    const board = findCurrentBoard();
    if (board?.name) return board.name;
    return currentBoardSlug() || tr('board');
  }

  function updateBrandTitle() {
    const brand = document.querySelector('.brand');
    if (!brand) return;
    brand.removeAttribute('href');
    brand.classList.add('kuiper-brand');
    const name = boardDisplayName();
    let titleEl = brand.querySelector('.kuiper-board-title');
    if (!titleEl) {
      brand.innerHTML = '<span class="blink"></span><span class="kuiper-board-title"></span>';
      titleEl = brand.querySelector('.kuiper-board-title');
    }
    if (titleEl) titleEl.textContent = name;
    brand.title = name;
  }

  function hideUpstreamCrud() {
    const add = document.querySelector('#filters .pill.add');
    if (add) add.hidden = true;
    const projAdd = document.getElementById('proj-add');
    if (projAdd) projAdd.hidden = true;
    const menuAddCol = document.querySelector('[data-act="addcol"]');
    if (menuAddCol) menuAddCol.hidden = true;
    const menuSort = document.querySelector('[data-act="sortproj"]');
    if (menuSort) menuSort.hidden = true;
    const menuProjects = document.querySelector('[data-act="projects"]');
    if (menuProjects) menuProjects.hidden = true;
  }

  function init(hooks) {
    ctx = hooks;
    document.documentElement.dataset.kuiper = '1';
    ensureSidebar();
    ensureToggle();
    updateBrandTitle();
    hideUpstreamCrud();
    const prefs = ctx.loadKuiperPrefs?.() || {};
    loadNavigation().then(() => {
      updateBrandTitle();
      renderSidebar();
      mountRailControls(document.getElementById('filters'));
      if (prefs.sidebarOpen) setSidebarOpen(true);
    });
  }

  function onBoardLoaded() {
    updateBrandTitle();
    renderSidebar();
    mountRailControls(document.getElementById('filters'));
  }

  function onLocale() {
    updateBrandTitle();
    renderSidebar();
    mountRailControls(document.getElementById('filters'));
    const toggle = document.getElementById('kuiperSideToggle');
    if (toggle) toggle.title = tr('workspace');
    if (editorEditingId && !document.getElementById('editor')?.hidden) {
      asideI18n();
      syncNotesView();
    }
  }

  function refreshFilters() {
    updateBrandTitle();
    renderSidebar();
  }

  function matchesVisible(t) {
    const st = ctx.state?.();
    if (!st) return true;
    ensureFilterState(st);
    const projSel = filterSet(st.projectFilters);
    if (projSel.size && (!t.projectId || !projSel.has(t.projectId))) return false;
    const epicSel = filterSet(st.epicFilters);
    if (epicSel.size) {
      const epicId = t.epicId || '__none__';
      if (!epicSel.has(epicId)) return false;
    }
    return true;
  }

  function openCardFromUrl() {
    const id = new URLSearchParams(location.search).get('card');
    if (!id || !ctx.byId?.(id)) return false;
    if (ctx.isEditorOpen?.(id)) return true;
    ctx.openEditor?.(id);
    requestAnimationFrame(() => {
      const el = document.querySelector(`.card[data-id="${id}"]`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return true;
  }

  function sortTasks(list) {
    const st = ctx.state?.();
    const mode = st?.sortBy || 'position';
    const copy = [...list];
    if (mode === 'priority') {
      copy.sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.order - b.order);
    } else if (mode === 'updated') {
      copy.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } else {
      copy.sort((a, b) => a.order - b.order);
    }
    return copy;
  }

  function groupKeyFor(task) {
    const st = ctx.state?.();
    const mode = st?.groupBy || 'none';
    if (mode === 'epic') return task.epicId || '__none__';
    if (mode === 'project') return task.projectId || '__none__';
    if (mode === 'priority') return String(task.priority || 0);
    return null;
  }

  function groupLabel(key) {
    const st = ctx.state?.();
    const mode = st?.groupBy || 'none';
    if (mode === 'epic') {
      if (key === '__none__') return tr('noEpic');
      return epicOf(key)?.title || tr('noEpic');
    }
    if (mode === 'project') {
      if (key === '__none__') return tr('none');
      const p = (st.projects || []).find(x => x.id === key);
      return p?.name || tr('none');
    }
    if (mode === 'priority') return priorityLabel(Number(key));
    return '';
  }

  function groupedTasks(tasks) {
    const st = ctx.state?.();
    if (!st || st.groupBy === 'none' || !st.groupBy) {
      return [{ header: null, tasks }];
    }
    const buckets = new Map();
    for (const t of tasks) {
      const key = groupKeyFor(t);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(t);
    }
    return [...buckets.entries()].map(([key, items]) => ({
      header: groupLabel(key),
      tasks: sortTasks(items),
    }));
  }

  function appendGrouped(body, tasks, cardEl) {
    const groups = groupedTasks(tasks);
    for (const g of groups) {
      if (g.header) {
        const h = document.createElement('div');
        h.className = 'kuiper-group-head';
        h.textContent = g.header;
        body.append(h);
      }
      g.tasks.forEach(t => body.append(cardEl(t)));
    }
  }

  function buildCardMeta(t, project, since) {
    const epic = t.epicId ? epicOf(t.epicId) : null;
    if (!project && !epic && !since) return '';
    const tags = [];
    if (project) {
      tags.push(`<span class="kuiper-tag proj"><span class="tag-kind">${esc(tr('project'))}</span><span class="tag-val"><span class="dot" aria-hidden="true"></span><span class="lbl">${esc(project.name)}</span></span></span>`);
    }
    if (epic) {
      const ec = epicColor(epic);
      const epicStyle = ec ? ` style="--c:${esc(ec)}"` : '';
      tags.push(`<span class="kuiper-tag epic"${epicStyle}><span class="tag-kind">${esc(tr('epic'))}</span><span class="tag-val"><span class="tri" aria-hidden="true"></span><span class="lbl">${esc(epic.title)}</span></span></span>`);
    }
    const tagsHtml = tags.length ? `<div class="kuiper-card-tags">${tags.join('')}</div>` : '';
    const ageHtml = since ? `<span class="age" title="Untouched for ${since}">${since}</span>` : '';
    return `<div class="kuiper-card-foot">${tagsHtml}${ageHtml}</div>`;
  }

  function decorateCardMeta(t, metaHtml) {
    return metaHtml;
  }

  function epicsForProject(projectId) {
    const st = ctx.state?.();
    if (!st) return [];
    return (st.epics || []).filter(e => !projectId || e.projectId === projectId);
  }

  let editorLayoutReady = false;
  let notesEditing = false;
  let editorEditingId = null;

  function inlineMarkdown(s) {
    let t = esc(s);
    t = t.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
      const u = String(url).trim();
      if (!/^https?:\/\//i.test(u)) return esc(text);
      return `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
    });
    return t;
  }

  function renderMarkdown(raw) {
    if (!raw?.trim()) return '';
    const blocks = [];
    const lines = String(raw).replace(/\r\n/g, '\n').split('\n');
    let i = 0;
    let inCode = false;
    let codeBuf = [];
    while (i < lines.length) {
      const line = lines[i];
      if (line.startsWith('```')) {
        if (!inCode) { inCode = true; codeBuf = []; i += 1; continue; }
        blocks.push(`<pre class="md-pre"><code>${esc(codeBuf.join('\n'))}</code></pre>`);
        inCode = false;
        i += 1;
        continue;
      }
      if (inCode) { codeBuf.push(line); i += 1; continue; }
      const head = line.match(/^(#{1,3})\s+(.*)$/);
      if (head) {
        const lvl = head[1].length;
        blocks.push(`<h${lvl} class="md-h${lvl}">${inlineMarkdown(head[2])}</h${lvl}>`);
        i += 1;
        continue;
      }
      if (/^[-*]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
          items.push(`<li>${inlineMarkdown(lines[i].replace(/^[-*]\s+/, ''))}</li>`);
          i += 1;
        }
        blocks.push(`<ul class="md-ul">${items.join('')}</ul>`);
        continue;
      }
      if (!line.trim()) { i += 1; continue; }
      const paras = [];
      while (i < lines.length && lines[i].trim()
        && !lines[i].startsWith('```')
        && !/^(#{1,3})\s/.test(lines[i])
        && !/^[-*]\s+/.test(lines[i])) {
        paras.push(lines[i]);
        i += 1;
      }
      blocks.push(`<p class="md-p">${inlineMarkdown(paras.join(' '))}</p>`);
    }
    return `<div class="kuiper-md">${blocks.join('')}</div>`;
  }

  function editorSelectMarkup(ctrlId, labelKey) {
    return `<div class="kuiper-ed-field">
      <span class="kuiper-ed-lbl" data-i18n="${labelKey}"></span>
      <div class="kuiper-ctrl kuiper-ed-ctrl" id="${ctrlId}">
        <button type="button" class="kuiper-select-btn" aria-haspopup="listbox" aria-expanded="false">
          <span class="kuiper-drop-label"></span>
          <span class="kuiper-select-chev">${ICON.chev}</span>
        </button>
        <div class="menu kuiper-drop-menu" role="listbox" hidden>
          <div class="kuiper-drop-items"></div>
        </div>
      </div>
    </div>`;
  }

  function updateEditorSelect(ctrlId, options, current, onPick, { optionHtml } = {}) {
    const ctrl = document.getElementById(ctrlId);
    if (!ctrl) return;
    wireCtrl(ctrl);
    const menu = menuOf(ctrl);
    const btnLabel = ctrl.querySelector('.kuiper-drop-label');
    const items = menu?.querySelector('.kuiper-drop-items');
    if (!items || !btnLabel) return;
    items.innerHTML = '';
    let activeHtml = '';
    let activeText = '';
    for (const opt of options) {
      const value = opt.value;
      const active = (value ?? null) === (current ?? null);
      const label = opt.label || '';
      const html = optionHtml ? optionHtml(opt, active) : `<span class="kuiper-drop-opt">${esc(label)}</span>`;
      if (active) {
        activeHtml = optionHtml ? optionHtml(opt, true) : esc(label);
        activeText = label;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(active));
      b.innerHTML = `${html}<span class="tick">✓</span>`;
      b.onclick = e => {
        e.stopPropagation();
        onPick(value);
        closeDropMenus();
      };
      items.append(b);
    }
    if (optionHtml) btnLabel.innerHTML = activeHtml || esc(tr('none'));
    else btnLabel.textContent = activeText || tr('none');
    const btn = ctrl.querySelector('.kuiper-select-btn');
    if (btn) {
      btn.title = activeText;
      btn.onpointerdown = e => e.stopPropagation();
      btn.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        closeEditorMenu();
        toggleDropMenu(ctrl);
      };
    }
  }

  function closeEditorMenu() {
    const panel = document.getElementById('f-editor-menu-panel');
    const btn = document.getElementById('f-editor-menu');
    if (panel) panel.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function toggleEditorMenu() {
    const panel = document.getElementById('f-editor-menu-panel');
    const btn = document.getElementById('f-editor-menu');
    if (!panel || !btn) return;
    closeDropMenus();
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(!open));
    if (!open) return;
    const r = btn.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.top = `${r.bottom + 6}px`;
    panel.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
    panel.style.left = 'auto';
    panel.style.zIndex = '130';
  }

  function syncNotesView(focus = false) {
    const ta = document.getElementById('f-notes');
    const preview = document.getElementById('f-notes-preview');
    if (!ta || !preview) return;
    if (notesEditing) {
      ta.hidden = false;
      preview.hidden = true;
      if (focus) requestAnimationFrame(() => ta.focus());
      return;
    }
    ta.hidden = true;
    preview.hidden = false;
    const raw = ta.value.trim();
    if (!raw) {
      preview.innerHTML = `<p class="md-empty">${esc(tr('notesEmpty'))}</p>`;
      preview.classList.add('empty');
      preview.title = tr('editNotes');
      return;
    }
    preview.classList.remove('empty');
    preview.innerHTML = renderMarkdown(raw);
    preview.title = tr('editNotes');
  }

  function ensureEditorLayout() {
    if (editorLayoutReady) return;
    const editor = document.getElementById('editor');
    const body = editor?.querySelector('.sheet-body');
    if (!editor || !body) return;
    editorLayoutReady = true;
    editor.classList.add('kuiper-editor');

    const head = editor.querySelector('.sheet-head');
    const closeBtn = document.getElementById('f-close');
    const foot = editor.querySelector('.sheet-foot');
    if (foot) foot.hidden = true;

    head.classList.add('kuiper-editor-head');
    head.innerHTML = '';
    const idHead = document.createElement('div');
    idHead.id = 'kuiperEditorIdHead';
    idHead.className = 'kuiper-editor-id-head';
    idHead.hidden = true;
    const tools = document.createElement('div');
    tools.className = 'kuiper-editor-tools';
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'icon sm';
    menuBtn.id = 'f-editor-menu';
    menuBtn.innerHTML = ICON.more;
    menuBtn.setAttribute('aria-haspopup', 'menu');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.title = tr('more');
    const menuPanel = document.createElement('div');
    menuPanel.id = 'f-editor-menu-panel';
    menuPanel.className = 'menu kuiper-editor-menu';
    menuPanel.hidden = true;
    menuPanel.innerHTML = `
      <button type="button" id="f-editor-save"></button>
      <button type="button" id="f-editor-archive"></button>
      <button type="button" id="f-editor-delete" class="danger"></button>`;
    if (closeBtn) {
      closeBtn.classList.add('kuiper-editor-close');
      tools.append(menuBtn, menuPanel, closeBtn);
    } else {
      tools.append(menuBtn, menuPanel);
    }
    head.append(idHead, tools);

    const projectField = document.querySelector('#f-project')?.closest('.field');
    const epicField = document.getElementById('f-epic-field');
    const priField = document.getElementById('f-priority-field');
    if (projectField) projectField.hidden = true;
    if (epicField) epicField.hidden = true;
    if (priField) priField.hidden = true;

    const grid = document.createElement('div');
    grid.className = 'kuiper-editor-grid';
    const main = document.createElement('div');
    main.className = 'kuiper-editor-main';
    const aside = document.createElement('aside');
    aside.className = 'kuiper-editor-aside';
    aside.id = 'kuiperEditorAside';
    aside.innerHTML = `
      ${editorSelectMarkup('kuiperEdProjectCtrl', 'project')}
      ${editorSelectMarkup('kuiperEdEpicCtrl', 'epic')}
      ${editorSelectMarkup('kuiperEdPriCtrl', 'priority')}
      <div class="kuiper-ed-field kuiper-ed-flag-wrap" id="kuiperEdFlagWrap"></div>`;

    while (body.firstChild) main.append(body.firstChild);
    grid.append(main, aside);
    body.append(grid);

    const fNotes = document.getElementById('f-notes');
    if (fNotes) {
      const wrap = document.createElement('div');
      wrap.className = 'kuiper-notes-wrap';
      const preview = document.createElement('div');
      preview.id = 'f-notes-preview';
      preview.className = 'kuiper-notes-preview';
      preview.tabIndex = 0;
      fNotes.parentNode.insertBefore(wrap, fNotes);
      wrap.append(preview, fNotes);
      preview.addEventListener('click', () => { notesEditing = true; syncNotesView(true); });
      preview.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); notesEditing = true; syncNotesView(true); }
      });
      fNotes.addEventListener('blur', () => {
        if (!notesEditing) return;
        notesEditing = false;
        syncNotesView();
      });
    }

    const flagBtn = document.getElementById('f-flag');
    const flagWrap = document.getElementById('kuiperEdFlagWrap');
    if (flagBtn && flagWrap) flagWrap.append(flagBtn);

    if (!document.getElementById('kuiperDeleteDlg')) {
      const dlg = document.createElement('div');
      dlg.id = 'kuiperDeleteDlg';
      dlg.className = 'kuiper-delete-dlg';
      dlg.hidden = true;
      dlg.innerHTML = `
        <div class="kuiper-delete-card" role="dialog" aria-modal="true">
          <h3 id="kuiperDeleteTitle"></h3>
          <p id="kuiperDeleteHint" class="kuiper-delete-hint"></p>
          <input id="kuiperDeleteInput" type="text" spellcheck="false" autocomplete="off">
          <div class="kuiper-delete-actions">
            <button type="button" class="ghost" id="kuiperDeleteCancel"></button>
            <button type="button" class="danger" id="kuiperDeleteConfirm" disabled></button>
          </div>
        </div>`;
      document.body.append(dlg);
    }

    bindDropdowns();
    aside.querySelectorAll('.kuiper-ctrl').forEach(wireCtrl);

    document.getElementById('f-editor-save').onclick = () => {
      closeEditorMenu();
      ctx.saveEditor?.();
    };
    document.getElementById('f-editor-archive').onclick = () => {
      closeEditorMenu();
      ctx.archiveEditorTask?.();
    };
    document.getElementById('f-editor-delete').onclick = () => {
      closeEditorMenu();
      openDeleteDialog();
    };
    menuBtn.onclick = e => { e.stopPropagation(); toggleEditorMenu(); };
    document.addEventListener('pointerdown', e => {
      if (e.target.closest('#f-editor-menu') || e.target.closest('#f-editor-menu-panel')) return;
      closeEditorMenu();
    });

    const dlg = document.getElementById('kuiperDeleteDlg');
    const delInput = document.getElementById('kuiperDeleteInput');
    const delConfirm = document.getElementById('kuiperDeleteConfirm');
    document.getElementById('kuiperDeleteCancel').onclick = closeDeleteDialog;
    dlg.addEventListener('click', e => { if (e.target === dlg) closeDeleteDialog(); });
    delInput.addEventListener('input', () => {
      const word = (dlg.dataset.confirmWord || '').toLowerCase();
      delConfirm.disabled = delInput.value.trim().toLowerCase() !== word;
    });
    delConfirm.onclick = () => {
      const id = dlg.dataset.taskId;
      closeDeleteDialog();
      if (id) ctx.deleteEditorTask?.(id);
    };
  }

  function openDeleteDialog() {
    const dlg = document.getElementById('kuiperDeleteDlg');
    if (!dlg || !editorEditingId || editorEditingId === 'new') return;
    const word = tr('deleteConfirmWord');
    dlg.dataset.taskId = editorEditingId;
    dlg.dataset.confirmWord = word;
    document.getElementById('kuiperDeleteTitle').textContent = tr('deleteConfirmTitle');
    document.getElementById('kuiperDeleteHint').textContent = tr('deleteConfirmHint', { word });
    const input = document.getElementById('kuiperDeleteInput');
    input.value = '';
    input.placeholder = tr('deleteConfirmPlaceholder');
    document.getElementById('kuiperDeleteCancel').textContent = tr('cancel');
    document.getElementById('kuiperDeleteConfirm').textContent = tr('delete');
    document.getElementById('kuiperDeleteConfirm').disabled = true;
    dlg.hidden = false;
    requestAnimationFrame(() => input.focus());
  }

  function closeDeleteDialog() {
    const dlg = document.getElementById('kuiperDeleteDlg');
    if (dlg) dlg.hidden = true;
  }

  function renderEditorFields(draft) {
    if (!draft) return;
    const st = ctx.state?.();
    if (!st) return;

    const projects = [{ value: null, label: tr('none') }].concat(
      (st.projects || []).map(p => ({ value: p.id, label: p.name, color: p.color })),
    );
    updateEditorSelect('kuiperEdProjectCtrl', projects, draft.projectId || null, value => {
      draft.projectId = value;
      if (value && draft.epicId) {
        const epic = (st.epics || []).find(e => e.id === draft.epicId);
        if (epic && epic.projectId !== value) draft.epicId = null;
      }
      renderEditorFields(draft);
    }, {
      optionHtml: (opt, active) => {
        if (!opt.color) return `<span class="kuiper-drop-opt">${esc(opt.label)}</span>`;
        return `<span class="kuiper-drop-opt kuiper-opt-proj" style="--c:${esc(opt.color)}"><span class="dot"></span><span>${esc(opt.label)}</span></span>`;
      },
    });

    const epics = [{ value: null, label: tr('none') }].concat(
      epicsForProject(draft.projectId).map(e => ({ value: e.id, label: e.title, epic: e })),
    );
    updateEditorSelect('kuiperEdEpicCtrl', epics, draft.epicId || null, value => {
      draft.epicId = value;
      renderEditorFields(draft);
    }, {
      optionHtml: opt => {
        if (!opt.epic) return `<span class="kuiper-drop-opt">${esc(opt.label)}</span>`;
        return epicMarkHtml(opt.epic, { label: opt.label });
      },
    });

    const priOpts = PRIORITY_LEVELS.map(level => ({
      value: level,
      label: priorityLabel(level),
      level,
    }));
    updateEditorSelect('kuiperEdPriCtrl', priOpts, draft.priority || 0, value => {
      draft.priority = value;
      renderEditorFields(draft);
    }, {
      optionHtml: opt => priorityOptHtml(opt),
    });

    asideI18n();
  }

  function asideI18n() {
    document.querySelectorAll('.kuiper-ed-lbl[data-i18n]').forEach(el => {
      el.textContent = tr(el.dataset.i18n);
    });
    const saveBtn = document.getElementById('f-editor-save');
    const archBtn = document.getElementById('f-editor-archive');
    const delBtn = document.getElementById('f-editor-delete');
    if (saveBtn) saveBtn.textContent = tr('save');
    if (archBtn) archBtn.textContent = tr('archive');
    if (delBtn) delBtn.textContent = tr('delete');
    const archItem = document.getElementById('f-editor-archive');
    if (archItem) archItem.hidden = !editorEditingId || editorEditingId === 'new';
  }

  function showEditorFields() {
    ensureEditorLayout();
  }

  function onEditorOpen(draft, editingId) {
    ensureEditorLayout();
    editorEditingId = editingId;
    notesEditing = !draft?.notes?.trim();
    closeEditorMenu();
    closeDeleteDialog();
    syncEditorCardId(editingId);
    syncCardUrl(editingId);
    renderEditorFields(draft);
    syncNotesView(notesEditing);
    asideI18n();
  }

  function onEditorClose() {
    editorEditingId = null;
    notesEditing = false;
    syncEditorCardId(null);
    syncCardUrl(null);
    closeEditorMenu();
    closeDeleteDialog();
    closeDropMenus();
  }

  function flushEditor() {
    if (notesEditing) notesEditing = false;
    syncNotesView();
  }

  function patchFromTask(prev, t) {
    const patch = {};
    if ((prev.epicId || null) !== (t.epicId || null)) patch.epic_id = t.epicId || null;
    if ((prev.priority || 0) !== (t.priority || 0)) patch.priority = t.priority || 0;
    if (prev.projectId !== t.projectId) patch.project_id = t.projectId;
    return patch;
  }

  function buildCreateBody(patch) {
    const st = ctx.state?.();
    ensureFilterState(st);
    const projectId = patch.projectId
      || st?.projectFilters?.[0]
      || st?.projects?.[0]?.id;
    if (!projectId) throw new Error('project required');
    return {
      project_id: projectId,
      title: patch.title,
      notes: patch.notes || '',
      session_ref: patch.session || '',
      stage_id: patch.columnId,
      epic_id: patch.epicId || null,
      flagged: !!patch.flag,
      priority: patch.priority || 0,
    };
  }

  return {
    init,
    onBoardLoaded,
    onLocale,
    refreshFilters,
    stageLabel,
    priorityLabel,
    matchesVisible,
    sortTasks,
    groupedTasks,
    appendGrouped,
    decorateCardMeta,
    buildCardMeta,
    cardIdRowHtml,
    bindCardIdButtons,
    cardPriorityBadge,
    priorityMarkHtml,
    migratePrefsToState,
    openCardFromUrl,
    syncCardUrl,
    cardLinkUrl,
    renderEditorFields,
    showEditorFields,
    onEditorOpen,
    onEditorClose,
    flushEditor,
    patchFromTask,
    buildCreateBody,
    renderSidebar,
    mountRailControls,
    renderRailControls,
    saveUiPrefs,
    setSidebarOpen,
  };
})();

if (typeof module !== 'undefined') module.exports = { KuiperUI };
