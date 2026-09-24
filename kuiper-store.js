/* Kuiper Kanban — cliente HTTP para modo ?kuiper=1 */
const KuiperStore = (() => {
  const boardSlug = () => new URLSearchParams(location.search).get('board') || 'hub-delivery';

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

  async function loadBoard(slug) {
    return request(`/api/v1/boards/${encodeURIComponent(slug || boardSlug())}/state`);
  }

  async function loadBoardSnapshot(slug) {
    return request(`/api/v1/boards/${encodeURIComponent(slug || boardSlug())}`);
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

  async function listOrgProjects(orgSlug) {
    const data = await request(`/api/v1/organizations/${encodeURIComponent(orgSlug)}/projects`);
    return data.projects || [];
  }

  async function listOrgBoards(orgSlug) {
    const data = await request(`/api/v1/organizations/${encodeURIComponent(orgSlug)}/boards`);
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

  async function deleteProject(id) {
    return request(`/api/v1/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async function patchBoard(slug, body) {
    const data = await request(`/api/v1/boards/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return data.board;
  }

  async function loadBoardMembership(slug) {
    return request(`/api/v1/boards/${encodeURIComponent(slug)}/membership`);
  }

  async function linkBoardProject(slug, projectId) {
    return request(`/api/v1/boards/${encodeURIComponent(slug)}/projects`, {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId }),
    });
  }

  async function unlinkBoardProject(slug, projectId) {
    return request(`/api/v1/boards/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    });
  }

  async function createStage(slug, name) {
    const data = await request(`/api/v1/boards/${encodeURIComponent(slug)}/stages`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return data.stage;
  }

  async function updateStage(slug, stageId, body) {
    const data = await request(`/api/v1/boards/${encodeURIComponent(slug)}/stages/${encodeURIComponent(stageId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return data.stage;
  }

  async function deleteStage(slug, stageId) {
    return request(`/api/v1/boards/${encodeURIComponent(slug)}/stages/${encodeURIComponent(stageId)}`, {
      method: 'DELETE',
    });
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

  async function listBoardTags(slug) {
    const data = await request(`/api/v1/boards/${encodeURIComponent(slug)}/tags`);
    return data.tags || [];
  }

  async function createBoardTag(slug, name) {
    const data = await request(`/api/v1/boards/${encodeURIComponent(slug)}/tags`, {
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
    patchCard,
    createCard,
    listOrgProjects,
    listOrgBoards,
    createOrgBoard,
    createOrgProject,
    patchProject,
    deleteProject,
    patchBoard,
    loadBoardMembership,
    linkBoardProject,
    unlinkBoardProject,
    createStage,
    updateStage,
    deleteStage,
    listProjectEpics,
    createEpic,
    patchEpic,
    deleteEpic,
    listBoardTags,
    createBoardTag,
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
    addTimeEntry,
    stopTimer,
    discardTimer,
    updateTimeEntry,
    deleteTimeEntry,
  };
})();

if (typeof module !== 'undefined') module.exports = { KuiperStore };
