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

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    }).on('error', reject);
  });
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

  it('returns board snapshot', async () => {
    const res = await get('/api/v1/boards/hub-delivery');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.board.slug === 'hub-delivery');
    assert.ok(res.body.data.cards.length >= 1);
  });
});
