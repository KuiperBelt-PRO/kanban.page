/* Administración workspace Kuiper — tableros, proyectos, tags, sprints (vista en #board) */
const KuiperWorkspaceAdmin = (() => {
  let ctx = {};
  let host = null;
  let tab = 'organizations';
  let showArchivedEntities = false;
  let pendingTab = null;
  /** Tablero cuyo detalle (proyectos, etapas) se muestra en la pestaña unificada */
  let selectedBoardSlug = null;
  let selectedBoardId = null;
  /** Org usada al listar tableros en Manage (evita depender solo de la URL) */
  let managedOrgSlug = '';

  function normalizeTab(next) {
    if (next === 'board') return 'boards';
    if (next === 'organization' || next === 'orgs') return 'organizations';
    return next || 'organizations';
  }

  function tr(k, v) {
    return ctx.tr?.(k, v) ?? k;
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  const WS_ICON = {
    archive: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h10v7.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z"/><path d="M6 6V4.5A1 1 0 0 1 7 3.5h2a1 1 0 0 1 1 1V6"/><path d="M3 6h10"/></svg>',
    restore: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v4.5"/><path d="M5.5 5 8 2.5 10.5 5"/><path d="M4 8.5v3a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-3"/></svg>',
    delete: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 5h9"/><path d="M6 5V3.75A.75.75 0 0 1 6.75 3h2.5a.75.75 0 0 1 .75.75V5"/><path d="M5.25 5l.4 7.2a.75.75 0 0 0 .75.7h3.2a.75.75 0 0 0 .75-.7L10.75 5"/></svg>',
  };

  function archivedFlag(row) {
    return !!(row && (row.archived === true || row.archived === 1));
  }

  async function refreshNavSidebar() {
    if (typeof KuiperUI !== 'undefined') {
      await KuiperUI.loadNavigation?.();
      KuiperUI.renderSidebar?.();
      KuiperUI.refreshFilters?.();
    }
  }

  function archivedToggleHtml() {
    return `<label class="kuiper-ws-check kuiper-ws-archived-toggle">
      <input type="checkbox" id="kuiperWsShowArchived" ${showArchivedEntities ? 'checked' : ''}>
      <span>${esc(tr('workspaceAdminShowArchived'))}</span>
    </label>`;
  }

  function wireArchivedToggle(body) {
    const cb = body.querySelector('#kuiperWsShowArchived');
    if (!cb) return;
    cb.onchange = () => {
      showArchivedEntities = cb.checked;
      void renderBody();
    };
  }

  async function confirmArchiveEntity(name) {
    const C = typeof KuiperConfirm !== 'undefined' ? KuiperConfirm : null;
    if (C) {
      return C.confirmArchive({
        title: tr('workspaceAdminArchiveTitle', { name }),
        message: tr('workspaceAdminArchiveMsg', { name }),
        confirmLabel: tr('archiveVerb'),
        cancelLabel: tr('cancel'),
      });
    }
    return window.confirm(`${tr('workspaceAdminArchiveTitle', { name })}\n\n${tr('workspaceAdminArchiveMsg', { name })}`);
  }

  async function confirmDeleteEntity(name) {
    const C = typeof KuiperConfirm !== 'undefined' ? KuiperConfirm : null;
    const word = tr('deleteConfirmWord');
    if (C) {
      return C.confirmDelete({
        title: tr('workspaceAdminDeleteTitle', { name }),
        message: tr('workspaceAdminDeleteMsg', { name }),
        typeWord: word,
        placeholder: tr('deleteConfirmInputPlaceholder', { word }),
        confirmLabel: tr('delete'),
        cancelLabel: tr('cancel'),
      });
    }
    const typed = window.prompt(
      `${tr('workspaceAdminDeleteTitle', { name })}\n${tr('deleteConfirmHint', { word })}`,
      '',
    );
    return typed?.trim().toLowerCase() === word.toLowerCase();
  }

  function entityActionButtons({ archived, archiveAct, restoreAct, deleteAct, slugAttr, slug }) {
    const attr = slugAttr ? ` data-${slugAttr}="${esc(slug)}"` : '';
    const archiveLabel = archived ? tr('restore') : tr('archiveVerb');
    const archiveIcon = archived ? WS_ICON.restore : WS_ICON.archive;
    const act = archived ? restoreAct : archiveAct;
    const deleteLabel = tr('delete');
    return `<div class="kuiper-ws-entity-actions">
      <button type="button" class="icon sm kuiper-ws-entity-icon" data-act="${act}"${attr} title="${esc(archiveLabel)}" aria-label="${esc(archiveLabel)}">${archiveIcon}</button>
      <button type="button" class="icon sm kuiper-ws-entity-icon danger" data-act="${deleteAct}"${attr} title="${esc(deleteLabel)}" aria-label="${esc(deleteLabel)}">${WS_ICON.delete}</button>
    </div>`;
  }

  async function afterBoardRemoved(slug) {
    if (slug === boardSlug()) {
      const org = orgSlug();
      const boards = await KuiperStore.listOrgBoards(org).catch(() => []);
      const next = boards[0]?.slug;
      if (next) await activateBoardInPlace(next);
      else ctx.resetOrgContext?.({ slug: org });
    }
    if (selectedBoardSlug === slug) {
      selectedBoardSlug = null;
      selectedBoardId = null;
    }
    await refreshNavSidebar();
    await reloadBoard();
  }

  function orgSlug() {
    const fromUrl = new URLSearchParams(location.search).get('org');
    if (fromUrl) return fromUrl;
    return ctx.state?.()._kuiper?.organization?.slug || '';
  }

  function boardStoreOpts() {
    const org = managedOrgSlug || orgSlug();
    const stOrg = ctx.state?.()._kuiper?.organization;
    const opts = {};
    if (org) opts.org = org;
    else if (stOrg?.slug) opts.org = stOrg.slug;
    if (stOrg?.id) opts.organizationId = stOrg.id;
    return opts;
  }

  /** Identificador de tablero para la API (id evita slugs duplicados entre orgs). */
  function boardApiKey(slug = selectedBoardSlug) {
    if (slug === selectedBoardSlug && selectedBoardId) return selectedBoardId;
    const st = ctx.state?.()._kuiper;
    if (slug === boardSlug() && st?.boardId) return st.boardId;
    return slug;
  }

  function syncOrgInUrl() {
    const org = managedOrgSlug || orgSlug();
    if (!org) return;
    const u = new URL(location.href);
    if (u.searchParams.get('org') === org) return;
    u.searchParams.set('kuiper', '1');
    u.searchParams.set('org', org);
    history.replaceState(null, '', `${u.pathname}${u.search}${u.hash}`);
  }

  function boardSlug() {
    const fromUrl = KuiperStore.boardSlug();
    if (fromUrl) return fromUrl;
    return ctx.state?.()._kuiper?.boardSlug || '';
  }

  function pageRoot() {
    return host?.querySelector('.kuiper-ws-page') || null;
  }

  function bodyEl() {
    return pageRoot()?.querySelector('.kuiper-ws-body') || null;
  }

  async function afterBoardDetailMutation(slug) {
    if (slug === boardSlug()) {
      await ctx.loadKuiperBoard?.();
      ctx.render?.();
    }
    await refreshNavSidebar();
    if (tab === 'boards') {
      syncBoardListSelection();
      await refreshBoardsPanels();
      return;
    }
    await reloadBoard();
  }

  async function reloadBoard() {
    await ctx.loadKuiperBoard?.();
    if (typeof KuiperUI !== 'undefined' && KuiperUI.isWorkspaceView?.()) {
      if (tab === 'boards') {
        await refreshNavSidebar();
        syncBoardListSelection();
        await refreshBoardsPanels();
        return;
      }
      ctx.renderBoard?.();
      await refreshNavSidebar();
      await renderBody();
      return;
    }
    ctx.render?.();
    await refreshNavSidebar();
  }

  function ensureShell() {
    if (!host) return;
    if (pageRoot()) return;
    host.innerHTML = `
      <div class="kuiper-ws-page">
        <header class="kuiper-ws-head">
          <h2 id="kuiperWsAdminTitle"></h2>
          <nav class="seg kuiper-ws-tabs" role="tablist" aria-label="${esc(tr('workspaceManage'))}"></nav>
          <button type="button" class="ghost sm" data-act="ws-back"></button>
        </header>
        <div class="panel-body kuiper-ws-body kuiper-scroll"></div>
      </div>`;
    const back = host.querySelector('[data-act="ws-back"]');
    if (back) {
      back.textContent = tr('workspaceAdminBack');
      back.onclick = () => close();
    }
  }

  function setTab(next) {
    tab = next;
    renderBody();
  }

  function prepare(nextTab) {
    const next = normalizeTab(nextTab || tab);
    pendingTab = next;
    tab = next;
    managedOrgSlug = orgSlug();
    if (!selectedBoardSlug) selectedBoardSlug = boardSlug();
    const st = ctx.state?.()._kuiper;
    if (!selectedBoardId && selectedBoardSlug === boardSlug() && st?.boardId) {
      selectedBoardId = st.boardId;
    }
  }

  function tabButtons() {
    const nav = pageRoot()?.querySelector('.kuiper-ws-tabs');
    if (!nav) return;
    const tabs = [
      ['organizations', 'workspaceAdminTabOrganizations'],
      ['boards', 'workspaceAdminTabBoards'],
      ['projects', 'projects'],
      ['tags', 'tags'],
      ['sprints', 'sprints'],
    ];
    nav.innerHTML = tabs.map(([id, key]) =>
      `<button type="button" role="tab" data-tab="${id}" aria-pressed="${tab === id}">${esc(tr(key))}</button>`,
    ).join('');
    nav.querySelectorAll('[data-tab]').forEach(btn => {
      btn.onclick = () => setTab(btn.dataset.tab);
    });
  }

  function openBoardInApp(slug) {
    const org = orgSlug();
    if (typeof KuiperUI !== 'undefined' && KuiperUI.exitWorkspace) {
      KuiperUI.exitWorkspace();
    }
    if (typeof KuiperUI !== 'undefined' && KuiperUI.navigateToBoard) {
      KuiperUI.navigateToBoard(slug, org);
      return;
    }
    const u = new URL(location.href);
    u.searchParams.set('board', slug);
    if (org) u.searchParams.set('org', org);
    location.href = u.toString();
  }

  async function activateBoardInPlace(slug) {
    const org = orgSlug();
    if (typeof KuiperUI !== 'undefined' && KuiperUI.switchBoardInPlace) {
      await KuiperUI.switchBoardInPlace(slug, org);
      return;
    }
    openBoardInApp(slug);
  }

  function boardsBodyScrollEl() {
    return bodyEl();
  }

  function withPreservedScroll(fn) {
    const scroller = boardsBodyScrollEl();
    const top = scroller?.scrollTop ?? 0;
    return Promise.resolve(fn()).then(() => {
      if (scroller) scroller.scrollTop = top;
    });
  }

  function boardRowHtml(b, current, selected) {
    const isCurrent = b.slug === current;
    const isSelected = b.slug === selected;
    const muted = !isCurrent && !isSelected;
    const classes = [
      'kuiper-ws-board-row',
      muted ? 'kuiper-ws-board-row--muted' : '',
      isCurrent ? 'kuiper-ws-board-row--current' : '',
      isSelected ? 'is-selected' : '',
    ].filter(Boolean).join(' ');
    const isArchived = archivedFlag(b);
    const currentBadge = isCurrent
      ? `<span class="kuiper-ws-board-current">${esc(tr('workspaceAdminCurrentBoard'))}</span>`
      : '';
    const archBadge = isArchived
      ? `<span class="kuiper-ws-archived-badge">${esc(tr('workspaceAdminArchivedBadge'))}</span>`
      : '';
    const actions = entityActionButtons({
      archived: isArchived,
      archiveAct: 'archive-board',
      restoreAct: 'restore-board',
      deleteAct: 'delete-board',
      slugAttr: 'board-slug',
      slug: b.slug,
    });
    return `<li class="${classes}${isArchived ? ' is-archived-entity' : ''}" data-board-id="${esc(b.id)}" data-board-slug="${esc(b.slug)}" data-board-name="${esc(b.name)}">
      <button type="button" class="kuiper-ws-board-select" data-board-slug="${esc(b.slug)}" data-board-id="${esc(b.id)}">
        <span class="kuiper-ws-board-label">${isSelected ? `<strong>${esc(b.name)}</strong>` : esc(b.name)}</span>
        <span class="faint"> · ${esc(b.slug)}</span>
      </button>
      <div class="kuiper-ws-board-row-actions">
        ${archBadge}
        ${currentBadge}
        <button type="button" class="pill sm" data-act="open-board" data-board-slug="${esc(b.slug)}">${esc(tr('workspaceAdminOpenBoard'))}</button>
        ${actions}
      </div>
    </li>`;
  }

  function syncBoardListSelection() {
    const current = boardSlug();
    const ul = boardsBodyScrollEl()?.querySelector('#kuiperWsBoardList');
    if (!ul) return;
    ul.querySelectorAll('.kuiper-ws-board-row').forEach(row => {
      const slug = row.dataset.boardSlug;
      const isCurrent = slug === current;
      const isSelected = slug === selectedBoardSlug;
      const muted = !isCurrent && !isSelected;
      row.classList.toggle('kuiper-ws-board-row--muted', muted);
      row.classList.toggle('kuiper-ws-board-row--current', isCurrent);
      row.classList.toggle('is-selected', isSelected);
      const label = row.querySelector('.kuiper-ws-board-label');
      if (label) {
        const name = row.dataset.boardName || slug;
        label.innerHTML = isSelected ? `<strong>${esc(name)}</strong>` : esc(name);
      }
      let badge = row.querySelector('.kuiper-ws-board-current');
      const actions = row.querySelector('.kuiper-ws-board-row-actions');
      if (isCurrent) {
        if (!badge && actions) {
          actions.insertAdjacentHTML('afterbegin',
            `<span class="kuiper-ws-board-current">${esc(tr('workspaceAdminCurrentBoard'))}</span>`);
        }
      } else if (badge) badge.remove();
    });
  }

  function wireBoardListHandlers(root) {
    root.querySelectorAll('.kuiper-ws-board-select').forEach(btn => {
      btn.onclick = () => {
        selectedBoardSlug = btn.dataset.boardSlug;
        selectedBoardId = btn.dataset.boardId || btn.closest('.kuiper-ws-board-row')?.dataset.boardId || null;
        withPreservedScroll(async () => {
          syncBoardListSelection();
          const row = btn.closest('.kuiper-ws-board-row');
          const metaName = row?.dataset.boardName || '';
          const host = root.querySelector('#kuiperWsBoardDetail');
          if (host) await fillBoardDetail(host, selectedBoardSlug, metaName);
        });
      };
    });
    root.querySelectorAll('[data-act="open-board"]').forEach(btn => {
      btn.onclick = () => {
        selectedBoardSlug = btn.dataset.boardSlug;
        openBoardInApp(btn.dataset.boardSlug);
      };
    });
    root.querySelectorAll('[data-act="archive-board"]').forEach(btn => {
      btn.onclick = async () => {
        const slug = btn.dataset.boardSlug;
        const row = btn.closest('.kuiper-ws-board-row');
        const apiKey = row?.dataset.boardId || boardApiKey(slug);
        const name = row?.dataset.boardName || slug;
        if (!await confirmArchiveEntity(name)) return;
        try {
          await KuiperStore.patchBoard(apiKey, { archived: true }, boardStoreOpts());
          ctx.toast?.(tr('workspaceAdminArchivedToast'));
          await afterBoardRemoved(slug);
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    root.querySelectorAll('[data-act="restore-board"]').forEach(btn => {
      btn.onclick = async () => {
        const slug = btn.dataset.boardSlug;
        const row = btn.closest('.kuiper-ws-board-row');
        const apiKey = row?.dataset.boardId || boardApiKey(slug);
        try {
          await KuiperStore.patchBoard(apiKey, { archived: false }, boardStoreOpts());
          await refreshNavSidebar();
          ctx.toast?.(tr('restore'));
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    root.querySelectorAll('[data-act="delete-board"]').forEach(btn => {
      btn.onclick = async () => {
        const slug = btn.dataset.boardSlug;
        const row = btn.closest('.kuiper-ws-board-row');
        const apiKey = row?.dataset.boardId || boardApiKey(slug);
        const name = row?.dataset.boardName || slug;
        if (!await confirmDeleteEntity(name)) return;
        try {
          await KuiperStore.deleteBoard(apiKey, boardStoreOpts());
          ctx.toast?.(tr('workspaceAdminDeletedToast'));
          await afterBoardRemoved(slug);
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
  }

  async function submitNewBoard(root) {
    const org = orgSlug();
    const name = root.querySelector('#kuiperWsNewBoardName')?.value.trim();
    if (!name) {
      ctx.toast?.(tr('workspaceAdminBoardNameRequired'), null, undefined, 'warning');
      return;
    }
    try {
      const created = await KuiperStore.createOrgBoard(org, { name });
      const slug = created?.board?.slug || created?.slug;
      if (!slug) {
        await reloadBoard();
        await renderBody();
        return;
      }
      selectedBoardSlug = slug;
      selectedBoardId = created?.board?.id || created?.id || null;
      const nameInput = root.querySelector('#kuiperWsNewBoardName');
      if (nameInput) nameInput.value = '';
      await activateBoardInPlace(slug);
      await renderBody();
    } catch (err) {
      ctx.toast?.(err.message, null, 8000, 'error');
    }
  }

  function wireStageDrag(slug, stagesEl) {
    let dragRow = null;
    let startOrder = null;

    const clearTargets = () => {
      stagesEl.querySelectorAll('.kuiper-ws-stage-row').forEach(r => r.classList.remove('is-drop-target'));
    };

    const finishDrag = async () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      if (!dragRow) return;
      dragRow.classList.remove('is-dragging');
      clearTargets();
      const order = [...stagesEl.querySelectorAll('.kuiper-ws-stage-row')].map(r => r.dataset.stageId);
      const row = dragRow;
      dragRow = null;
      if (!startOrder || JSON.stringify(order) === JSON.stringify(startOrder)) return;
      try {
        await KuiperStore.reorderStages(slug, order, boardStoreOpts());
        await afterBoardDetailMutation(slug);
      } catch (err) {
        ctx.toast?.(err.message, null, 8000, 'error');
        await refreshBoardsPanels();
      }
    };

    const onPointerMove = e => {
      if (!dragRow) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const target = el?.closest?.('.kuiper-ws-stage-row');
      if (!target || target === dragRow || !stagesEl.contains(target)) return;
      clearTargets();
      target.classList.add('is-drop-target');
      const rect = target.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      if (before) stagesEl.insertBefore(dragRow, target);
      else stagesEl.insertBefore(dragRow, target.nextSibling);
    };

    const onPointerUp = () => {
      void finishDrag();
    };

    stagesEl.querySelectorAll('.grab').forEach(grip => {
      grip.onpointerdown = e => {
        if (e.button !== 0) return;
        e.preventDefault();
        dragRow = grip.closest('.kuiper-ws-stage-row');
        if (!dragRow) return;
        startOrder = [...stagesEl.querySelectorAll('.kuiper-ws-stage-row')].map(r => r.dataset.stageId);
        dragRow.classList.add('is-dragging');
        try { grip.setPointerCapture(e.pointerId); } catch (_) { /* ok */ }
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
      };
    });
  }

  async function refreshBoardsPanels() {
    const body = boardsBodyScrollEl();
    if (!body?.querySelector('#kuiperWsBoardList')) {
      await renderBoardsTab(body);
      return;
    }
    await withPreservedScroll(async () => {
      syncBoardListSelection();
      const host = body.querySelector('#kuiperWsBoardDetail');
      if (!host || !selectedBoardSlug) return;
      const row = body.querySelector(`.kuiper-ws-board-row[data-board-slug="${CSS.escape(selectedBoardSlug)}"]`);
      const metaName = row?.dataset.boardName || '';
      await fillBoardDetail(host, selectedBoardSlug, metaName);
    });
  }

  async function renderBoardsTab(body) {
    managedOrgSlug = orgSlug();
    syncOrgInUrl();
    const org = managedOrgSlug;
    const current = boardSlug();
    const boards = await KuiperStore.listOrgBoards(org, { includeArchived: showArchivedEntities }).catch(() => []);
    if (!selectedBoardSlug || !boards.some(b => b.slug === selectedBoardSlug)) {
      selectedBoardSlug = current || boards[0]?.slug || '';
      selectedBoardId = boards.find(b => b.slug === selectedBoardSlug)?.id || null;
    } else {
      selectedBoardId = boards.find(b => b.slug === selectedBoardSlug)?.id || selectedBoardId;
    }
    body.classList.add('kuiper-ws-boards-tab');
    body.innerHTML = `
      <section class="kuiper-ws-section kuiper-ws-section--compact">
        <div class="menu-label">${esc(tr('workspaceAdminNewBoard'))}</div>
        <div class="kuiper-ws-row">
          <input type="text" class="kuiper-ws-input" id="kuiperWsNewBoardName" placeholder="${esc(tr('workspaceAdminBoardName'))}" autocomplete="off">
          <button type="button" class="pill sm" data-act="add-board">${esc(tr('create'))}</button>
        </div>
        <p class="kuiper-hint">${esc(tr('workspaceAdminNewBoardHint'))}</p>
      </section>
      <section class="kuiper-ws-section kuiper-ws-section--compact">
        <div class="kuiper-ws-row kuiper-ws-section-head">
          <div class="menu-label">${esc(tr('workspaceAdminBoardList'))}</div>
          ${archivedToggleHtml()}
        </div>
        <ul class="kuiper-ws-list kuiper-ws-board-list" id="kuiperWsBoardList">
          ${boards.map(b => boardRowHtml(b, current, selectedBoardSlug)).join('')}
        </ul>
      </section>
      <div id="kuiperWsBoardDetail"></div>`;
    wireArchivedToggle(body);
    wireBoardListHandlers(body);
    const nameInput = body.querySelector('#kuiperWsNewBoardName');
    body.querySelector('[data-act="add-board"]').onclick = () => submitNewBoard(body);
    if (nameInput) {
      nameInput.onkeydown = e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitNewBoard(body);
        }
      };
    }
    const detailHost = body.querySelector('#kuiperWsBoardDetail');
    if (selectedBoardSlug && detailHost) {
      const meta = boards.find(b => b.slug === selectedBoardSlug);
      await fillBoardDetail(detailHost, selectedBoardSlug, meta?.name || '');
    } else if (detailHost) {
      detailHost.innerHTML = `<p class="kuiper-hint">${esc(tr('workspaceAdminSelectBoardHint'))}</p>`;
    }
  }

  async function fillBoardDetail(hostEl, slug, fallbackName) {
    const st = ctx.state?.();
    const isCurrent = slug === boardSlug();
    const apiKey = boardApiKey(slug);
    const bOpts = boardStoreOpts();
    let membership = { projects: [], stages: [] };
    try {
      membership = await KuiperStore.loadBoardMembership(apiKey, bOpts);
    } catch (err) {
      if (isCurrent) {
        membership = { projects: st?.projects || [], stages: st?.columns || [] };
      } else {
        ctx.toast?.(err.message, null, 8000, 'error');
      }
    }
    const orgProjects = await KuiperStore.listOrgProjects(managedOrgSlug || orgSlug()).catch(() => []);
    const linked = new Set((membership.projects || []).map(p => p.id));
    const boardName = isCurrent
      ? (st?._kuiper?.boardName || fallbackName)
      : fallbackName;
    hostEl.innerHTML = `
      <section class="kuiper-ws-section kuiper-ws-section--compact kuiper-ws-board-detail">
        <div class="menu-label">${esc(tr('workspaceAdminBoardDetail'))} · <span class="faint">${esc(slug)}</span></div>
        <div class="kuiper-ws-row">
          <input type="text" class="kuiper-ws-input" id="kuiperWsBoardName" value="${esc(boardName)}">
          <button type="button" class="pill sm" data-act="save-board-name">${esc(tr('save'))}</button>
        </div>
      </section>
      <div class="kuiper-ws-board-columns">
        <section class="kuiper-ws-board-col kuiper-ws-section kuiper-ws-section--compact kuiper-ws-projects-compact">
          <div class="menu-label">${esc(tr('workspaceAdminBoardProjects'))}</div>
          <ul class="kuiper-ws-list kuiper-ws-board-col-scroll" id="kuiperWsBoardProjects"></ul>
        </section>
        <section class="kuiper-ws-board-col kuiper-ws-section kuiper-ws-section--compact kuiper-ws-board-col-stages">
          <div class="menu-label">${esc(tr('stage'))}</div>
          <ul class="kuiper-ws-list kuiper-ws-stages kuiper-ws-board-col-scroll" id="kuiperWsStages"></ul>
          <div class="kuiper-ws-row kuiper-ws-stage-add">
            <input type="text" class="kuiper-ws-input" id="kuiperWsNewStage" placeholder="${esc(tr('workspaceAdminNewStage'))}">
            <button type="button" class="pill sm" id="kuiperWsAddStageBtn">+</button>
          </div>
        </section>
      </div>`;
    const stagesEl = hostEl.querySelector('#kuiperWsStages');
    const stageRows = membership.stages || (isCurrent ? st?.columns : []) || [];
    stageRows.forEach(s => {
      const li = document.createElement('li');
      li.className = 'kuiper-ws-list-row kuiper-ws-stage-row';
      li.dataset.stageId = s.id;
      li.innerHTML = `<span class="grab" role="button" tabindex="-1" aria-hidden="true" title="${esc(tr('reorder'))}">⠿</span>
        <input type="text" class="kuiper-ws-input" value="${esc(s.name)}" data-stage-id="${esc(s.id)}">
        <button type="button" class="icon sm danger" data-del-stage="${esc(s.id)}">×</button>`;
      stagesEl.append(li);
    });
    wireStageDrag(apiKey, stagesEl);
    stagesEl.querySelectorAll('input').forEach(inp => {
      inp.onchange = async () => {
        await KuiperStore.updateStage(apiKey, inp.dataset.stageId, { name: inp.value.trim() }, bOpts);
        await afterBoardDetailMutation(slug);
      };
    });
    stagesEl.querySelectorAll('[data-del-stage]').forEach(btn => {
      btn.onclick = async () => {
        try {
          await KuiperStore.deleteStage(apiKey, btn.dataset.delStage, bOpts);
          await afterBoardDetailMutation(slug);
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    const addStageInput = hostEl.querySelector('#kuiperWsNewStage');
    const addStageBtn = hostEl.querySelector('#kuiperWsAddStageBtn');
    const submitNewStage = async () => {
      const name = addStageInput?.value.trim();
      if (!name) return;
      try {
        await KuiperStore.createStage(apiKey, name, bOpts);
        if (addStageInput) addStageInput.value = '';
        await afterBoardDetailMutation(slug);
      } catch (err) {
        ctx.toast?.(err.message, null, 8000, 'error');
      }
    };
    if (addStageBtn) addStageBtn.onclick = () => submitNewStage();
    if (addStageInput) {
      addStageInput.onkeydown = e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitNewStage();
        }
      };
    }
    hostEl.querySelector('[data-act="save-board-name"]').onclick = async () => {
      const name = hostEl.querySelector('#kuiperWsBoardName').value.trim();
      if (!name) return;
      await KuiperStore.patchBoard(apiKey, { name }, bOpts);
      await afterBoardDetailMutation(slug);
    };
    const projEl = hostEl.querySelector('#kuiperWsBoardProjects');
    for (const p of orgProjects) {
      const li = document.createElement('li');
      li.className = 'kuiper-ws-list-row';
      const on = linked.has(p.id);
      li.innerHTML = `<label class="kuiper-ws-check"><input type="checkbox" data-pid="${esc(p.id)}" ${on ? 'checked' : ''}> <span>${esc(p.name)}</span></label>`;
      projEl.append(li);
    }
    projEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.onchange = async () => {
        try {
          syncOrgInUrl();
          const linkOpts = boardStoreOpts();
          if (cb.checked) await KuiperStore.linkBoardProject(apiKey, cb.dataset.pid, linkOpts);
          else await KuiperStore.unlinkBoardProject(apiKey, cb.dataset.pid, linkOpts);
          await afterBoardDetailMutation(slug);
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
          cb.checked = !cb.checked;
        }
      };
    });
  }

  async function setActiveOrganization(slug) {
    if (typeof KuiperUI !== 'undefined' && KuiperUI.switchOrganization) {
      await KuiperUI.switchOrganization(slug);
      return;
    }
    const u = new URL(location.href);
    u.searchParams.set('org', slug);
    location.assign(u.toString());
  }

  async function renderOrganizationsTab(body) {
    syncOrgInUrl();
    const orgs = await KuiperStore.listOrganizations({ includeArchived: showArchivedEntities });
    const active = orgSlug();
    body.innerHTML = `
      <section class="kuiper-ws-section kuiper-ws-section--compact">
        <div class="menu-label">${esc(tr('workspaceAdminNewOrganization'))}</div>
        <div class="kuiper-ws-row">
          <input type="text" class="kuiper-ws-input" id="kuiperWsNewOrgName" placeholder="${esc(tr('workspaceAdminOrgName'))}" autocomplete="off">
          <button type="button" class="pill sm" data-act="add-org">${esc(tr('create'))}</button>
        </div>
        <p class="kuiper-hint">${esc(tr('workspaceAdminNewOrgHint'))}</p>
      </section>
      <section class="kuiper-ws-section kuiper-ws-section--compact">
        <div class="kuiper-ws-row kuiper-ws-section-head">
          <div class="menu-label">${esc(tr('workspaceAdminOrgList'))}</div>
          ${archivedToggleHtml()}
        </div>
        <ul class="kuiper-ws-list" id="kuiperWsOrgList"></ul>
      </section>`;
    wireArchivedToggle(body);
    const ul = body.querySelector('#kuiperWsOrgList');
    for (const o of orgs) {
      const isActive = o.slug === active;
      const isArchived = archivedFlag(o);
      const li = document.createElement('li');
      li.className = `kuiper-ws-list-row kuiper-ws-entity-row kuiper-ws-org-row${isActive ? ' is-active-org' : ''}${isArchived ? ' is-archived-entity' : ''}`;
      li.dataset.orgSlug = o.slug;
      const activePart = isActive
        ? `<span class="kuiper-ws-board-current">${esc(tr('workspaceAdminActiveOrg'))}</span>`
        : `<button type="button" class="pill sm" data-act="set-active-org" data-org-slug="${esc(o.slug)}">${esc(tr('workspaceAdminSetActiveOrg'))}</button>`;
      const archBadge = isArchived
        ? `<span class="kuiper-ws-archived-badge">${esc(tr('workspaceAdminArchivedBadge'))}</span>`
        : '';
      const actions = entityActionButtons({
        archived: isArchived,
        archiveAct: 'archive-org',
        restoreAct: 'restore-org',
        deleteAct: 'delete-org',
        slugAttr: 'org-slug',
        slug: o.slug,
      });
      li.innerHTML = `<input type="text" class="kuiper-ws-input kuiper-ws-entity-name" value="${esc(o.name)}" data-org-slug="${esc(o.slug)}">
        <span class="faint kuiper-ws-entity-slug">${esc(o.slug)}</span>
        <div class="kuiper-ws-entity-status">${archBadge}${activePart}</div>
        ${actions}`;
      ul.append(li);
    }
    ul.querySelectorAll('input[data-org-slug]').forEach(inp => {
      inp.onchange = async () => {
        const name = inp.value.trim();
        if (!name) return;
        await KuiperStore.patchOrganization(inp.dataset.orgSlug, { name });
        await ctx.loadKuiperBoard?.();
        await refreshNavSidebar();
        renderBody();
      };
    });
    ul.querySelectorAll('[data-act="set-active-org"]').forEach(btn => {
      btn.onclick = async () => {
        await setActiveOrganization(btn.dataset.orgSlug);
        await renderBody();
      };
    });
    ul.querySelectorAll('[data-act="archive-org"]').forEach(btn => {
      btn.onclick = async () => {
        const slug = btn.dataset.orgSlug;
        const o = orgs.find(x => x.slug === slug);
        const name = o?.name || slug;
        if (!await confirmArchiveEntity(name)) return;
        try {
          await KuiperStore.patchOrganization(slug, { archived: true });
          if (slug === active) {
            const fallback = orgs.find(x => x.slug !== slug && !archivedFlag(x))?.slug;
            if (fallback) await setActiveOrganization(fallback);
            else {
              const u = new URL(location.href);
              u.searchParams.delete('board');
              history.replaceState(null, '', `${u.pathname}${u.search}${u.hash}`);
              ctx.resetOrgContext?.({ slug });
            }
          }
          await refreshNavSidebar();
          ctx.toast?.(tr('workspaceAdminArchivedToast'));
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    ul.querySelectorAll('[data-act="restore-org"]').forEach(btn => {
      btn.onclick = async () => {
        const slug = btn.dataset.orgSlug;
        try {
          await KuiperStore.patchOrganization(slug, { archived: false });
          await refreshNavSidebar();
          ctx.toast?.(tr('restore'));
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    ul.querySelectorAll('[data-act="delete-org"]').forEach(btn => {
      btn.onclick = async () => {
        const slug = btn.dataset.orgSlug;
        const o = orgs.find(x => x.slug === slug);
        const name = o?.name || slug;
        if (!await confirmDeleteEntity(name)) return;
        try {
          await KuiperStore.deleteOrganization(slug);
          if (slug === active) {
            const fallback = orgs.find(x => x.slug !== slug)?.slug;
            if (fallback) await setActiveOrganization(fallback);
            else ctx.resetOrgContext?.({});
          }
          await refreshNavSidebar();
          ctx.toast?.(tr('workspaceAdminDeletedToast'));
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    body.querySelector('[data-act="add-org"]').onclick = async () => {
      const name = body.querySelector('#kuiperWsNewOrgName')?.value.trim();
      if (!name) {
        ctx.toast?.(tr('workspaceAdminOrgNameRequired'), null, undefined, 'warning');
        return;
      }
      try {
        const created = await KuiperStore.createOrganization({ name });
        body.querySelector('#kuiperWsNewOrgName').value = '';
        await setActiveOrganization(created.slug);
        if (typeof KuiperUI !== 'undefined') await KuiperUI.loadNavigation?.();
        await renderBody();
      } catch (err) {
        ctx.toast?.(err.message, null, 8000, 'error');
      }
    };
  }

  async function onActiveOrgChanged(slug) {
    if (tab === 'organizations') await renderBody();
    else if (tab === 'boards') await refreshBoardsPanels();
    if (!selectedBoardSlug || selectedBoardSlug === boardSlug()) {
      selectedBoardSlug = boardSlug();
    }
  }

  async function renderProjectsTab(body) {
    syncOrgInUrl();
    const projects = await KuiperStore.listOrgProjects(orgSlug(), { includeArchived: showArchivedEntities });
    body.innerHTML = `
      <section class="kuiper-ws-section">
        <p class="kuiper-hint">${esc(tr('workspaceAdminOneOrgPerProject'))}</p>
        <div class="kuiper-ws-row">
          <input type="text" class="kuiper-ws-input" id="kuiperWsNewProj" placeholder="${esc(tr('workspaceAdminNewProject'))}">
          <button type="button" class="pill sm" data-act="add-project">${esc(tr('create'))}</button>
        </div>
        <div class="kuiper-ws-row kuiper-ws-section-head">
          <div class="menu-label">${esc(tr('projects'))}</div>
          ${archivedToggleHtml()}
        </div>
        <ul class="kuiper-ws-list" id="kuiperWsProjects"></ul>
      </section>`;
    wireArchivedToggle(body);
    const ul = body.querySelector('#kuiperWsProjects');
    for (const p of projects) {
      const isArchived = archivedFlag(p);
      const li = document.createElement('li');
      li.className = `kuiper-ws-list-row kuiper-ws-entity-row kuiper-ws-project-row${isArchived ? ' is-archived-entity' : ''}`;
      const archBadge = isArchived
        ? `<span class="kuiper-ws-archived-badge">${esc(tr('workspaceAdminArchivedBadge'))}</span>`
        : '';
      const actions = entityActionButtons({
        archived: isArchived,
        archiveAct: 'archive-project',
        restoreAct: 'restore-project',
        deleteAct: 'delete-project',
        slugAttr: 'project-id',
        slug: p.id,
      });
      li.innerHTML = `<input type="text" class="kuiper-ws-input kuiper-ws-entity-name" value="${esc(p.name)}" data-pid="${esc(p.id)}">
        <div class="kuiper-ws-entity-status">${archBadge}</div>
        ${actions}`;
      ul.append(li);
    }
    ul.querySelectorAll('input[data-pid]').forEach(inp => {
      inp.onchange = async () => {
        const name = inp.value.trim();
        if (!name) return;
        await KuiperStore.patchProject(inp.dataset.pid, { name });
        await ctx.loadKuiperBoard?.();
        await refreshNavSidebar();
        renderBody();
      };
    });
    ul.querySelectorAll('[data-act="archive-project"]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.projectId;
        const p = projects.find(x => x.id === id);
        const name = p?.name || id;
        if (!await confirmArchiveEntity(name)) return;
        try {
          await KuiperStore.patchProject(id, { archived: true });
          ctx.toast?.(tr('workspaceAdminArchivedToast'));
          await reloadBoard();
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    ul.querySelectorAll('[data-act="restore-project"]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.projectId;
        try {
          await KuiperStore.patchProject(id, { archived: false });
          ctx.toast?.(tr('restore'));
          await reloadBoard();
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    ul.querySelectorAll('[data-act="delete-project"]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.projectId;
        const p = projects.find(x => x.id === id);
        const name = p?.name || id;
        if (!await confirmDeleteEntity(name)) return;
        try {
          await KuiperStore.deleteProject(id);
          ctx.toast?.(tr('workspaceAdminDeletedToast'));
          await reloadBoard();
          await renderBody();
        } catch (err) {
          ctx.toast?.(err.message, null, 8000, 'error');
        }
      };
    });
    body.querySelector('[data-act="add-project"]').onclick = async () => {
      const name = body.querySelector('#kuiperWsNewProj').value.trim();
      if (!name) return;
      await KuiperStore.createOrgProject(orgSlug(), { name });
      await reloadBoard();
      renderBody();
    };
  }

  async function renderTagsTab(body) {
    const slug = boardSlug();
    const tags = await KuiperStore.listBoardTags(slug);
    body.innerHTML = `
      <section class="kuiper-ws-section">
        <div class="kuiper-ws-row">
          <input type="text" class="kuiper-ws-input" id="kuiperWsNewTag" placeholder="${esc(tr('workspaceAdminNewTag'))}">
          <button type="button" class="pill sm" data-act="add-tag">${esc(tr('create'))}</button>
        </div>
        <ul class="kuiper-ws-list" id="kuiperWsTags"></ul>
      </section>`;
    const ul = body.querySelector('#kuiperWsTags');
    for (const tag of tags) {
      const li = document.createElement('li');
      li.className = 'kuiper-ws-list-row';
      li.innerHTML = `<input type="text" class="kuiper-ws-input" value="${esc(tag.name)}" data-tag-id="${esc(tag.id)}">
        <button type="button" class="icon sm danger" data-del-tag="${esc(tag.id)}">×</button>`;
      ul.append(li);
    }
    ul.querySelectorAll('input').forEach(inp => {
      inp.onchange = async () => {
        const newName = inp.value.trim();
        if (!newName) return;
        await KuiperStore.renameTag(inp.dataset.tagId, newName);
        await reloadBoard();
        renderBody();
      };
    });
    ul.querySelectorAll('[data-del-tag]').forEach(btn => {
      btn.onclick = async () => {
        await KuiperStore.deleteTag(btn.dataset.delTag);
        await reloadBoard();
        renderBody();
      };
    });
    body.querySelector('[data-act="add-tag"]').onclick = async () => {
      const name = body.querySelector('#kuiperWsNewTag').value.trim();
      if (!name) return;
      await KuiperStore.createBoardTag(boardSlug(), name);
      await reloadBoard();
      renderBody();
    };
  }

  async function renderSprintsTab(body) {
    const st = ctx.state?.();
    const sprints = st?.sprints || [];
    const projects = st?.projects || [];
    body.innerHTML = `
      <section class="kuiper-ws-section">
        <div class="menu-label">${esc(tr('workspaceAdminNewSprint'))}</div>
        <div class="kuiper-ws-row kuiper-ws-sprint-form">
          <input type="text" class="kuiper-ws-input" id="kuiperWsSprintName" placeholder="${esc(tr('sprint'))}">
          <input type="date" class="kuiper-ws-input" id="kuiperWsSprintStart">
          <input type="date" class="kuiper-ws-input" id="kuiperWsSprintEnd">
          <select class="kuiper-ws-input" id="kuiperWsSprintProj" multiple size="3">
            ${projects.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
          </select>
          <button type="button" class="pill sm" data-act="add-sprint">${esc(tr('create'))}</button>
        </div>
      </section>
      <section class="kuiper-ws-section">
        <ul class="kuiper-ws-list" id="kuiperWsSprints"></ul>
      </section>`;
    const ul = body.querySelector('#kuiperWsSprints');
    for (const s of BoardCore.sortSprintsForUi(sprints)) {
      const li = document.createElement('li');
      li.className = 'kuiper-ws-list-row';
      li.innerHTML = `<span><strong>${esc(s.name)}</strong> <span class="faint">${esc(s.startDate || s.start_date || '')} – ${esc(s.endDate || s.end_date || '')}</span></span>
        <button type="button" class="icon sm danger" data-del-sprint="${esc(s.id)}">×</button>`;
      ul.append(li);
    }
    ul.querySelectorAll('[data-del-sprint]').forEach(btn => {
      btn.onclick = async () => {
        await KuiperStore.deleteSprint(btn.dataset.delSprint);
        await reloadBoard();
        renderBody();
      };
    });
    body.querySelector('[data-act="add-sprint"]').onclick = async () => {
      const name = body.querySelector('#kuiperWsSprintName').value.trim();
      const start = body.querySelector('#kuiperWsSprintStart').value;
      const end = body.querySelector('#kuiperWsSprintEnd').value;
      const sel = body.querySelector('#kuiperWsSprintProj');
      const project_ids = [...sel.selectedOptions].map(o => o.value);
      if (!name || !start || !end || !project_ids.length) {
        ctx.toast?.(tr('workspaceAdminSprintInvalid'), null, undefined, 'warning');
        return;
      }
      await KuiperStore.createOrgSprint(orgSlug(), {
        name, start_date: start, end_date: end, project_ids,
      });
      await reloadBoard();
      renderBody();
    };
  }

  async function renderBody() {
    const body = bodyEl();
    if (!body) return;
    tabButtons();
    const title = pageRoot()?.querySelector('#kuiperWsAdminTitle');
    if (title) title.textContent = tr('workspaceManage');
    body.innerHTML = `<p class="kuiper-hint">${esc(tr('loading'))}…</p>`;
    try {
      if (tab === 'organizations') await renderOrganizationsTab(body);
      else if (tab === 'boards') await renderBoardsTab(body);
      else if (tab === 'projects') await renderProjectsTab(body);
      else if (tab === 'tags') await renderTagsTab(body);
      else if (tab === 'sprints') await renderSprintsTab(body);
    } catch (err) {
      body.innerHTML = `<p class="kuiper-cal-empty">${esc(err.message)}</p>`;
    }
  }

  function render(boardEl) {
    if (!orgSlug()) {
      boardEl.className = 'board kuiper-ws-board';
      boardEl.innerHTML = `<p class="kuiper-view-missing-msg">${esc(tr('workspaceAdminNeedsOrg'))}</p>`;
      return;
    }
    host = boardEl;
    if (pendingTab) {
      tab = pendingTab;
      pendingTab = null;
    }
    boardEl.className = 'board kuiper-ws-board';
    ensureShell();
    renderBody();
  }

  function open(nextTab) {
    if (typeof KuiperUI !== 'undefined' && KuiperUI.enterWorkspace) {
      KuiperUI.enterWorkspace(nextTab);
      return;
    }
    if (!orgSlug()) {
      ctx.toast?.(tr('workspaceAdminNeedsOrg'), null, undefined, 'warning');
      return;
    }
    prepare(nextTab);
    ctx.renderBoard?.();
  }

  function close() {
    if (typeof KuiperUI !== 'undefined' && KuiperUI.exitWorkspace) {
      KuiperUI.exitWorkspace();
    }
  }

  function init(hooks) {
    ctx = hooks || {};
  }

  /** Tablero principal reordenó etapas (misma fuente: API). Refresca lista en pestaña Boards si aplica. */
  async function onBoardStagesChanged(slug) {
    const s = slug || boardSlug();
    if (!s || s !== selectedBoardSlug) return;
    if (tab === 'boards') await refreshBoardsPanels();
  }

  return { init, open, close, render, prepare, setTab, onBoardStagesChanged, onActiveOrgChanged };
})();

if (typeof window !== 'undefined') window.KuiperWorkspaceAdmin = KuiperWorkspaceAdmin;
if (typeof module !== 'undefined') module.exports = { KuiperWorkspaceAdmin };
