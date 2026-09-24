'use strict';

const { entityId } = require('../../ids.js');
const { nowIso } = require('../../util.js');

function create(db, { project_id, title, description, status, sprint_id }) {
  const id = entityId();
  const ts = nowIso();
  if (sprint_id) {
    const sprints = require('./sprints.js');
    sprints.assertEpicSprint(db, { sprint_id, project_id });
  }
  db.prepare(`
    INSERT INTO epics(id, project_id, title, description, status, sprint_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, project_id, title, description || null, status || 'planned', sprint_id || null, ts, ts);
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
  let sprintId = epic.sprint_id;
  if (fields.sprint_id !== undefined) {
    if (fields.sprint_id) {
      const sprints = require('./sprints.js');
      sprints.assertEpicSprint(db, { sprint_id: fields.sprint_id, project_id: epic.project_id });
      sprintId = fields.sprint_id;
    } else {
      sprintId = null;
    }
  }
  const ts = nowIso();
  db.prepare(`
    UPDATE epics SET title = ?, description = ?, status = ?, sprint_id = ?, updated_at = ?
    WHERE id = ?
  `).run(title, description, status, sprintId, ts, id);
  return getById(db, id);
}

function remove(db, id) {
  const epic = getById(db, id);
  if (!epic) throw new Error('epic not found');
  db.prepare('UPDATE cards SET epic_id = NULL WHERE epic_id = ?').run(id);
  db.prepare('DELETE FROM epics WHERE id = ?').run(id);
  return { removed: true };
}

module.exports = { create, getById, listByProject, update, remove };
