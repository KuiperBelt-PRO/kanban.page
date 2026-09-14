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

  return { boardSlug, loadBoard, patchCard, createCard };
})();

if (typeof module !== 'undefined') module.exports = { KuiperStore };
