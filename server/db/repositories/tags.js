'use strict';

const { entityId } = require('../../ids.js');
const { nowIso } = require('../../util.js');
const { colorByIndex, colorByName, normalizeHexColor } = require('../../entity-colors.js');
const events = require('./events.js');
const boards = require('./boards.js');

function normalizeTagName(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
}

/** @deprecated use normalizeTagName — kept for card tag strings */
function normalizeName(name) {
  return normalizeTagName(name);
}

function organizationIdForBoard(db, boardId) {
  const board = boards.getById(db, boardId);
  if (!board) throw new Error('board not found');
  return board.organization_id;
}

function listByOrganization(db, organizationId, { includeArchived = false } = {}) {
  const sql = includeArchived
    ? `SELECT * FROM tags WHERE organization_id = ? ORDER BY name COLLATE NOCASE`
    : `SELECT * FROM tags WHERE organization_id = ? AND archived = 0 ORDER BY name COLLATE NOCASE`;
  return db.prepare(sql).all(organizationId);
}

/** Tags for a board = active tags in the board's organization. */
function listByBoard(db, boardId) {
  const orgId = organizationIdForBoard(db, boardId);
  return listByOrganization(db, orgId, { includeArchived: false });
}

function nextTagColor(db, organizationId, name) {
  const n = db.prepare('SELECT COUNT(*) AS c FROM tags WHERE organization_id = ?').get(organizationId).c;
  return colorByName(name) || colorByIndex(Number(n) + 2);
}

function insertTag(db, organizationId, name) {
  const id = entityId();
  const ts = nowIso();
  const color = nextTagColor(db, organizationId, name);
  db.prepare(`
    INSERT INTO tags(id, organization_id, name, color, archived, created_at) VALUES (?, ?, ?, ?, 0, ?)
  `).run(id, organizationId, name, color, ts);
  return db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
}

function findOrCreate(db, organizationId, rawName) {
  const name = normalizeName(rawName);
  if (!name) return null;
  const existing = db.prepare(`
    SELECT * FROM tags WHERE organization_id = ? AND name = ? COLLATE NOCASE
  `).get(organizationId, name);
  if (existing) {
    if (existing.archived) {
      db.prepare('UPDATE tags SET archived = 0 WHERE id = ?').run(existing.id);
      return getById(db, existing.id);
    }
    return existing;
  }
  return insertTag(db, organizationId, name);
}

function listForCard(db, cardId) {
  return db.prepare(`
    SELECT t.* FROM tags t
    JOIN card_tags ct ON ct.tag_id = t.id
    WHERE ct.card_id = ?
    ORDER BY t.name COLLATE NOCASE
  `).all(cardId);
}

function setForCard(db, cardId, boardId, rawNames, { emitEvent = true } = {}) {
  const card = db.prepare('SELECT board_id FROM cards WHERE id = ?').get(cardId);
  if (!card) throw new Error('card not found');
  const orgId = organizationIdForBoard(db, boardId || card.board_id);
  const names = [...new Set((rawNames || []).map(normalizeName).filter(Boolean))];
  const tagIds = names.map(n => findOrCreate(db, orgId, n).id);
  db.prepare('DELETE FROM card_tags WHERE card_id = ?').run(cardId);
  const ins = db.prepare('INSERT INTO card_tags(card_id, tag_id) VALUES (?, ?)');
  for (const tagId of tagIds) ins.run(cardId, tagId);
  if (emitEvent) {
    events.insert(db, {
      card_id: cardId,
      board_id: card.board_id,
      event_type: 'tags_changed',
      payload: { tags: names },
    });
  }
  return listForCard(db, cardId);
}

function mapForBoardCards(db, boardId) {
  const rows = db.prepare(`
    SELECT ct.card_id, t.id, t.name, t.color
    FROM card_tags ct
    JOIN tags t ON t.id = ct.tag_id
    JOIN cards c ON c.id = ct.card_id
    WHERE c.board_id = ?
    ORDER BY t.name COLLATE NOCASE
  `).all(boardId);
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.card_id)) map.set(row.card_id, []);
    map.get(row.card_id).push({ id: row.id, name: row.name, color: row.color || null });
  }
  return map;
}

function createForOrganization(db, organizationId, rawName) {
  const name = normalizeTagName(rawName);
  if (!name) throw new Error('tag name required');
  const existing = db.prepare(`
    SELECT * FROM tags WHERE organization_id = ? AND name = ? COLLATE NOCASE
  `).get(organizationId, name);
  if (existing) {
    if (existing.archived) {
      db.prepare('UPDATE tags SET archived = 0 WHERE id = ?').run(existing.id);
      return getById(db, existing.id);
    }
    return existing;
  }
  return insertTag(db, organizationId, name);
}

function create(db, boardId, rawName) {
  const orgId = organizationIdForBoard(db, boardId);
  return createForOrganization(db, orgId, rawName);
}

function getById(db, id) {
  return db.prepare('SELECT * FROM tags WHERE id = ?').get(id) || null;
}

function update(db, id, fields) {
  const tag = getById(db, id);
  if (!tag) throw new Error('tag not found');
  let name = tag.name;
  if (Object.prototype.hasOwnProperty.call(fields, 'name')) {
    name = normalizeTagName(fields.name);
    if (!name) throw new Error('tag name required');
    const clash = db.prepare(`
      SELECT id FROM tags WHERE organization_id = ? AND name = ? COLLATE NOCASE AND id != ?
    `).get(tag.organization_id, name, id);
    if (clash) throw new Error('tag name already exists');
  }
  let color = tag.color;
  if (fields.color !== undefined) {
    const next = fields.color == null || fields.color === ''
      ? nextTagColor(db, tag.organization_id, name)
      : normalizeHexColor(fields.color);
    if (fields.color != null && fields.color !== '' && !next) throw new Error('invalid tag color');
    color = next;
  }
  const archived = fields.archived != null ? (fields.archived ? 1 : 0) : tag.archived;
  db.prepare('UPDATE tags SET name = ?, color = ?, archived = ? WHERE id = ?').run(name, color, archived, id);
  return getById(db, id);
}

function rename(db, id, rawName) {
  return update(db, id, { name: rawName });
}

function boardIdsUsingTag(db, tagId) {
  return db.prepare(`
    SELECT DISTINCT c.board_id AS board_id
    FROM card_tags ct
    JOIN cards c ON c.id = ct.card_id
    WHERE ct.tag_id = ?
  `).all(tagId).map(r => r.board_id);
}

function deletionImpact(db, id) {
  const tag = getById(db, id);
  if (!tag) throw new Error('tag not found');
  const cards = db.prepare('SELECT COUNT(*) AS c FROM card_tags WHERE tag_id = ?').get(id).c;
  return {
    tag_id: id,
    tag_name: tag.name,
    cards,
  };
}

function remove(db, id) {
  const tag = getById(db, id);
  if (!tag) throw new Error('tag not found');
  const boardIds = boardIdsUsingTag(db, id);
  db.prepare('DELETE FROM card_tags WHERE tag_id = ?').run(id);
  db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  return { removed: true, board_ids: boardIds };
}

module.exports = {
  normalizeTagName,
  normalizeName,
  listByOrganization,
  listByBoard,
  findOrCreate,
  listForCard,
  setForCard,
  mapForBoardCards,
  create,
  createForOrganization,
  getById,
  rename,
  update,
  remove,
  deletionImpact,
  boardIdsUsingTag,
};
