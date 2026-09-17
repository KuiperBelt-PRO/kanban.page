/* Kuiper Kanban — cliente HTTP para modo ?kuiper=1 */
const KuiperStore = (() => {
  const boardSlug = () => new URLSearchParams(location.search).get('board') || 'hub-delivery';

  async function request(path, options = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const payload = await res.json();
    if (!res.ok || payload.ok === false) {
      throw new Error(payload.error?.message || `HTTP ${res.status}`);
    }
    return payload.data ?? payload;
  }

  async function loadBoard(slug) {
    return request(`/api/v1/boards/${encodeURIComponent(slug || boardSlug())}/state`);
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

  return {
    boardSlug,
    loadBoard,
    loadNavigation,
    patchCard,
    createCard,
    loadCardDetail,
    addCardLink,
    removeCardLink,
    addComment,
    updateComment,
    addTimeEntry,
    stopTimer,
    discardTimer,
  };
})();

if (typeof module !== 'undefined') module.exports = { KuiperStore };
