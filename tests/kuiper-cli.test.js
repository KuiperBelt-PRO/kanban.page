'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resetSharedForTests, closeDb } = require('../server/db/connection.js');

let tmpDir;

function runKanban(args, env = {}) {
  return spawnSync(process.execPath, ['cli/kanban.js', ...args], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

beforeEach(() => {
  resetSharedForTests();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kuiper-cli-'));
  process.env.KANBAN_DB_PATH = path.join(tmpDir, 'cli.db');
});

afterEach(() => {
  closeDb();
  resetSharedForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.KANBAN_DB_PATH;
});

describe('kuiper cli', () => {
  it('migrates and creates org with json output', () => {
    const migrate = runKanban(['db', 'migrate', '--json']);
    assert.equal(migrate.status, 0);
    const migrated = JSON.parse(migrate.stdout);
    assert.equal(migrated.ok, true);

    const create = runKanban(['org', 'create', '--name', 'Test Org', '--slug', 'test-org', '--json']);
    assert.equal(create.status, 0);
    const payload = JSON.parse(create.stdout);
    assert.equal(payload.data.organization.slug, 'test-org');
  });

  it('seeds demo board', () => {
    const seed = runKanban(['db', 'seed', '--json']);
    assert.equal(seed.status, 0);
    const show = runKanban(['board', 'show', 'hub-delivery', '--json']);
    assert.equal(show.status, 0);
    const board = JSON.parse(show.stdout);
    assert.ok(board.data.cards.length >= 1);
  });
});
