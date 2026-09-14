'use strict';

const { entityId } = require('../../ids.js');
const { nowIso } = require('../../util.js');

function create(db, { project_id, title, description, status }) {
  const id = entityId();
  const ts = nowIso();
  db.prepare(`
    INSERT INTO epics(id, project_id, title, description, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, project_id, title, description || null, status || 'planned', ts, ts);
  return getById(db, id);
}

function getById(db, id) {
  return db.prepare('SELECT * FROM epics WHERE id = ?').get(id) || null;
}

function listByProject(db, projectId) {
  return db.prepare('SELECT * FROM epics WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId);
}

function update(db, id, fields) {
  const epic = getById(db, id);
  if (!epic) throw new Error('epic not found');
  const title = fields.title != null ? fields.title : epic.title;
  const description = fields.description != null ? fields.description : epic.description;
  const status = fields.status != null ? fields.status : epic.status;
  const ts = nowIso();
  db.prepare(`
    UPDATE epics SET title = ?, description = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(title, description, status, ts, id);
  return getById(db, id);
}

module.exports = { create, getById, listByProject, update };
