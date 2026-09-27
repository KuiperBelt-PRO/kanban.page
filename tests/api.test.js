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

  it('redirects bare index to kuiper UI when serve uses a database', async () => {
    const res = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path: '/index.html?ns=scratch' }, r => {
        resolve({ status: r.statusCode, location: r.headers.location });
      }).on('error', reject);
    });
    assert.equal(res.status, 302);
    assert.equal(res.location, '/?board=hub-delivery');
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
    const entryId = manual.body.data.entry.id;

    const timeUpdated = await request('PATCH', `/api/v1/cards/${encodeURIComponent(cardId)}/time-entries/${encodeURIComponent(entryId)}`, {
      started_at: '2026-03-10T08:00:00.000Z',
      ended_at: '2026-03-10T09:00:00.000Z',
      label: 'review updated',
    });
    assert.equal(timeUpdated.status, 200);
    assert.equal(timeUpdated.body.data.entry.duration_minutes, 60);
    assert.equal(timeUpdated.body.data.entry.label, 'review updated');

    const timeDeleted = await request('DELETE', `/api/v1/cards/${encodeURIComponent(cardId)}/time-entries/${encodeURIComponent(entryId)}`);
    assert.equal(timeDeleted.status, 200);
    assert.equal(timeDeleted.body.data.removed, true);

    const manualKeep = await request('POST', `/api/v1/cards/${encodeURIComponent(cardId)}/time-entries`, {
      duration_minutes: 15,
      label: 'kept',
    });
    assert.equal(manualKeep.status, 201);

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

  it('patches issue_type on cards', async () => {
    const board = await get('/api/v1/boards/hub-delivery');
    const cardId = board.body.data.cards[0].id;

    const patched = await request('PATCH', `/api/v1/cards/${encodeURIComponent(cardId)}`, {
      issue_type: 'bug',
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.data.card.issue_type, 'bug');

    const state = await get('/api/v1/boards/hub-delivery/state');
    const task = state.body.data.tasks.find(t => t.id === cardId);
    assert.equal(task.issueType, 'bug');
  });

  it('patches issue_type together with stage move', async () => {
    const board = await get('/api/v1/boards/hub-delivery');
    const cardId = board.body.data.cards[0].id;
    const stages = board.body.data.stages;
    const otherStage = stages.find(s => s.id !== board.body.data.cards[0].stage_id) || stages[0];

    const patched = await request('PATCH', `/api/v1/cards/${encodeURIComponent(cardId)}`, {
      stage_id: otherStage.id,
      issue_type: 'story',
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.data.card.issue_type, 'story');

    const state = await get('/api/v1/boards/hub-delivery/state');
    const task = state.body.data.tasks.find(t => t.id === cardId);
    assert.equal(task.issueType, 'story');
    assert.equal(task.columnId, otherStage.id);
  });

  it('supports schedule dates on cards', async () => {
    const board = await get('/api/v1/boards/hub-delivery');
    const cardId = board.body.data.cards[0].id;

    const patched = await request('PATCH', `/api/v1/cards/${encodeURIComponent(cardId)}`, {
      schedule_start_date: '2026-09-10',
      schedule_end_date: '2026-09-15',
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.data.card.schedule_start_date, '2026-09-10');
    assert.equal(patched.body.data.card.schedule_end_date, '2026-09-15');

    const state = await get('/api/v1/boards/hub-delivery/state');
    const task = state.body.data.tasks.find(t => t.id === cardId);
    assert.equal(task.scheduleStartDate, '2026-09-10');
    assert.equal(task.scheduleEndDate, '2026-09-15');

    const bad = await request('PATCH', `/api/v1/cards/${encodeURIComponent(cardId)}`, {
      schedule_start_date: '2026-09-20',
      schedule_end_date: '2026-09-15',
    });
    assert.equal(bad.status, 400);
  });

  it('creates sprint and patches card sprint_id', async () => {
    const board = await get('/api/v1/boards/hub-delivery');
    const projectIds = board.body.data.projects.slice(0, 2).map(p => p.id);
    assert.ok(projectIds.length >= 1);

    const created = await request('POST', '/api/v1/organizations/kuiperbelt-pro/sprints', {
      name: 'Sprint test API',
      start_date: '2026-10-01',
      end_date: '2026-10-14',
      status: 'active',
      project_ids: projectIds,
    });
    assert.equal(created.status, 201);
    const sprintId = created.body.data.sprint.id;
    assert.ok(sprintId);

    const cardId = board.body.data.cards[0].id;
    const patched = await request('PATCH', `/api/v1/cards/${encodeURIComponent(cardId)}`, {
      sprint_id: sprintId,
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.data.card.sprint_id, sprintId);

    const state = await get('/api/v1/boards/hub-delivery/state');
    const task = state.body.data.tasks.find(t => t.id === cardId);
    assert.equal(task.sprintId, sprintId);
    assert.ok(Array.isArray(state.body.data.sprints));
    assert.ok(state.body.data.sprints.some(s => s.id === sprintId));
  });

  it('subtasks require parent and inherit project from parent', async () => {
    const board = await get('/api/v1/boards/hub-delivery');
    const parent = board.body.data.cards.find(c => c.issue_type !== 'subtask');
    const stageId = board.body.data.stages[0].id;

    const orphan = await request('POST', '/api/v1/cards', {
      board_slug: 'hub-delivery',
      project_id: parent.project_id,
      stage_id: stageId,
      title: 'Orphan subtask',
      issue_type: 'subtask',
    });
    assert.equal(orphan.status, 400);

    const created = await request('POST', '/api/v1/cards', {
      board_slug: 'hub-delivery',
      project_id: parent.project_id,
      stage_id: stageId,
      title: 'Nested subtask',
      issue_type: 'subtask',
      parent_id: parent.id,
    });
    assert.equal(created.status, 201);
    const subId = created.body.data.card.id;
    assert.equal(created.body.data.card.parent_id, parent.id);
    assert.equal(created.body.data.card.project_id, parent.project_id);

    const detail = await get(`/api/v1/cards/${encodeURIComponent(parent.id)}/detail`);
    assert.ok(detail.body.data.subtasks.some(s => s.id === subId));

    const state = await get('/api/v1/boards/hub-delivery/state');
    const subTask = state.body.data.tasks.find(t => t.id === subId);
    assert.ok(subTask);
    assert.equal(subTask.issueType, 'subtask');
    assert.equal(subTask.parentId, parent.id);
  });

  it('subtasks inherit epic from parent but keep their own sprint', async () => {
    const board = await get('/api/v1/boards/hub-delivery');
    const parent = board.body.data.cards.find(c => c.issue_type === 'task' && !c.parent_id);
    const stageId = board.body.data.stages[0].id;
    const epic = (board.body.data.epics || []).find(e => e.project_id === parent.project_id);
    assert.ok(parent);
    assert.ok(epic, 'need an epic on parent project');

    const parentEpicPatch = await request('PATCH', `/api/v1/cards/${encodeURIComponent(parent.id)}`, {
      epic_id: epic.id,
      sprint_id: null,
    });
    assert.equal(parentEpicPatch.status, 200);
    const parentEpicId = parentEpicPatch.body.data.card.epic_id;
    assert.ok(parentEpicId);

    const sprintRes = await request('POST', '/api/v1/organizations/kuiperbelt-pro/sprints', {
      name: 'Sprint subtask test',
      start_date: '2026-01-01',
      end_date: '2026-01-14',
      status: 'active',
      project_ids: [parent.project_id],
    });
    assert.equal(sprintRes.status, 201);
    const sprintId = sprintRes.body.data.sprint.id;

    const created = await request('POST', '/api/v1/cards', {
      board_slug: 'hub-delivery',
      project_id: parent.project_id,
      stage_id: stageId,
      title: 'Sub with own sprint',
      issue_type: 'subtask',
      parent_id: parent.id,
      sprint_id: sprintId,
    });
    assert.equal(created.status, 201);
    const subId = created.body.data.card.id;
    assert.equal(created.body.data.card.epic_id, parentEpicId);
    assert.equal(created.body.data.card.sprint_id, sprintId);

    await request('PATCH', `/api/v1/cards/${encodeURIComponent(parent.id)}`, {
      sprint_id: sprintId,
    });
    const stateAfterParentSprint = await get('/api/v1/boards/hub-delivery/state');
    const subAfterParentSprint = stateAfterParentSprint.body.data.tasks.find(t => t.id === subId);
    assert.equal(subAfterParentSprint.sprintId, sprintId);

    const otherEpic = board.body.data.epics.find(
      e => e.project_id === parent.project_id && e.id !== parentEpicId,
    ) || epic;
    const parentEpicChange = await request('PATCH', `/api/v1/cards/${encodeURIComponent(parent.id)}`, {
      epic_id: otherEpic.id,
    });
    assert.equal(parentEpicChange.status, 200);
    const nextEpicId = parentEpicChange.body.data.card.epic_id;
    const stateAfterEpic = await get('/api/v1/boards/hub-delivery/state');
    const subAfterEpic = stateAfterEpic.body.data.tasks.find(t => t.id === subId);
    assert.equal(subAfterEpic.epicId, nextEpicId);
    assert.equal(subAfterEpic.sprintId, sprintId);
  });

  it('archives organization without boards and deletes when empty', async () => {
    const created = await request('POST', '/api/v1/organizations', { name: 'Archive Me Org' });
    assert.equal(created.status, 201);
    const slug = created.body.data.organization.slug;
    const patch = await request('PATCH', `/api/v1/organizations/${encodeURIComponent(slug)}`, { archived: true });
    assert.equal(patch.status, 200);
    assert.ok(patch.body.data.organization.archived);
    const listActive = await get('/api/v1/organizations');
    assert.ok(!listActive.body.data.organizations.some(o => o.slug === slug));
    const listAll = await get('/api/v1/organizations?include_archived=1');
    assert.ok(listAll.body.data.organizations.some(o => o.slug === slug));
    const del = await request('DELETE', `/api/v1/organizations/${encodeURIComponent(slug)}`);
    assert.equal(del.status, 200);
  });

  it('links project to board when slug is duplicated across orgs', async () => {
    const orgA = await request('POST', '/api/v1/organizations', { name: 'Dup scope A' });
    const orgB = await request('POST', '/api/v1/organizations', { name: 'Dup scope B' });
    assert.equal(orgA.status, 201);
    assert.equal(orgB.status, 201);
    const slugA = orgA.body.data.organization.slug;
    const slugB = orgB.body.data.organization.slug;
    const boardA = await request('POST', `/api/v1/organizations/${encodeURIComponent(slugA)}/boards`, {
      name: 'Shared Slug Board',
      slug: 'dup-test-board',
    });
    const boardB = await request('POST', `/api/v1/organizations/${encodeURIComponent(slugB)}/boards`, {
      name: 'Shared Slug Board',
      slug: 'dup-test-board',
    });
    assert.equal(boardA.status, 201);
    assert.equal(boardB.status, 201);
    const proj = await request('POST', `/api/v1/organizations/${encodeURIComponent(slugA)}/projects`, { name: 'Dup link proj' });
    assert.equal(proj.status, 201);
    const projectId = proj.body.data.project.id;
    const withoutOrg = await request('POST', '/api/v1/boards/dup-test-board/projects', { project_id: projectId });
    assert.equal(withoutOrg.status, 400);
    const withOrg = await request(
      'POST',
      `/api/v1/boards/dup-test-board/projects?org=${encodeURIComponent(slugA)}`,
      { project_id: projectId },
    );
    assert.equal(withOrg.status, 200, JSON.stringify(withOrg.body));
    const mem = await get(`/api/v1/boards/dup-test-board/membership?org=${encodeURIComponent(slugA)}`);
    assert.ok(mem.body.data.projects.some(p => p.id === projectId));
    const boardId = boardA.body.data.board.id;
    const projB = await request('POST', `/api/v1/organizations/${encodeURIComponent(slugB)}/projects`, { name: 'Dup link proj B' });
    const projectIdB = projB.body.data.project.id;
    const byId = await request('POST', `/api/v1/boards/${boardId}/projects`, { project_id: projectId });
    assert.equal(byId.status, 200, JSON.stringify(byId.body));
    const withoutOrgDupSlug = await request('POST', '/api/v1/boards/dup-test-board/projects', { project_id: projectIdB });
    assert.equal(withoutOrgDupSlug.status, 400);
  });

  it('creates organization via POST', async () => {
    const res = await request('POST', '/api/v1/organizations', { name: 'Test Org UI' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.organization.name, 'Test Org UI');
    assert.ok(res.body.data.organization.slug);
    const list = await get('/api/v1/organizations');
    assert.ok(list.body.data.organizations.some(o => o.slug === res.body.data.organization.slug));
  });

  it('reorders board stages via PATCH', async () => {
    const mem = await get('/api/v1/boards/hub-delivery/membership');
    assert.equal(mem.status, 200);
    const stages = mem.body.data.stages;
    assert.ok(stages.length >= 2);
    const reversed = [...stages].reverse().map(s => s.id);
    const res = await request('PATCH', '/api/v1/boards/hub-delivery/stages/reorder', { order: reversed });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const after = await get('/api/v1/boards/hub-delivery/membership');
    assert.deepEqual(after.body.data.stages.map(s => s.id), reversed);
    await request('PATCH', '/api/v1/boards/hub-delivery/stages/reorder', {
      order: stages.map(s => s.id),
    });
  });

  it('delete stage moves cards to previous stage', async () => {
    const mem = await get('/api/v1/boards/hub-delivery/membership');
    assert.equal(mem.status, 200);
    const stages = mem.body.data.stages;
    assert.ok(stages.length >= 2);
    const board = await get('/api/v1/boards/hub-delivery/state');
    const created = await request('POST', '/api/v1/boards/hub-delivery/stages', { name: 'WS delete test' });
    assert.equal(created.status, 201);
    const extraId = created.body.data.stage.id;
    const memAfter = await get('/api/v1/boards/hub-delivery/membership');
    const list = memAfter.body.data.stages;
    const extraIdx = list.findIndex(s => s.id === extraId);
    assert.ok(extraIdx > 0);
    const prevStage = list[extraIdx - 1];
    const card = await request('POST', '/api/v1/cards', {
      board_slug: 'hub-delivery',
      project_id: board.body.data.projects[0].id,
      stage_id: extraId,
      title: 'Card on doomed stage',
    });
    assert.equal(card.status, 201);
    const cardId = card.body.data.card.id;
    const del = await request('DELETE', `/api/v1/boards/hub-delivery/stages/${encodeURIComponent(extraId)}`);
    assert.equal(del.status, 200);
    assert.equal(del.body.data.moved_cards, 1);
    assert.equal(del.body.data.moved_to_stage_id, prevStage.id);
    const state = await get('/api/v1/boards/hub-delivery/state');
    const task = state.body.data.tasks.find(t => t.id === cardId);
    assert.equal(task.columnId, prevStage.id);
  });
});
