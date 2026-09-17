'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer } = require('../server/index.js');
const { closeDb, resetSharedForTests } = require('../server/db/connection.js');
const { spawnSync } = require('child_process');

let server;
let port;
let tmpDir;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({
        status: res.statusCode,
        body: data ? JSON.parse(data) : null,
      }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function get(path) {
  return request('GET', path);
}

before(async () => {
  resetSharedForTests();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kuiper-api-'));
  const dbPath = path.join(tmpDir, 'api.db');
  process.env.KANBAN_DB_PATH = dbPath;
  spawnSync(process.execPath, ['cli/kanban.js', 'db', 'seed'], {
    cwd: path.join(__dirname, '..'),
    env: process.env,
  });
  port = 18765;
  server = startServer({ port, dbPath });
  await new Promise(r => setTimeout(r, 200));
});

after(() => {
  server.close();
  closeDb();
  resetSharedForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.KANBAN_DB_PATH;
});

describe('api', () => {
  it('health responds ok', async () => {
    const res = await get('/api/v1/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it('serves kuiper datetime picker static asset', async () => {
    const res = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path: '/kuiper-datetime-picker.js' }, r => {
        let data = '';
        r.on('data', c => { data += c; });
        r.on('end', () => resolve({ status: r.statusCode, body: data }));
      }).on('error', reject);
    });
    assert.equal(res.status, 200);
    assert.match(res.body, /KuiperDateTimePicker/);
  });

  it('returns board snapshot', async () => {
    const res = await get('/api/v1/boards/hub-delivery');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.board.slug === 'hub-delivery');
    assert.ok(res.body.data.cards.length >= 1);
  });

  it('returns navigation tree', async () => {
    const res = await get('/api/v1/navigation');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.organizations));
    assert.ok(res.body.data.organizations.length >= 1);
    const org = res.body.data.organizations[0];
    assert.ok(Array.isArray(org.projects));
    assert.ok(Array.isArray(org.boards));
  });

  it('board state includes epics and priority', async () => {
    const res = await get('/api/v1/boards/hub-delivery/state');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.epics));
    assert.ok(res.body.data.tasks.length >= 1);
    assert.ok('priority' in res.body.data.tasks[0]);
  });

  it('supports tags, time entries and comments on cards', async () => {
    const board = await get('/api/v1/boards/hub-delivery');
    const cardId = board.body.data.cards[0].id;
    const otherId = board.body.data.cards[1]?.id || cardId;

    const tagged = await request('PATCH', `/api/v1/cards/${encodeURIComponent(cardId)}`, {
      tags: ['backend', 'urgent'],
      estimated_minutes: 120,
    });
    assert.equal(tagged.status, 200);
    assert.equal(tagged.body.data.card.estimated_minutes, 120);

    const detail = await get(`/api/v1/cards/${encodeURIComponent(cardId)}/detail`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.tags.length, 2);

    const comment = await request('POST', `/api/v1/cards/${encodeURIComponent(cardId)}/comments`, {
      body: '**Hola** desde test',
    });
    assert.equal(comment.status, 201);
    const commentId = comment.body.data.comment.id;

    const updated = await request('PATCH', `/api/v1/cards/${encodeURIComponent(cardId)}/comments/${encodeURIComponent(commentId)}`, {
      body: 'Texto editado',
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.comment.body, 'Texto editado');

    const manual = await request('POST', `/api/v1/cards/${encodeURIComponent(cardId)}/time-entries`, {
      started_at: '2026-03-10T09:00:00.000Z',
      ended_at: '2026-03-10T10:30:00.000Z',
      label: 'review',
    });
    assert.equal(manual.status, 201);
    assert.equal(manual.body.data.entry.duration_minutes, 90);
    assert.ok(manual.body.data.entry.started_at);
    assert.ok(manual.body.data.entry.ended_at);

    if (otherId !== cardId) {
      const link = await request('POST', `/api/v1/cards/${encodeURIComponent(cardId)}/links`, {
        to_card_id: otherId,
        link_type: 'relates',
      });
      assert.equal(link.status, 201);
    }

    const after = await get(`/api/v1/cards/${encodeURIComponent(cardId)}/detail`);
    assert.ok(after.body.data.comments.length >= 1);
    assert.ok(after.body.data.timeEntries.length >= 1);
    assert.ok(after.body.data.events.length >= 3);
  });
});
