'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDb, closeDb, resetSharedForTests } = require('../server/db/connection.js');
const { migrate } = require('../server/db/migrate.js');
const orgs = require('../server/db/repositories/organizations.js');
const projects = require('../server/db/repositories/projects.js');
const boards = require('../server/db/repositories/boards.js');
const cards = require('../server/db/repositories/cards.js');
const { isCardId } = require('../server/ids.js');

let tmpDir;

beforeEach(() => {
  resetSharedForTests();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kuiper-kanban-'));
  process.env.KANBAN_DB_PATH = path.join(tmpDir, 'test.db');
});

afterEach(() => {
  closeDb();
  resetSharedForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.KANBAN_DB_PATH;
});

describe('db migrate', () => {
  it('applies migration idempotently', () => {
    const db = openDb();
    const first = migrate(db);
    const second = migrate(db);
    assert.equal(first.version, 4);
    assert.equal(second.applied, 0);
  });

  it('creates unique card ids', () => {
    const db = openDb();
    migrate(db);
    const org = orgs.create(db, { slug: 'acme', name: 'Acme' });
    const project = projects.create(db, { organization_id: org.id, slug: 'p1', name: 'P1', code: 'P1' });
    const { board } = boards.create(db, { organization_id: org.id, slug: 'b1', name: 'B1', project_ids: [project.id] });
    boards.addProject(db, { board_id: board.id, project_id: project.id });
    const card = cards.create(db, { board_id: board.id, project_id: project.id, title: 'T1', stage: 'INBOX' });
    assert.ok(isCardId(card.id));
    const dup = db.prepare('SELECT COUNT(*) AS n FROM cards WHERE id = ?').get(card.id);
    assert.equal(dup.n, 1);
  });
});
