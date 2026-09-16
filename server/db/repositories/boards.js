'use strict';

const { entityId } = require('../../ids.js');
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

function create(db, { organization_id, organization_slug, slug, name, project_ids = [] }) {
  let org = organization_id ? orgs.getById(db, organization_id) : null;
  if (!org && organization_slug) org = orgs.getBySlug(db, organization_slug);
  if (!org) throw new Error('organization not found');

  const id = entityId();
  const ts = nowIso();
  const finalSlug = slugify(slug || name);
  db.prepare(`
    INSERT INTO boards(id, organization_id, slug, name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, org.id, finalSlug, name, ts, ts);

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

function resolveBoard(db, idOrSlug) {
  const byId = getById(db, idOrSlug);
  if (byId) return byId;
  const rows = db.prepare('SELECT * FROM boards WHERE slug = ?').all(slugify(idOrSlug));
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
    return db.prepare('SELECT * FROM boards ORDER BY name COLLATE NOCASE').all();
  }
  return db.prepare('SELECT * FROM boards WHERE organization_id = ? ORDER BY name COLLATE NOCASE')
    .all(orgId);
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

function getSnapshot(db, idOrSlug) {
  const board = resolveBoard(db, idOrSlug);
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
  const snapshot = {
    board: {
      id: board.id,
      slug: board.slug,
      name: board.name,
      organization_id: board.organization_id,
    },
    projects: projectRows.map(p => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      code: p.code || null,
      description: p.description,
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
    })),
    cards: cardRows,
    version: getVersion(db, board.id),
  };
  return cardDetail.enrichSnapshot(db, snapshot);
}

module.exports = {
  create,
  getById,
  getBySlug,
  resolveBoard,
  list,
  listStages,
  listProjects,
  addProject,
  removeProject,
  getSnapshot,
  bumpVersion,
  getVersion,
};
