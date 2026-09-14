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

function list(db) {
  return db.prepare('SELECT * FROM organizations ORDER BY name COLLATE NOCASE').all();
}

module.exports = { create, getById, getBySlug, list };
