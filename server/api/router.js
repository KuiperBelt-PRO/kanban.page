'use strict';

const path = require('path');
const boards = require('../db/repositories/boards.js');
const cards = require('../db/repositories/cards.js');
const orgs = require('../db/repositories/organizations.js');
const { snapshotToState } = require('../board-view.js');
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

  const boardMatch = urlPath.match(/^\/api\/v1\/boards\/([^/]+)$/);
  if (boardMatch && method === 'GET') {
    try {
      const snapshot = boards.getSnapshot(db, decodeURIComponent(boardMatch[1]));
      return sendJson(res, 200, { ok: true, data: snapshot });
    } catch (err) {
      return notFound(res);
    }
  }

  const boardStateMatch = urlPath.match(/^\/api\/v1\/boards\/([^/]+)\/state$/);
  if (boardStateMatch && method === 'GET') {
    try {
      const snapshot = boards.getSnapshot(db, decodeURIComponent(boardStateMatch[1]));
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
  'index.html', 'app.js', 'core.js', 'i18n.js', 'styles.css', 'kuiper-store.js',
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
  if (!STATIC_FILES.has(safe) && !safe.startsWith('assets/')) return false;
  const filePath = path.join(STATIC_ROOT, safe);
  if (!filePath.startsWith(STATIC_ROOT)) return false;
  try {
    const fs = require('fs');
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
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
