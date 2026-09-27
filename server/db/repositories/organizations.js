'use strict';

const { entityId } = require('../../ids.js');
const { nowIso, slugify } = require('../../util.js');

function create(db, { slug, name }) {
  const id = entityId();
  const ts = nowIso();
  const finalSlug = slugify(slug || name);
  db.prepare(`
    INSERT INTO organizations(id, slug, name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, finalSlug, name, ts, ts);
  return getById(db, id);
}

function getById(db, id) {
  return db.prepare('SELECT * FROM organizations WHERE id = ?').get(id) || null;
}

function getBySlug(db, slug) {
  return db.prepare('SELECT * FROM organizations WHERE slug = ?').get(slugify(slug)) || null;
}

function list(db, { includeArchived = false } = {}) {
  const sql = includeArchived
    ? 'SELECT * FROM organizations ORDER BY name COLLATE NOCASE'
    : 'SELECT * FROM organizations WHERE archived = 0 ORDER BY name COLLATE NOCASE';
  return db.prepare(sql).all();
}

function update(db, slug, { name, archived }) {
  const org = getBySlug(db, slug);
  if (!org) throw new Error('organization not found');
  const finalName = name != null ? name : org.name;
  const finalArchived = archived != null ? (archived ? 1 : 0) : org.archived;
  const ts = nowIso();
  db.prepare('UPDATE organizations SET name = ?, archived = ?, updated_at = ? WHERE id = ?')
    .run(finalName, finalArchived, ts, org.id);
  return getById(db, org.id);
}

function remove(db, slug) {
  const org = getBySlug(db, slug);
  if (!org) throw new Error('organization not found');
  const boards = db.prepare('SELECT COUNT(*) AS c FROM boards WHERE organization_id = ? AND archived = 0').get(org.id);
  const projs = db.prepare('SELECT COUNT(*) AS c FROM projects WHERE organization_id = ? AND archived = 0').get(org.id);
  if (boards.c > 0 || projs.c > 0) throw new Error('organization has active boards or projects');
  db.prepare('DELETE FROM organizations WHERE id = ?').run(org.id);
  return { removed: true };
}

module.exports = { create, getById, getBySlug, list, update, remove };
