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
const tags = require('../server/db/repositories/tags.js');
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
    assert.equal(first.version, 12);
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

  it('stores issue type and links story to epic card', () => {
    const db = openDb();
    migrate(db);
    const org = orgs.create(db, { slug: 'acme', name: 'Acme' });
    const project = projects.create(db, { organization_id: org.id, slug: 'p1', name: 'P1', code: 'P1' });
    const { board } = boards.create(db, { organization_id: org.id, slug: 'b1', name: 'B1', project_ids: [project.id] });
    const epicCard = cards.create(db, {
      board_id: board.id,
      project_id: project.id,
      title: 'Big epic',
      stage: 'INBOX',
      issue_type: 'epic',
    });
    const story = cards.create(db, {
      board_id: board.id,
      project_id: project.id,
      title: 'Story one',
      stage: 'INBOX',
      issue_type: 'story',
      epic_id: epicCard.id,
    });
    assert.equal(story.issue_type, 'story');
    assert.equal(story.epic_id, epicCard.id);
  });

  it('assigns and updates entity colors', () => {
    const db = openDb();
    migrate(db);
    const org = orgs.create(db, { slug: 'acme', name: 'Acme' });
    const p1 = projects.create(db, { organization_id: org.id, slug: 'p1', name: 'P1', code: 'P1' });
    const p2 = projects.create(db, { organization_id: org.id, slug: 'p2', name: 'P2', code: 'P2' });
    assert.ok(/^#[0-9A-F]{6}$/.test(p1.color));
    assert.notEqual(p1.color, p2.color);
    const t1 = tags.createForOrganization(db, org.id, 'backend');
    assert.ok(/^#[0-9A-F]{6}$/.test(t1.color));
    const t2 = tags.update(db, t1.id, { color: '#112233' });
    assert.equal(t2.color, '#112233');
    const archived = tags.update(db, t1.id, { archived: true });
    assert.equal(archived.archived, 1);
    const active = tags.listByOrganization(db, org.id);
    assert.equal(active.length, 0);
    const all = tags.listByOrganization(db, org.id, { includeArchived: true });
    assert.equal(all.length, 1);
    assert.equal(tags.normalizeTagName('Back End'), 'BACKEND');
    assert.equal(tags.normalizeTagName('api_v2'), 'API_V2');
    assert.equal(tags.normalizeTagName(''), '');
  });
});
