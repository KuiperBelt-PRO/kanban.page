/* Kuiper Kanban — cliente HTTP para modo ?kuiper=1 */
const KuiperStore = (() => {
  const boardSlug = () => new URLSearchParams(location.search).get('board') || 'hub-delivery';

  function activeOrgSlug() {
    return new URLSearchParams(location.search).get('org') || '';
  }

  function boardApiPath(slugOrId, suffix = '', opts = {}) {
    const s = encodeURIComponent(slugOrId || boardSlug());
    const params = new URLSearchParams();
    const org = opts.org || activeOrgSlug();
    if (org) params.set('org', org);
    if (opts.organizationId) params.set('organization_id', opts.organizationId);
    const q = params.toString() ? `?${params}` : '';
    return `/api/v1/boards/${s}${suffix}${q}`;
  }

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body != null && headers['Content-Type'] == null) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(path, { ...options, headers });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) {
      throw new Error(payload.error?.message || `HTTP ${res.status}`);
    }
    return payload.data ?? payload;
  }

  async function loadBoard(slug, opts = {}) {
    return request(boardApiPath(slug, '/state', opts));
  }

  async function loadBoardSnapshot(slug, opts = {}) {
    return request(boardApiPath(slug, '', opts));
  }

  async function loadNavigation() {
    return request('/api/v1/navigation');
  }

  async function patchCard(id, body) {
    return request(`/api/v1/cards/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async function deleteCard(id) {
    return request(`/api/v1/cards/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async function createCard(body) {
    return request('/api/v1/cards', {
      method: 'POST',
      body: JSON.stringify({ ...body, board_slug: boardSlug() }),
    });
  }

  async function loadCardDetail(id) {
    return request(`/api/v1/cards/${encodeURIComponent(id)}/detail`);
  }

  async function addCardLink(cardId, body) {
    return request(`/api/v1/cards/${encodeURIComponent(cardId)}/links`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async function removeCardLink(cardId, linkId) {
    return request(`/api/v1/cards/${encodeURIComponent(cardId)}/links/${encodeURIComponent(linkId)}`, {
      method: 'DELETE',
    });
  }

  async function addComment(cardId, body) {
    return request(`/api/v1/cards/${encodeURIComponent(cardId)}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }

  async function deleteComment(cardId, commentId) {
    return request(`/api/v1/cards/${encodeURIComponent(cardId)}/comments/${encodeURIComponent(commentId)}`, {
      method: 'DELETE',
    });
  }

  async function updateComment(cardId, commentId, body) {
    return request(`/api/v1/cards/${encodeURIComponent(cardId)}/comments/${encodeURIComponent(commentId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    });
  }

  async function addTimeEntry(cardId, body) {
    return request(`/api/v1/cards/${encodeURIComponent(cardId)}/time-entries`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async function stopTimer(cardId, entryId, { label } = {}) {
    return request(`/api/v1/cards/${encodeURIComponent(cardId)}/time-entries/${encodeURIComponent(entryId)}/stop`, {
      method: 'POST',
      body: JSON.stringify({ label }),
    });
  }

  async function discardTimer(cardId, entryId) {
    return request(`/api/v1/cards/${encodeURIComponent(cardId)}/time-entries/${encodeURIComponent(entryId)}/discard`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async function updateTimeEntry(cardId, entryId, body) {
    return request(`/api/v1/cards/${encodeURIComponent(cardId)}/time-entries/${encodeURIComponent(entryId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async function deleteTimeEntry(cardId, entryId) {
    return request(`/api/v1/cards/${encodeURIComponent(cardId)}/time-entries/${encodeURIComponent(entryId)}`, {
      method: 'DELETE',
    });
  }

  async function listOrganizations({ includeArchived = false } = {}) {
    const q = includeArchived ? '?include_archived=1' : '';
    const data = await request(`/api/v1/organizations${q}`);
    return data.organizations || [];
  }

  async function deleteOrganization(orgSlug) {
    return request(`/api/v1/organizations/${encodeURIComponent(orgSlug)}`, { method: 'DELETE' });
  }

  async function deleteBoard(slug, opts = {}) {
    return request(boardApiPath(slug, '', opts), { method: 'DELETE' });
  }

  async function createOrganization(body) {
    const data = await request('/api/v1/organizations', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return data.organization;
  }

  async function patchOrganization(orgSlug, body) {
    const data = await request(`/api/v1/organizations/${encodeURIComponent(orgSlug)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return data.organization;
  }

  async function listOrgProjects(orgSlug, { includeArchived = false } = {}) {
    const q = includeArchived ? '?include_archived=1' : '';
    const data = await request(`/api/v1/organizations/${encodeURIComponent(orgSlug)}/projects${q}`);
    return data.projects || [];
  }

  async function listOrgBoards(orgSlug, { includeArchived = false } = {}) {
    const q = includeArchived ? '?include_archived=1' : '';
    const data = await request(`/api/v1/organizations/${encodeURIComponent(orgSlug)}/boards${q}`);
    return data.boards || [];
  }

  async function createOrgBoard(orgSlug, body) {
    return request(`/api/v1/organizations/${encodeURIComponent(orgSlug)}/boards`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async function createOrgProject(orgSlug, body) {
    const data = await request(`/api/v1/organizations/${encodeURIComponent(orgSlug)}/projects`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return data.project;
  }

  async function patchProject(id, body) {
    const data = await request(`/api/v1/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return data.project;
  }

  async function deleteProject(id, { force = false } = {}) {
    return request(`/api/v1/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ force }),
    });
  }

  async function projectDeletionImpact(id) {
    const data = await request(`/api/v1/projects/${encodeURIComponent(id)}/deletion-impact`);
    return data.impact;
  }

  async function listOrgTags(orgSlug) {
    const data = await request(`/api/v1/organizations/${encodeURIComponent(orgSlug)}/tags`);
    return data.tags || [];
  }

  async function createOrgTag(orgSlug, name) {
    const data = await request(`/api/v1/organizations/${encodeURIComponent(orgSlug)}/tags`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return data.tag;
  }

  async function patchBoard(slug, body, opts = {}) {
    const data = await request(boardApiPath(slug, '', opts), {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return data.board;
  }

  async function loadBoardMembership(slug, opts = {}) {
    return request(boardApiPath(slug, '/membership', opts));
  }

  async function linkBoardProject(slug, projectId, opts = {}) {
    return request(boardApiPath(slug, '/projects', opts), {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId }),
    });
  }

  async function unlinkBoardProject(slug, projectId, opts = {}) {
    return request(boardApiPath(slug, `/projects/${encodeURIComponent(projectId)}`, opts), {
      method: 'DELETE',
    });
  }

  async function createStage(slug, name, opts = {}) {
    const data = await request(boardApiPath(slug, '/stages', opts), {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return data.stage;
  }

  async function updateStage(slug, stageId, body, opts = {}) {
    const data = await request(boardApiPath(slug, `/stages/${encodeURIComponent(stageId)}`, opts), {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return data.stage;
  }

  async function deleteStage(slug, stageId, opts = {}) {
    return request(boardApiPath(slug, `/stages/${encodeURIComponent(stageId)}`, opts), {
      method: 'DELETE',
    });
  }

  async function reorderStages(slug, order, opts = {}) {
    const data = await request(boardApiPath(slug, '/stages/reorder', opts), {
      method: 'PATCH',
      body: JSON.stringify({ order }),
    });
    return data.stages || [];
  }

  async function listProjectEpics(projectId) {
    return request(`/api/v1/projects/${encodeURIComponent(projectId)}/epics`);
  }

  async function createEpic(projectId, body) {
    const data = await request(`/api/v1/projects/${encodeURIComponent(projectId)}/epics`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return data.epic;
  }

  async function patchEpic(id, body) {
    const data = await request(`/api/v1/epics/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return data.epic;
  }

  async function deleteEpic(id) {
    return request(`/api/v1/epics/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async function listBoardTags(slug, opts = {}) {
    const data = await request(boardApiPath(slug, '/tags', opts));
    return data.tags || [];
  }

  async function createBoardTag(slug, name, opts = {}) {
    const data = await request(boardApiPath(slug, '/tags', opts), {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return data.tag;
  }

  async function renameTag(id, name) {
    const data = await request(`/api/v1/tags/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    return data.tag;
  }

  async function deleteTag(id) {
    return request(`/api/v1/tags/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async function listOrgSprints(orgSlug) {
    const data = await request(`/api/v1/organizations/${encodeURIComponent(orgSlug)}/sprints`);
    return data.sprints || [];
  }

  async function createOrgSprint(orgSlug, body) {
    const data = await request(`/api/v1/organizations/${encodeURIComponent(orgSlug)}/sprints`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return data.sprint;
  }

  async function deleteSprint(id) {
    return request(`/api/v1/sprints/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async function patchSprint(id, body) {
    const data = await request(`/api/v1/sprints/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return data.sprint;
  }

  return {
    boardSlug,
    loadBoard,
    loadBoardSnapshot,
    loadNavigation,
    listOrganizations,
    createOrganization,
    patchOrganization,
    deleteOrganization,
    deleteBoard,
    patchCard,
    deleteCard,
    createCard,
    listOrgProjects,
    listOrgBoards,
    createOrgBoard,
    createOrgProject,
    patchProject,
    deleteProject,
    projectDeletionImpact,
    patchBoard,
    loadBoardMembership,
    linkBoardProject,
    unlinkBoardProject,
    createStage,
    updateStage,
    deleteStage,
    reorderStages,
    listProjectEpics,
    createEpic,
    patchEpic,
    deleteEpic,
    listBoardTags,
    listOrgTags,
    createBoardTag,
    createOrgTag,
    renameTag,
    deleteTag,
    listOrgSprints,
    createOrgSprint,
    deleteSprint,
    patchSprint,
    loadCardDetail,
    addCardLink,
    removeCardLink,
    addComment,
    updateComment,
    deleteComment,
    addTimeEntry,
    stopTimer,
    discardTimer,
    updateTimeEntry,
    deleteTimeEntry,
  };
})();

if (typeof module !== 'undefined') module.exports = { KuiperStore };
