/* Administración workspace Kuiper — tableros, proyectos, tags, sprints (vista en #board) */
const KuiperWorkspaceAdmin = (() => {
  let ctx = {};
  let host = null;
  let tab = 'boards';
  let pendingTab = null;

  function tr(k, v) {
    return ctx.tr?.(k, v) ?? k;
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function orgSlug() {
    return ctx.state?.()._kuiper?.organization?.slug
      || new URLSearchParams(location.search).get('org')
      || '';
  }

  function boardSlug() {
    return ctx.state?.()._kuiper?.boardSlug || KuiperStore.boardSlug();
  }

  function pageRoot() {
    return host?.querySelector('.kuiper-ws-page') || null;
  }

  function bodyEl() {
    return pageRoot()?.querySelector('.kuiper-ws-body') || null;
  }

  async function reloadBoard() {
    await ctx.loadKuiperBoard?.();
    ctx.render?.();
    if (typeof KuiperUI !== 'undefined') {
      KuiperUI.renderSidebar();
      KuiperUI.refreshFilters?.();
    }
    if (typeof KuiperUI !== 'undefined' && KuiperUI.isWorkspaceView?.()) {
      await renderBody();
    }
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
    pendingTab = nextTab || tab || 'board';
    tab = pendingTab;
  }

  function tabButtons() {
    const nav = pageRoot()?.querySelector('.kuiper-ws-tabs');
    if (!nav) return;
    const tabs = [
      ['boards', 'workspaceAdminTabBoards'],
      ['board', 'workspaceAdminTabBoard'],
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

  function navigateToBoard(slug) {
    const u = new URL(location.href);
    u.searchParams.set('board', slug);
    const org = orgSlug();
    if (org) u.searchParams.set('org', org);
    location.href = u.toString();
  }

  async function renderBoardsTab(body) {
    const org = orgSlug();
    const current = boardSlug();
    const boards = await KuiperStore.listOrgBoards(org).catch(() => []);
    const orgProjects = await KuiperStore.listOrgProjects(org).catch(() => []);
    body.innerHTML = `
      <section class="kuiper-ws-section">
        <div class="menu-label">${esc(tr('workspaceAdminNewBoard'))}</div>
        <div class="kuiper-ws-row">
          <input type="text" class="kuiper-ws-input" id="kuiperWsNewBoardName" placeholder="${esc(tr('workspaceAdminBoardName'))}">
          <button type="button" class="pill sm" data-act="add-board">${esc(tr('create'))}</button>
        </div>
        <select class="kuiper-ws-input" id="kuiperWsNewBoardProjects" multiple size="${Math.min(4, Math.max(2, orgProjects.length || 2))}">
          ${orgProjects.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}
        </select>
        <p class="kuiper-hint">${esc(tr('workspaceAdminNewBoardHint'))}</p>
      </section>
      <section class="kuiper-ws-section">
        <div class="menu-label">${esc(tr('workspaceAdminBoardList'))}</div>
        <ul class="kuiper-ws-list" id="kuiperWsBoardList"></ul>
      </section>`;
    const ul = body.querySelector('#kuiperWsBoardList');
    for (const b of boards) {
      const li = document.createElement('li');
      li.className = 'kuiper-ws-list-row';
      const active = b.slug === current;
      li.innerHTML = `<button type="button" class="ghost sm kuiper-ws-board-link" data-board-slug="${esc(b.slug)}">
        ${active ? `<strong>${esc(b.name)}</strong>` : esc(b.name)}
        <span class="faint"> · ${esc(b.slug)}</span></button>
        ${active ? `<span class="faint">${esc(tr('workspaceAdminCurrentBoard'))}</span>` : ''}`;
      ul.append(li);
    }
    ul.querySelectorAll('[data-board-slug]').forEach(btn => {
      btn.onclick = () => {
        if (btn.dataset.boardSlug !== current) navigateToBoard(btn.dataset.boardSlug);
      };
    });
    body.querySelector('[data-act="add-board"]').onclick = async () => {
      const name = body.querySelector('#kuiperWsNewBoardName').value.trim();
      const sel = body.querySelector('#kuiperWsNewBoardProjects');
      const project_ids = [...sel.selectedOptions].map(o => o.value);
      if (!name) {
        ctx.toast?.(tr('workspaceAdminBoardNameRequired'));
        return;
      }
      try {
        const created = await KuiperStore.createOrgBoard(org, { name, project_ids });
        const slug = created?.board?.slug || created?.slug;
        if (slug) navigateToBoard(slug);
        else await reloadBoard();
      } catch (err) {
        ctx.toast?.(err.message);
      }
    };
  }

  async function renderBoardTab(body) {
    const st = ctx.state?.();
    const slug = boardSlug();
    let membership = { projects: st?.projects || [], stages: st?.columns || [] };
    try {
      membership = await KuiperStore.loadBoardMembership(slug);
    } catch (_) { /* use state */ }
    const orgProjects = await KuiperStore.listOrgProjects(orgSlug()).catch(() => []);
    const linked = new Set((membership.projects || []).map(p => p.id));
    body.innerHTML = `
      <section class="kuiper-ws-section">
        <div class="menu-label">${esc(tr('workspaceAdminBoardName'))}</div>
        <div class="kuiper-ws-row">
          <input type="text" class="kuiper-ws-input" id="kuiperWsBoardName" value="${esc(st?._kuiper?.boardName || '')}">
          <button type="button" class="pill sm" data-act="save-board-name">${esc(tr('save'))}</button>
        </div>
      </section>
      <section class="kuiper-ws-section">
        <div class="menu-label">${esc(tr('stage'))}</div>
        <ul class="kuiper-ws-list" id="kuiperWsStages"></ul>
        <div class="kuiper-ws-row">
          <input type="text" class="kuiper-ws-input" id="kuiperWsNewStage" placeholder="${esc(tr('workspaceAdminNewStage'))}">
          <button type="button" class="pill sm" data-act="add-stage">+</button>
        </div>
      </section>
      <section class="kuiper-ws-section">
        <div class="menu-label">${esc(tr('workspaceAdminBoardProjects'))}</div>
        <ul class="kuiper-ws-list" id="kuiperWsBoardProjects"></ul>
      </section>`;
    const stagesEl = body.querySelector('#kuiperWsStages');
    (membership.stages || st?.columns || []).forEach(s => {
      const li = document.createElement('li');
      li.className = 'kuiper-ws-list-row';
      li.innerHTML = `<input type="text" class="kuiper-ws-input" value="${esc(s.name)}" data-stage-id="${esc(s.id)}">
        <button type="button" class="icon sm danger" data-del-stage="${esc(s.id)}">×</button>`;
      stagesEl.append(li);
    });
    stagesEl.querySelectorAll('input').forEach(inp => {
      inp.onchange = async () => {
        await KuiperStore.updateStage(slug, inp.dataset.stageId, { name: inp.value.trim() });
        await reloadBoard();
        renderBody();
      };
    });
    stagesEl.querySelectorAll('[data-del-stage]').forEach(btn => {
      btn.onclick = async () => {
        try {
          await KuiperStore.deleteStage(slug, btn.dataset.delStage);
          await reloadBoard();
          renderBody();
        } catch (err) {
          ctx.toast?.(err.message);
        }
      };
    });
    body.querySelector('[data-act="add-stage"]').onclick = async () => {
      const name = body.querySelector('#kuiperWsNewStage').value.trim();
      if (!name) return;
      await KuiperStore.createStage(slug, name);
      await reloadBoard();
      renderBody();
    };
    body.querySelector('[data-act="save-board-name"]').onclick = async () => {
      const name = body.querySelector('#kuiperWsBoardName').value.trim();
      if (!name) return;
      await KuiperStore.patchBoard(slug, { name });
      await reloadBoard();
      renderBody();
    };
    const projEl = body.querySelector('#kuiperWsBoardProjects');
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
          if (cb.checked) await KuiperStore.linkBoardProject(slug, cb.dataset.pid);
          else await KuiperStore.unlinkBoardProject(slug, cb.dataset.pid);
          await reloadBoard();
        } catch (err) {
          ctx.toast?.(err.message);
          cb.checked = !cb.checked;
        }
      };
    });
  }

  async function renderProjectsTab(body) {
    const projects = await KuiperStore.listOrgProjects(orgSlug());
    body.innerHTML = `
      <section class="kuiper-ws-section">
        <div class="kuiper-ws-row">
          <input type="text" class="kuiper-ws-input" id="kuiperWsNewProj" placeholder="${esc(tr('workspaceAdminNewProject'))}">
          <button type="button" class="pill sm" data-act="add-project">${esc(tr('create'))}</button>
        </div>
        <ul class="kuiper-ws-list" id="kuiperWsProjects"></ul>
      </section>`;
    const ul = body.querySelector('#kuiperWsProjects');
    for (const p of projects) {
      const li = document.createElement('li');
      li.className = 'kuiper-ws-list-row';
      li.innerHTML = `<input type="text" class="kuiper-ws-input" value="${esc(p.name)}" data-pid="${esc(p.id)}">
        <button type="button" class="icon sm danger" data-del-proj="${esc(p.id)}">×</button>`;
      ul.append(li);
    }
    ul.querySelectorAll('input').forEach(inp => {
      inp.onchange = async () => {
        await KuiperStore.patchProject(inp.dataset.pid, { name: inp.value.trim() });
        await reloadBoard();
        renderBody();
      };
    });
    ul.querySelectorAll('[data-del-proj]').forEach(btn => {
      btn.onclick = async () => {
        try {
          await KuiperStore.deleteProject(btn.dataset.delProj);
          await reloadBoard();
          renderBody();
        } catch (err) {
          ctx.toast?.(err.message);
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
        ctx.toast?.(tr('workspaceAdminSprintInvalid'));
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
      if (tab === 'boards') await renderBoardsTab(body);
      else if (tab === 'board') await renderBoardTab(body);
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
      ctx.toast?.(tr('workspaceAdminNeedsOrg'));
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

  return { init, open, close, render, prepare, setTab };
})();

if (typeof window !== 'undefined') window.KuiperWorkspaceAdmin = KuiperWorkspaceAdmin;
if (typeof module !== 'undefined') module.exports = { KuiperWorkspaceAdmin };
