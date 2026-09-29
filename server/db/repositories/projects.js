'use strict';

const { entityId, normalizeProjectCode } = require('../../ids.js');
const { allocateProjectCode } = require('../backfill-003.js');
const { nowIso, slugify } = require('../../util.js');
const orgs = require('./organizations.js');

function create(db, { organization_id, organization_slug, slug, name, description, code }) {
  let org = organization_id ? orgs.getById(db, organization_id) : null;
  if (!org && organization_slug) org = orgs.getBySlug(db, organization_slug);
  if (!org) throw new Error('organization not found');
  const id = entityId();
  const ts = nowIso();
  const finalSlug = slugify(slug || name);
  const finalCode = code
    ? normalizeProjectCode(code)
    : allocateProjectCode(db, org.id, finalSlug, name);
  db.prepare(`
    INSERT INTO projects(id, organization_id, slug, name, description, code, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, org.id, finalSlug, name, description || null, finalCode, ts, ts);
  return getById(db, id);
}

function ensureCode(db, projectId, code) {
  const project = getById(db, projectId);
  if (!project) return null;
  if (code) {
    const finalCode = normalizeProjectCode(code);
    if (project.code !== finalCode) {
      db.prepare('UPDATE projects SET code = ?, updated_at = ? WHERE id = ?')
        .run(finalCode, nowIso(), projectId);
    }
    return getById(db, projectId);
  }
  if (project.code) return project;
  const finalCode = allocateProjectCode(db, project.organization_id, project.slug, project.name, project.id);
  db.prepare('UPDATE projects SET code = ?, updated_at = ? WHERE id = ?')
    .run(finalCode, nowIso(), projectId);
  return getById(db, projectId);
}

function getById(db, id) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) || null;
}

function getByOrgSlug(db, orgSlug, projectSlug) {
  const org = orgs.getBySlug(db, orgSlug);
  if (!org) return null;
  return db.prepare('SELECT * FROM projects WHERE organization_id = ? AND slug = ?')
    .get(org.id, slugify(projectSlug)) || null;
}

function listByOrg(db, { organization_id, organization_slug }) {
  let orgId = organization_id;
  if (!orgId && organization_slug) {
    const org = orgs.getBySlug(db, organization_slug);
    orgId = org ? org.id : null;
  }
  if (!orgId) return [];
  return db.prepare('SELECT * FROM projects WHERE organization_id = ? AND archived = 0 ORDER BY name COLLATE NOCASE')
    .all(orgId);
}

function listByOrgAdmin(db, { organization_id, organization_slug }) {
  let orgId = organization_id;
  if (!orgId && organization_slug) {
    const org = orgs.getBySlug(db, organization_slug);
    orgId = org ? org.id : null;
  }
  if (!orgId) return [];
  return db.prepare('SELECT * FROM projects WHERE organization_id = ? ORDER BY name COLLATE NOCASE')
    .all(orgId);
}

function linkRepo(db, { project_id, owner, repo }) {
  db.prepare(`
    INSERT OR IGNORE INTO project_github_repos(project_id, owner, repo)
    VALUES (?, ?, ?)
  `).run(project_id, owner, repo);
  return { project_id, owner, repo };
}

function listRepos(db, projectId) {
  return db.prepare('SELECT owner, repo FROM project_github_repos WHERE project_id = ?')
    .all(projectId);
}

function update(db, id, fields) {
  const project = getById(db, id);
  if (!project) throw new Error('project not found');
  const name = fields.name != null ? fields.name : project.name;
  const description = fields.description !== undefined ? fields.description : project.description;
  const color = fields.color !== undefined ? fields.color : project.color;
  const archived = fields.archived != null ? (fields.archived ? 1 : 0) : project.archived;
  const ts = nowIso();
  db.prepare(`
    UPDATE projects SET name = ?, description = ?, color = ?, archived = ?, updated_at = ?
    WHERE id = ?
  `).run(name, description, color, archived, ts, id);
  return getById(db, id);
}

function deletionImpact(db, id) {
  const project = getById(db, id);
  if (!project) throw new Error('project not found');
  const cards = db.prepare('SELECT COUNT(*) AS c FROM cards WHERE project_id = ?').get(id).c;
  const archivedCards = db.prepare('SELECT COUNT(*) AS c FROM cards WHERE project_id = ? AND archived = 1').get(id).c;
  const subtasks = db.prepare(`
    SELECT COUNT(*) AS c FROM cards WHERE project_id = ? AND issue_type = 'subtask'
  `).get(id).c;
  const epics = db.prepare('SELECT COUNT(*) AS c FROM epics WHERE project_id = ?').get(id).c;
  const boardLinks = db.prepare('SELECT COUNT(*) AS c FROM board_projects WHERE project_id = ?').get(id).c;
  const sprintLinks = db.prepare('SELECT COUNT(*) AS c FROM sprint_projects WHERE project_id = ?').get(id).c;
  const repos = db.prepare('SELECT COUNT(*) AS c FROM project_github_repos WHERE project_id = ?').get(id).c;
  return {
    project_id: id,
    project_name: project.name,
    cards,
    archived_cards: archivedCards,
    subtasks,
    epics,
    board_links: boardLinks,
    sprint_links: sprintLinks,
    github_repos: repos,
  };
}

function remove(db, id, { force = false } = {}) {
  const project = getById(db, id);
  if (!project) throw new Error('project not found');
  const impact = deletionImpact(db, id);
  if (impact.cards > 0 && !force) throw new Error('project has cards; use force after confirmation');
  const cardsRepo = require('./cards.js');
  const boardsRepo = require('./boards.js');
  const boardIds = new Set(
    db.prepare('SELECT DISTINCT board_id AS id FROM cards WHERE project_id = ?').all(id).map(r => r.id),
  );
  const cardRows = db.prepare('SELECT id FROM cards WHERE project_id = ?').all(id);
  const idSet = new Set(cardRows.map(r => r.id));
  const roots = cardRows.filter(r => {
    const parent = db.prepare('SELECT parent_id FROM cards WHERE id = ?').get(r.id);
    return !parent.parent_id || !idSet.has(parent.parent_id);
  });
  for (const root of roots) cardsRepo.removeCardTree(db, root.id);
  db.prepare('DELETE FROM board_projects WHERE project_id = ?').run(id);
  db.prepare('DELETE FROM sprint_projects WHERE project_id = ?').run(id);
  db.prepare('DELETE FROM project_github_repos WHERE project_id = ?').run(id);
  db.prepare('DELETE FROM epics WHERE project_id = ?').run(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  for (const boardId of boardIds) boardsRepo.bumpVersion(db, boardId);
  return { removed: true, impact };
}

module.exports = {
  create, getById, getByOrgSlug, listByOrg, listByOrgAdmin, linkRepo, listRepos,
  ensureCode, update, deletionImpact, remove,
};
