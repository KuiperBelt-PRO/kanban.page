'use strict';

const { entityId } = require('../../ids.js');
const { nowIso, slugify } = require('../../util.js');
const orgs = require('./organizations.js');
const boards = require('./boards.js');
const projects = require('./projects.js');

function validateDates(start, end) {
  if (!start || !end) throw new Error('start_date and end_date required');
  if (end < start) throw new Error('end_date must be on or after start_date');
}

function rowToSprint(row) {
  if (!row) return null;
  return {
    id: row.id,
    organization_id: row.organization_id,
    slug: row.slug,
    name: row.name,
    goal: row.goal || null,
    start_date: row.start_date,
    end_date: row.end_date,
    status: row.status || 'planned',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function listProjectIds(db, sprintId) {
  return db.prepare('SELECT project_id FROM sprint_projects WHERE sprint_id = ?')
    .all(sprintId).map(r => r.project_id);
}

function attachProjects(db, sprint) {
  return { ...sprint, project_ids: listProjectIds(db, sprint.id) };
}

function getById(db, id) {
  return rowToSprint(db.prepare('SELECT * FROM sprints WHERE id = ?').get(id));
}

function listByOrg(db, { organization_id, organization_slug }) {
  let orgId = organization_id;
  if (!orgId && organization_slug) {
    const org = orgs.getBySlug(db, organization_slug);
    orgId = org?.id;
  }
  if (!orgId) return [];
  return db.prepare(`
    SELECT * FROM sprints WHERE organization_id = ?
    ORDER BY start_date DESC, name COLLATE NOCASE
  `).all(orgId).map(rowToSprint);
}

function listForBoard(db, boardId) {
  const board = boards.getById(db, boardId);
  if (!board) return [];
  const projectRows = boards.listProjects(db, boardId);
  const projectIds = new Set(projectRows.map(p => p.id));
  if (!projectIds.size) return [];
  const all = listByOrg(db, { organization_id: board.organization_id });
  return all.filter(s => {
    const ids = listProjectIds(db, s.id);
    return ids.some(id => projectIds.has(id));
  }).map(s => attachProjects(db, s));
}

function setProjects(db, sprintId, projectIds) {
  const ids = [...new Set((projectIds || []).filter(Boolean))];
  if (!ids.length) throw new Error('sprint requires at least one project');
  for (const pid of ids) {
    if (!projects.getById(db, pid)) throw new Error(`project not found: ${pid}`);
  }
  db.prepare('DELETE FROM sprint_projects WHERE sprint_id = ?').run(sprintId);
  const ins = db.prepare('INSERT INTO sprint_projects(sprint_id, project_id) VALUES (?, ?)');
  for (const pid of ids) ins.run(sprintId, pid);
}

function create(db, {
  organization_id,
  organization_slug,
  name,
  slug,
  goal,
  start_date,
  end_date,
  status,
  project_ids,
}) {
  let org = organization_id ? orgs.getById(db, organization_id) : null;
  if (!org && organization_slug) org = orgs.getBySlug(db, organization_slug);
  if (!org) throw new Error('organization not found');
  validateDates(start_date, end_date);
  const id = entityId();
  const ts = nowIso();
  const finalSlug = slugify(slug || name);
  db.prepare(`
    INSERT INTO sprints(
      id, organization_id, slug, name, goal, start_date, end_date, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, org.id, finalSlug, name, goal || null, start_date, end_date,
    status || 'planned', ts, ts,
  );
  setProjects(db, id, project_ids);
  return attachProjects(db, getById(db, id));
}

function update(db, id, fields) {
  const sprint = getById(db, id);
  if (!sprint) throw new Error('sprint not found');
  const name = fields.name != null ? fields.name : sprint.name;
  const goal = fields.goal !== undefined ? fields.goal : sprint.goal;
  const start = fields.start_date != null ? fields.start_date : sprint.start_date;
  const end = fields.end_date != null ? fields.end_date : sprint.end_date;
  const status = fields.status != null ? fields.status : sprint.status;
  validateDates(start, end);
  const ts = nowIso();
  db.prepare(`
    UPDATE sprints SET name = ?, goal = ?, start_date = ?, end_date = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(name, goal, start, end, status, ts, id);
  if (fields.project_ids) setProjects(db, id, fields.project_ids);
  return attachProjects(db, getById(db, id));
}

function remove(db, id) {
  const sprint = getById(db, id);
  if (!sprint) throw new Error('sprint not found');
  db.prepare('UPDATE cards SET sprint_id = NULL WHERE sprint_id = ?').run(id);
  db.prepare('UPDATE epics SET sprint_id = NULL WHERE sprint_id = ?').run(id);
  db.prepare('DELETE FROM sprint_projects WHERE sprint_id = ?').run(id);
  db.prepare('DELETE FROM sprints WHERE id = ?').run(id);
  return { removed: true };
}

function assertCardSprint(db, { sprint_id, project_id, board_id }) {
  if (!sprint_id) return;
  const sprint = getById(db, sprint_id);
  if (!sprint) throw new Error('sprint not found');
  const onSprint = db.prepare(
    'SELECT 1 AS n FROM sprint_projects WHERE sprint_id = ? AND project_id = ?',
  ).get(sprint_id, project_id);
  if (!onSprint) throw new Error('sprint is not linked to this project');
  const onBoard = db.prepare(
    'SELECT 1 AS n FROM board_projects WHERE board_id = ? AND project_id = ?',
  ).get(board_id, project_id);
  if (!onBoard) throw new Error('project is not linked to board');
}

function assertEpicSprint(db, { sprint_id, project_id }) {
  if (!sprint_id) return;
  const sprint = getById(db, sprint_id);
  if (!sprint) throw new Error('sprint not found');
  const onSprint = db.prepare(
    'SELECT 1 AS n FROM sprint_projects WHERE sprint_id = ? AND project_id = ?',
  ).get(sprint_id, project_id);
  if (!onSprint) throw new Error('sprint is not linked to this project');
}

module.exports = {
  getById,
  listByOrg,
  listForBoard,
  listProjectIds,
  create,
  update,
  remove,
  assertCardSprint,
  assertEpicSprint,
  attachProjects,
};
