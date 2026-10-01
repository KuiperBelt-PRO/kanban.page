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
const sprints = require('../server/db/repositories/sprints.js');
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
    assert.equal(first.version, 16);
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

  it('assigns organization code on create', () => {
    const db = openDb();
    migrate(db);
    const org = orgs.create(db, { slug: 'kuiper-belt-pro', name: 'Kuiper Belt Pro' });
    assert.ok(org.code);
    assert.match(org.code, /^[A-Z0-9]{2,4}$/);
  });

  it('allocates unique organization code when slug collides', () => {
    const db = openDb();
    migrate(db);
    const first = orgs.create(db, { slug: 'acme-corp', name: 'Acme Corp' });
    const second = orgs.create(db, { slug: 'acme-corp-2', name: 'Acme Corp Two' });
    assert.ok(first.code);
    assert.ok(second.code);
    assert.notEqual(first.code, second.code);
  });

  it('assigns board code on create', () => {
    const db = openDb();
    migrate(db);
    const org = orgs.create(db, { slug: 'acme', name: 'Acme' });
    const { board } = boards.create(db, { organization_id: org.id, slug: 'hub-delivery', name: 'Hub Delivery' });
    assert.ok(board.code);
    assert.match(board.code, /^[A-Z0-9]{2,4}$/);
  });

  it('allocates unique board code when slug collides', () => {
    const db = openDb();
    migrate(db);
    const org = orgs.create(db, { slug: 'acme', name: 'Acme' });
    const first = boards.create(db, { organization_id: org.id, slug: 'super-board', name: 'Super Board' });
    const second = boards.create(db, { organization_id: org.id, slug: 'super-board-2', name: 'Super Board Two' });
    assert.ok(first.board.code);
    assert.ok(second.board.code);
    assert.notEqual(first.board.code, second.board.code);
  });

  it('allocates unique sprint slug when name collides', () => {
    const db = openDb();
    migrate(db);
    const org = orgs.create(db, { slug: 'acme', name: 'Acme' });
    const first = sprints.create(db, {
      organization_id: org.id,
      name: 'Sprint 1',
      start_date: '2026-10-01',
      end_date: '2026-10-14',
    });
    const second = sprints.create(db, {
      organization_id: org.id,
      name: 'Sprint 1',
      start_date: '2026-10-15',
      end_date: '2026-10-28',
    });
    assert.equal(first.slug, 'sprint-1');
    assert.equal(second.slug, 'sprint-1-2');
  });

  it('allocates unique sprint code when name collides', () => {
    const db = openDb();
    migrate(db);
    const org = orgs.create(db, { slug: 'acme', name: 'Acme' });
    const first = sprints.create(db, {
      organization_id: org.id,
      name: 'Sprint 1',
      start_date: '2026-10-01',
      end_date: '2026-10-14',
    });
    const second = sprints.create(db, {
      organization_id: org.id,
      name: 'Sprint 1',
      start_date: '2026-10-15',
      end_date: '2026-10-28',
    });
    assert.ok(first.code);
    assert.ok(second.code);
    assert.notEqual(first.code, second.code);
  });
});
