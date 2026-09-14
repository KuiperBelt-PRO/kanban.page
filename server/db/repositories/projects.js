'use strict';

const { entityId } = require('../../ids.js');
const { nowIso, slugify } = require('../../util.js');
const orgs = require('./organizations.js');

function create(db, { organization_id, organization_slug, slug, name, description }) {
  let org = organization_id ? orgs.getById(db, organization_id) : null;
  if (!org && organization_slug) org = orgs.getBySlug(db, organization_slug);
  if (!org) throw new Error('organization not found');
  const id = entityId();
  const ts = nowIso();
  const finalSlug = slugify(slug || name);
  db.prepare(`
    INSERT INTO projects(id, organization_id, slug, name, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, org.id, finalSlug, name, description || null, ts, ts);
  return getById(db, id);
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

module.exports = {
  create, getById, getByOrgSlug, listByOrg, linkRepo, listRepos,
};
