'use strict';

const { entityId, suggestProjectCode } = require('../../ids.js');
const { nowIso, slugify } = require('../../util.js');
const { DEFAULT_STAGES } = require('../../config.js');
const orgs = require('./organizations.js');
const projects = require('./projects.js');
const epics = require('./epics.js');

function bumpVersion(db, boardId) {
  db.prepare(`
    INSERT INTO board_versions(board_id, version) VALUES (?, 1)
    ON CONFLICT(board_id) DO UPDATE SET version = version + 1
  `).run(boardId);
  const row = db.prepare('SELECT version FROM board_versions WHERE board_id = ?').get(boardId);
  return row ? row.version : 1;
}

function getVersion(db, boardId) {
  const row = db.prepare('SELECT version FROM board_versions WHERE board_id = ?').get(boardId);
  return row ? row.version : 0;
}

function allocateBoardCode(db, organizationId, slug, name, exceptId = null) {
  let base = suggestProjectCode(slug, name);
  let code = base;
  let n = 1;
  while (db.prepare(`
    SELECT 1 AS n FROM boards
    WHERE organization_id = ? AND code = ? AND (? IS NULL OR id != ?)
  `).get(organizationId, code, exceptId, exceptId)) {
    const suffix = String(n);
    code = `${base.slice(0, Math.max(2, 4 - suffix.length))}${suffix}`.slice(0, 4);
    n += 1;
    if (n > 99) throw new Error('board code already in use');
  }
  return code;
}

function create(db, { organization_id, organization_slug, slug, name, project_ids = [] }) {
  let org = organization_id ? orgs.getById(db, organization_id) : null;
  if (!org && organization_slug) org = orgs.getBySlug(db, organization_slug);
  if (!org) throw new Error('organization not found');

  const id = entityId();
  const ts = nowIso();
  const finalSlug = slugify(slug || name);
  const code = allocateBoardCode(db, org.id, finalSlug, name);
  db.prepare(`
    INSERT INTO boards(id, organization_id, slug, code, name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, org.id, finalSlug, code, name, ts, ts);

  const stages = DEFAULT_STAGES.map((stageName, index) => {
    const stageId = entityId();
    db.prepare(`
      INSERT INTO board_stages(id, board_id, name, position)
      VALUES (?, ?, ?, ?)
    `).run(stageId, id, stageName, index + 1);
    return { id: stageId, board_id: id, name: stageName, position: index + 1 };
  });

  for (const projectId of project_ids) addProject(db, { board_id: id, project_id: projectId });
  bumpVersion(db, id);

  return { board: getById(db, id), stages };
}

function getById(db, id) {
  return db.prepare('SELECT * FROM boards WHERE id = ?').get(id) || null;
}

function getBySlug(db, orgSlug, boardSlug) {
  const org = orgs.getBySlug(db, orgSlug);
  if (!org) return null;
  return db.prepare('SELECT * FROM boards WHERE organization_id = ? AND slug = ?')
    .get(org.id, slugify(boardSlug)) || null;
}

function resolveBoard(db, idOrSlug, { organization_id, organization_slug } = {}) {
  const byId = getById(db, idOrSlug);
  if (byId) return byId;
  const slug = slugify(idOrSlug);
  let orgId = organization_id;
  if (!orgId && organization_slug) {
    const org = orgs.getBySlug(db, organization_slug);
    orgId = org ? org.id : null;
  }
  if (orgId) {
    return db.prepare('SELECT * FROM boards WHERE organization_id = ? AND slug = ?').get(orgId, slug) || null;
  }
  const rows = db.prepare('SELECT * FROM boards WHERE slug = ?').all(slug);
  if (rows.length === 1) return rows[0];
  if (rows.length > 1) throw new Error(`ambiguous board slug "${idOrSlug}"`);
  return null;
}

function list(db, { organization_id, organization_slug }) {
  let orgId = organization_id;
  if (!orgId && organization_slug) {
    const org = orgs.getBySlug(db, organization_slug);
    orgId = org ? org.id : null;
  }
  if (!orgId) {
    return db.prepare('SELECT * FROM boards WHERE archived = 0 ORDER BY name COLLATE NOCASE').all();
  }
  return db.prepare('SELECT * FROM boards WHERE organization_id = ? AND archived = 0 ORDER BY name COLLATE NOCASE')
    .all(orgId);
}

function listForOrgAdmin(db, { organization_id, organization_slug }) {
  let orgId = organization_id;
  if (!orgId && organization_slug) {
    const org = orgs.getBySlug(db, organization_slug);
    orgId = org ? org.id : null;
  }
  if (!orgId) return [];
  return db.prepare('SELECT * FROM boards WHERE organization_id = ? ORDER BY name COLLATE NOCASE').all(orgId);
}

function listStages(db, boardId) {
  return db.prepare('SELECT * FROM board_stages WHERE board_id = ? ORDER BY position').all(boardId);
}

function listProjects(db, boardId) {
  return db.prepare(`
    SELECT p.* FROM projects p
    JOIN board_projects bp ON bp.project_id = p.id
    WHERE bp.board_id = ?
    ORDER BY p.name COLLATE NOCASE
  `).all(boardId);
}

function addProject(db, { board_id, project_id }) {
  const board = getById(db, board_id);
  const project = projects.getById(db, project_id);
  if (!board) throw new Error('board not found');
  if (!project) throw new Error('project not found');
  db.prepare('INSERT OR IGNORE INTO board_projects(board_id, project_id) VALUES (?, ?)')
    .run(board_id, project_id);
  bumpVersion(db, board_id);
  return { board_id, project_id };
}

function removeProject(db, { board_id, project_id }) {
  db.prepare('DELETE FROM board_projects WHERE board_id = ? AND project_id = ?')
    .run(board_id, project_id);
  bumpVersion(db, board_id);
  return { board_id, project_id };
}

function getSnapshot(db, idOrSlug, resolveOpts) {
  const board = resolveBoard(db, idOrSlug, resolveOpts);
  if (!board) throw new Error(`board not found: ${idOrSlug}`);
  const stageRows = listStages(db, board.id);
  const projectRows = listProjects(db, board.id);
  const epicRows = [];
  for (const p of projectRows) {
    epicRows.push(...epics.listByProject(db, p.id));
  }
  const cardsRepo = require('./cards.js');
  const cardDetail = require('./card-detail.js');
  const cardRows = cardsRepo.listByBoard(db, board.id, { includeArchived: true });
  const sprintsRepo = require('./sprints.js');
  const sprintRows = sprintsRepo.listForBoard(db, board.id);
  const snapshot = {
    board: {
      id: board.id,
      slug: board.slug,
      code: board.code || null,
      name: board.name,
      organization_id: board.organization_id,
    },
    projects: projectRows.map(p => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      code: p.code || null,
      description: p.description,
      color: p.color || null,
    })),
    stages: stageRows.map(s => ({
      id: s.id,
      name: s.name,
      position: s.position,
    })),
    epics: epicRows.map(e => ({
      id: e.id,
      project_id: e.project_id,
      title: e.title,
      status: e.status,
      sprint_id: e.sprint_id || null,
    })),
    sprints: sprintRows.map(s => ({
      id: s.id,
      slug: s.slug,
      code: s.code || null,
      name: s.name,
      goal: s.goal,
      start_date: s.start_date,
      end_date: s.end_date,
      status: s.status,
      project_ids: s.project_ids,
    })),
    cards: cardRows,
    version: getVersion(db, board.id),
  };
  return cardDetail.enrichSnapshot(db, snapshot);
}

function updateBoard(db, boardId, { name, archived }) {
  const board = getById(db, boardId);
  if (!board) throw new Error('board not found');
  const finalName = name != null ? name : board.name;
  const finalArchived = archived != null ? (archived ? 1 : 0) : board.archived;
  const ts = nowIso();
  db.prepare('UPDATE boards SET name = ?, archived = ?, updated_at = ? WHERE id = ?')
    .run(finalName, finalArchived, ts, boardId);
  bumpVersion(db, boardId);
  return getById(db, boardId);
}

function removeBoard(db, boardIdOrSlug) {
  const board = resolveBoard(db, boardIdOrSlug);
  if (!board) throw new Error('board not found');
  const cardCount = db.prepare('SELECT COUNT(*) AS c FROM cards WHERE board_id = ?').get(board.id);
  if (cardCount.c > 0) throw new Error('board has cards');
  db.prepare('DELETE FROM board_projects WHERE board_id = ?').run(board.id);
  db.prepare('DELETE FROM board_stages WHERE board_id = ?').run(board.id);
  db.prepare('DELETE FROM board_versions WHERE board_id = ?').run(board.id);
  db.prepare('DELETE FROM boards WHERE id = ?').run(board.id);
  return { removed: true, slug: board.slug };
}

function createStage(db, boardId, name) {
  const board = getById(db, boardId);
  if (!board) throw new Error('board not found');
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('stage name required');
  const max = db.prepare('SELECT MAX(position) AS m FROM board_stages WHERE board_id = ?').get(boardId);
  const position = (max?.m || 0) + 1;
  const id = entityId();
  db.prepare(`
    INSERT INTO board_stages(id, board_id, name, position) VALUES (?, ?, ?, ?)
  `).run(id, boardId, trimmed, position);
  bumpVersion(db, boardId);
  return db.prepare('SELECT * FROM board_stages WHERE id = ?').get(id);
}

function updateStage(db, boardId, stageId, { name }) {
  const stage = db.prepare('SELECT * FROM board_stages WHERE id = ? AND board_id = ?').get(stageId, boardId);
  if (!stage) throw new Error('stage not found');
  const trimmed = name != null ? String(name).trim() : stage.name;
  if (!trimmed) throw new Error('stage name required');
  db.prepare('UPDATE board_stages SET name = ? WHERE id = ?').run(trimmed, stageId);
  bumpVersion(db, boardId);
  return db.prepare('SELECT * FROM board_stages WHERE id = ?').get(stageId);
}

function deleteStage(db, boardId, stageId) {
  const stages = listStages(db, boardId);
  const idx = stages.findIndex(s => s.id === stageId);
  if (idx < 0) throw new Error('stage not found');
  if (stages.length <= 1) throw new Error('board needs at least one stage');
  const cardCount = db.prepare('SELECT COUNT(*) AS c FROM cards WHERE stage_id = ? AND archived = 0').get(stageId);
  let movedToStageId = null;
  if (cardCount.c > 0) {
    if (idx > 0) movedToStageId = stages[idx - 1].id;
    else movedToStageId = stages[1].id;
    db.prepare('UPDATE cards SET stage_id = ? WHERE stage_id = ?').run(movedToStageId, stageId);
  }
  db.prepare('DELETE FROM board_stages WHERE id = ?').run(stageId);
  bumpVersion(db, boardId);
  return { removed: true, moved_cards: cardCount.c, moved_to_stage_id: movedToStageId };
}

function reorderStages(db, boardId, order) {
  const ids = Array.isArray(order) ? order : [];
  const stages = listStages(db, boardId);
  if (ids.length !== stages.length) throw new Error('invalid stage order');
  const set = new Set(stages.map(s => s.id));
  for (const id of ids) {
    if (!set.has(id)) throw new Error('invalid stage id in order');
  }
  const upd = db.prepare('UPDATE board_stages SET position = ? WHERE id = ? AND board_id = ?');
  const apply = db.transaction(() => {
    ids.forEach((id, index) => upd.run(-(index + 1), id, boardId));
    ids.forEach((id, index) => upd.run(index + 1, id, boardId));
  });
  apply();
  bumpVersion(db, boardId);
  return listStages(db, boardId);
}

function getMembership(db, boardId) {
  return {
    projects: listProjects(db, boardId),
    stages: listStages(db, boardId),
  };
}

module.exports = {
  allocateBoardCode,
  create,
  getById,
  getBySlug,
  resolveBoard,
  list,
  listForOrgAdmin,
  listStages,
  listProjects,
  addProject,
  removeProject,
  getSnapshot,
  bumpVersion,
  getVersion,
  updateBoard,
  createStage,
  updateStage,
  deleteStage,
  reorderStages,
  getMembership,
  removeBoard,
};
