'use strict';

function nowIso() {
  return new Date().toISOString();
}

function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'item';
}

function boolToInt(value) {
  return value ? 1 : 0;
}

function intToBool(value) {
  return !!value;
}

function rowToCard(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    board_id: row.board_id,
    epic_id: row.epic_id,
    stage_id: row.stage_id,
    position: row.position,
    title: row.title,
    notes: row.notes || '',
    session_ref: row.session_ref,
    flagged: intToBool(row.flagged),
    archived: intToBool(row.archived),
    priority: row.priority != null ? row.priority : 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

module.exports = { nowIso, slugify, boolToInt, intToBool, rowToCard };
