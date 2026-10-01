'use strict';

const { entityId, suggestProjectCode, normalizeProjectCode } = require('../../ids.js');
const { nowIso, slugify } = require('../../util.js');
const orgs = require('./organizations.js');
const boards = require('./boards.js');
const projects = require('./projects.js');

const SPRINT_STATUSES = new Set(['inactive', 'active', 'closed']);

function normalizeSprintStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (s === 'planned') return 'inactive';
  return SPRINT_STATUSES.has(s) ? s : 'inactive';
}

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
    code: row.code || null,
    name: row.name,
    goal: row.goal || null,
    start_date: row.start_date,
    end_date: row.end_date,
    status: normalizeSprintStatus(row.status),
    archived: row.archived ? 1 : 0,
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

function listByOrg(db, { organization_id, organization_slug, includeArchived = false }) {
  let orgId = organization_id;
  if (!orgId && organization_slug) {
    const org = orgs.getBySlug(db, organization_slug);
    orgId = org?.id;
  }
  if (!orgId) return [];
  const archivedClause = includeArchived ? '' : ' AND archived = 0';
  return db.prepare(`
    SELECT * FROM sprints WHERE organization_id = ?${archivedClause}
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
    if (!ids.length) return true;
    return ids.some(id => projectIds.has(id));
  }).map(s => attachProjects(db, s));
}

function setProjects(db, sprintId, projectIds) {
  const ids = [...new Set((projectIds || []).filter(Boolean))];
  db.prepare('DELETE FROM sprint_projects WHERE sprint_id = ?').run(sprintId);
  if (!ids.length) return;
  for (const pid of ids) {
    if (!projects.getById(db, pid)) throw new Error(`project not found: ${pid}`);
  }
  const ins = db.prepare('INSERT INTO sprint_projects(sprint_id, project_id) VALUES (?, ?)');
  for (const pid of ids) ins.run(sprintId, pid);
}

function assertUniqueSlug(db, organizationId, slug, exceptId) {
  const row = db.prepare(`
    SELECT id FROM sprints WHERE organization_id = ? AND slug = ? AND id != ?
  `).get(organizationId, slug, exceptId || '');
  if (row) throw new Error('sprint slug already in use');
}

function slugTaken(db, organizationId, slug, exceptId) {
  return !!db.prepare(`
    SELECT 1 AS n FROM sprints WHERE organization_id = ? AND slug = ? AND id != ?
  `).get(organizationId, slug, exceptId || '');
}

/** Reserva un slug libre en la org (p. ej. sprint-1 → sprint-1-2 si ya existe). */
function allocateUniqueSlug(db, organizationId, preferred, exceptId = '') {
  const base = slugify(preferred);
  if (!slugTaken(db, organizationId, base, exceptId)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`.slice(0, 64);
    if (!slugTaken(db, organizationId, candidate, exceptId)) return candidate;
  }
  throw new Error('sprint slug already in use');
}

/** Código corto único por org (2–4 chars), derivado de slug/nombre como en proyectos. */
function allocateSprintCode(db, organizationId, slug, name, exceptId = null) {
  let base = suggestProjectCode(slug, name);
  let code = base;
  let n = 1;
  while (db.prepare(`
    SELECT 1 AS n FROM sprints
    WHERE organization_id = ? AND code = ? AND (? IS NULL OR id != ?)
  `).get(organizationId, code, exceptId, exceptId)) {
    const suffix = String(n);
    code = `${base.slice(0, Math.max(2, 4 - suffix.length))}${suffix}`.slice(0, 4);
    n += 1;
    if (n > 99) throw new Error('sprint code already in use');
  }
  return code;
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
  code,
}) {
  let org = organization_id ? orgs.getById(db, organization_id) : null;
  if (!org && organization_slug) org = orgs.getBySlug(db, organization_slug);
  if (!org) throw new Error('organization not found');
  validateDates(start_date, end_date);
  const id = entityId();
  const ts = nowIso();
  const finalSlug = slug != null && String(slug).trim() !== ''
    ? (() => {
      const s = slugify(slug);
      assertUniqueSlug(db, org.id, s, null);
      return s;
    })()
    : allocateUniqueSlug(db, org.id, name);
  const finalCode = code != null && String(code).trim() !== ''
    ? normalizeProjectCode(code)
    : allocateSprintCode(db, org.id, finalSlug, name);
  const finalStatus = normalizeSprintStatus(status || 'inactive');
  db.prepare(`
    INSERT INTO sprints(
      id, organization_id, slug, code, name, goal, start_date, end_date, status, archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    id, org.id, finalSlug, finalCode, name, goal || null, start_date, end_date,
    finalStatus, ts, ts,
  );
  if (project_ids && project_ids.length) setProjects(db, id, project_ids);
  return attachProjects(db, getById(db, id));
}

function update(db, id, fields) {
  const sprint = getById(db, id);
  if (!sprint) throw new Error('sprint not found');
  const name = fields.name != null ? fields.name : sprint.name;
  const goal = fields.goal !== undefined ? fields.goal : sprint.goal;
  const start = fields.start_date != null ? fields.start_date : sprint.start_date;
  const end = fields.end_date != null ? fields.end_date : sprint.end_date;
  const status = fields.status != null ? normalizeSprintStatus(fields.status) : sprint.status;
  const archived = fields.archived != null ? (fields.archived ? 1 : 0) : sprint.archived;
  validateDates(start, end);
  const ts = nowIso();
  db.prepare(`
    UPDATE sprints SET name = ?, goal = ?, start_date = ?, end_date = ?, status = ?, archived = ?, updated_at = ?
    WHERE id = ?
  `).run(name, goal, start, end, status, archived, ts, id);
  if (fields.project_ids !== undefined) setProjects(db, id, fields.project_ids);
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
  const linked = listProjectIds(db, sprint_id);
  if (linked.length) {
    const onSprint = linked.includes(project_id);
    if (!onSprint) throw new Error('sprint is not linked to this project');
  }
  const onBoard = db.prepare(
    'SELECT 1 AS n FROM board_projects WHERE board_id = ? AND project_id = ?',
  ).get(board_id, project_id);
  if (!onBoard) throw new Error('project is not linked to board');
}

function assertEpicSprint(db, { sprint_id, project_id }) {
  if (!sprint_id) return;
  const sprint = getById(db, sprint_id);
  if (!sprint) throw new Error('sprint not found');
  const linked = listProjectIds(db, sprint_id);
  if (linked.length && !linked.includes(project_id)) {
    throw new Error('sprint is not linked to this project');
  }
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
  normalizeSprintStatus,
  allocateSprintCode,
};
