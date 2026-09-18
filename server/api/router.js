'use strict';

const path = require('path');
const boards = require('../db/repositories/boards.js');
const cards = require('../db/repositories/cards.js');
const orgs = require('../db/repositories/organizations.js');
const tags = require('../db/repositories/tags.js');
const cardLinks = require('../db/repositories/card-links.js');
const timeEntries = require('../db/repositories/time-entries.js');
const comments = require('../db/repositories/comments.js');
const cardDetail = require('../db/repositories/card-detail.js');
const { snapshotToState, attachOrganization } = require('../board-view.js');
const { buildNavigation } = require('../navigation.js');
const { sendJson, readBody, cors } = require('./middleware.js');

function notFound(res) {
  sendJson(res, 404, { ok: false, error: { code: 'not_found', message: 'not found' } });
}

function badRequest(res, message) {
  sendJson(res, 400, { ok: false, error: { code: 'validation', message } });
}

async function handleApi(req, res, db, urlPath, method) {
  cors(req, res);
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (urlPath === '/api/v1/health' && method === 'GET') {
    return sendJson(res, 200, { ok: true });
  }

  if (urlPath === '/api/v1/organizations' && method === 'GET') {
    return sendJson(res, 200, { ok: true, data: { organizations: orgs.list(db) } });
  }

  if (urlPath === '/api/v1/navigation' && method === 'GET') {
    return sendJson(res, 200, { ok: true, data: buildNavigation(db) });
  }

  const boardMatch = urlPath.match(/^\/api\/v1\/boards\/([^/]+)$/);
  if (boardMatch && method === 'GET') {
    try {
      const snapshot = boards.getSnapshot(db, decodeURIComponent(boardMatch[1]));
      return sendJson(res, 200, { ok: true, data: snapshot });
    } catch (err) {
      return notFound(res);
    }
  }

  const boardTagsMatch = urlPath.match(/^\/api\/v1\/boards\/([^/]+)\/tags$/);
  if (boardTagsMatch && method === 'GET') {
    try {
      const board = boards.resolveBoard(db, decodeURIComponent(boardTagsMatch[1]));
      if (!board) return notFound(res);
      return sendJson(res, 200, { ok: true, data: { tags: tags.listByBoard(db, board.id) } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const boardStateMatch = urlPath.match(/^\/api\/v1\/boards\/([^/]+)\/state$/);
  if (boardStateMatch && method === 'GET') {
    try {
      const raw = boards.getSnapshot(db, decodeURIComponent(boardStateMatch[1]));
      const snapshot = attachOrganization(raw, db);
      return sendJson(res, 200, { ok: true, data: snapshotToState(snapshot) });
    } catch (err) {
      return notFound(res);
    }
  }

  if (urlPath === '/api/v1/cards' && method === 'POST') {
    try {
      const body = await readBody(req);
      const card = cards.create(db, body);
      return sendJson(res, 201, { ok: true, data: { card } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const cardDetailMatch = urlPath.match(/^\/api\/v1\/cards\/([^/]+)\/detail$/);
  if (cardDetailMatch && method === 'GET') {
    try {
      const id = decodeURIComponent(cardDetailMatch[1]);
      return sendJson(res, 200, { ok: true, data: cardDetail.getDetail(db, id) });
    } catch (err) {
      return notFound(res);
    }
  }

  const cardLinksMatch = urlPath.match(/^\/api\/v1\/cards\/([^/]+)\/links$/);
  if (cardLinksMatch && method === 'POST') {
    try {
      const id = decodeURIComponent(cardLinksMatch[1]);
      const body = await readBody(req);
      const link = cardLinks.add(db, {
        from_card_id: body.from_card_id || id,
        to_card_id: body.to_card_id,
        link_type: body.link_type,
      });
      const card = cards.getById(db, id);
      boards.bumpVersion(db, card.board_id);
      return sendJson(res, 201, { ok: true, data: { link } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const cardLinkDelMatch = urlPath.match(/^\/api\/v1\/cards\/([^/]+)\/links\/([^/]+)$/);
  if (cardLinkDelMatch && method === 'DELETE') {
    try {
      const cardId = decodeURIComponent(cardLinkDelMatch[1]);
      const linkId = decodeURIComponent(cardLinkDelMatch[2]);
      cardLinks.remove(db, linkId);
      const card = cards.getById(db, cardId);
      boards.bumpVersion(db, card.board_id);
      return sendJson(res, 200, { ok: true, data: {} });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const cardCommentsMatch = urlPath.match(/^\/api\/v1\/cards\/([^/]+)\/comments$/);
  if (cardCommentsMatch && method === 'POST') {
    try {
      const id = decodeURIComponent(cardCommentsMatch[1]);
      const body = await readBody(req);
      const comment = comments.add(db, id, body.body);
      const card = cards.getById(db, id);
      boards.bumpVersion(db, card.board_id);
      return sendJson(res, 201, { ok: true, data: { comment } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const cardCommentPatchMatch = urlPath.match(/^\/api\/v1\/cards\/([^/]+)\/comments\/([^/]+)$/);
  if (cardCommentPatchMatch && method === 'PATCH') {
    try {
      const cardId = decodeURIComponent(cardCommentPatchMatch[1]);
      const commentId = decodeURIComponent(cardCommentPatchMatch[2]);
      const body = await readBody(req);
      const comment = comments.update(db, cardId, commentId, body.body);
      const card = cards.getById(db, cardId);
      boards.bumpVersion(db, card.board_id);
      return sendJson(res, 200, { ok: true, data: { comment } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const cardTimeMatch = urlPath.match(/^\/api\/v1\/cards\/([^/]+)\/time-entries$/);
  if (cardTimeMatch && method === 'POST') {
    try {
      const id = decodeURIComponent(cardTimeMatch[1]);
      const body = await readBody(req);
      const card = cards.getById(db, id);
      let entry;
      if (body.action === 'start_timer') {
        entry = timeEntries.startTimer(db, id, { label: body.label });
      } else {
        entry = timeEntries.addManual(db, id, {
          duration_minutes: body.duration_minutes,
          started_at: body.started_at,
          ended_at: body.ended_at,
          label: body.label,
        });
      }
      boards.bumpVersion(db, card.board_id);
      return sendJson(res, 201, { ok: true, data: { entry } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const cardTimeStopMatch = urlPath.match(/^\/api\/v1\/cards\/([^/]+)\/time-entries\/([^/]+)\/stop$/);
  if (cardTimeStopMatch && method === 'POST') {
    try {
      const cardId = decodeURIComponent(cardTimeStopMatch[1]);
      const entryId = decodeURIComponent(cardTimeStopMatch[2]);
      const body = await readBody(req);
      const entry = timeEntries.stopTimer(db, cardId, entryId, { label: body.label });
      const card = cards.getById(db, cardId);
      boards.bumpVersion(db, card.board_id);
      return sendJson(res, 200, { ok: true, data: { entry } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const cardTimeDiscardMatch = urlPath.match(/^\/api\/v1\/cards\/([^/]+)\/time-entries\/([^/]+)\/discard$/);
  if (cardTimeDiscardMatch && method === 'POST') {
    try {
      const cardId = decodeURIComponent(cardTimeDiscardMatch[1]);
      const entryId = decodeURIComponent(cardTimeDiscardMatch[2]);
      timeEntries.discardTimer(db, cardId, entryId);
      const card = cards.getById(db, cardId);
      boards.bumpVersion(db, card.board_id);
      return sendJson(res, 200, { ok: true, data: { discarded: true } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const cardTimeEntryMatch = urlPath.match(/^\/api\/v1\/cards\/([^/]+)\/time-entries\/([^/]+)$/);
  if (cardTimeEntryMatch && method === 'PATCH') {
    try {
      const cardId = decodeURIComponent(cardTimeEntryMatch[1]);
      const entryId = decodeURIComponent(cardTimeEntryMatch[2]);
      const body = await readBody(req);
      const entry = timeEntries.update(db, cardId, entryId, {
        started_at: body.started_at,
        ended_at: body.ended_at,
        label: body.label,
      });
      const card = cards.getById(db, cardId);
      boards.bumpVersion(db, card.board_id);
      return sendJson(res, 200, { ok: true, data: { entry } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }
  if (cardTimeEntryMatch && method === 'DELETE') {
    try {
      const cardId = decodeURIComponent(cardTimeEntryMatch[1]);
      const entryId = decodeURIComponent(cardTimeEntryMatch[2]);
      timeEntries.remove(db, cardId, entryId);
      const card = cards.getById(db, cardId);
      boards.bumpVersion(db, card.board_id);
      return sendJson(res, 200, { ok: true, data: { removed: true } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const cardMatch = urlPath.match(/^\/api\/v1\/cards\/([^/]+)$/);
  if (cardMatch && method === 'PATCH') {
    try {
      const id = decodeURIComponent(cardMatch[1]);
      const body = await readBody(req);
      let result;
      if (body.stage_id || body.stage) {
        result = cards.move(db, id, body);
        return sendJson(res, 200, { ok: true, data: result });
      }
      const card = cards.update(db, id, body);
      return sendJson(res, 200, { ok: true, data: { card } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  return notFound(res);
}

const STATIC_ROOT = path.join(__dirname, '..', '..');
const STATIC_FILES = new Set([
  'index.html', 'app.js', 'core.js', 'i18n.js', 'styles.css',
  'kuiper-store.js', 'kuiper-datetime-picker.js', 'kuiper-issue-panel.js', 'kuiper-ui.js',
  'kuiper-calendar.js', 'kuiper-gantt.js', 'tooltip.js',
  'manifest.webmanifest', 'sw.js', 'qr.js',
]);

/** En serve local, reemplaza el SW de PWA para vaciar caché y desregistrarse. */
const KUIPER_LOCAL_SW = `'use strict';
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => Promise.all(clients.map((c) => c.navigate(c.url))))
  );
});
`;

function serveStatic(req, res, urlPath) {
  const safe = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '').split('?')[0];
  if (safe === 'sw.js') {
    res.writeHead(200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(KUIPER_LOCAL_SW);
    return true;
  }
  if (!STATIC_FILES.has(safe) && !safe.startsWith('assets/') && !safe.startsWith('vendor/')) return false;
  const filePath = path.join(STATIC_ROOT, safe);
  if (!filePath.startsWith(STATIC_ROOT)) return false;
  try {
    const fs = require('fs');
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.mjs': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.webmanifest': 'application/manifest+json',
      '.svg': 'image/svg+xml',
    };
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
    return true;
  } catch (err) {
    return false;
  }
}

async function route(req, res, db) {
  const url = new URL(req.url, 'http://localhost');
  const urlPath = url.pathname;

  if (urlPath.startsWith('/api/')) {
    return handleApi(req, res, db, urlPath, req.method || 'GET');
  }
  if (serveStatic(req, res, urlPath)) return;
  notFound(res);
}

module.exports = { route };
