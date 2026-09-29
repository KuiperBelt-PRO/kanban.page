'use strict';

const { entityId } = require('../../ids.js');
const { nowIso } = require('../../util.js');
const events = require('./events.js');
const boards = require('./boards.js');

function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function organizationIdForBoard(db, boardId) {
  const board = boards.getById(db, boardId);
  if (!board) throw new Error('board not found');
  return board.organization_id;
}

function listByOrganization(db, organizationId) {
  return db.prepare(`
    SELECT * FROM tags WHERE organization_id = ?
    ORDER BY name COLLATE NOCASE
  `).all(organizationId);
}

/** Tags for a board = all tags in the board's organization. */
function listByBoard(db, boardId) {
  const orgId = organizationIdForBoard(db, boardId);
  return listByOrganization(db, orgId);
}

function findOrCreate(db, organizationId, rawName) {
  const name = normalizeName(rawName);
  if (!name) return null;
  const existing = db.prepare(`
    SELECT * FROM tags WHERE organization_id = ? AND name = ? COLLATE NOCASE
  `).get(organizationId, name);
  if (existing) return existing;
  const id = entityId();
  const ts = nowIso();
  db.prepare(`
    INSERT INTO tags(id, organization_id, name, created_at) VALUES (?, ?, ?, ?)
  `).run(id, organizationId, name, ts);
  return db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
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
    SELECT ct.card_id, t.id, t.name
    FROM card_tags ct
    JOIN tags t ON t.id = ct.tag_id
    JOIN cards c ON c.id = ct.card_id
    WHERE c.board_id = ?
    ORDER BY t.name COLLATE NOCASE
  `).all(boardId);
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.card_id)) map.set(row.card_id, []);
    map.get(row.card_id).push({ id: row.id, name: row.name });
  }
  return map;
}

function createForOrganization(db, organizationId, rawName) {
  const name = normalizeName(rawName);
  if (!name) throw new Error('tag name required');
  const existing = db.prepare(`
    SELECT * FROM tags WHERE organization_id = ? AND name = ? COLLATE NOCASE
  `).get(organizationId, name);
  if (existing) return existing;
  const id = entityId();
  const ts = nowIso();
  db.prepare(`
    INSERT INTO tags(id, organization_id, name, created_at) VALUES (?, ?, ?, ?)
  `).run(id, organizationId, name, ts);
  return db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
}

function create(db, boardId, rawName) {
  const orgId = organizationIdForBoard(db, boardId);
  return createForOrganization(db, orgId, rawName);
}

function getById(db, id) {
  return db.prepare('SELECT * FROM tags WHERE id = ?').get(id) || null;
}

function rename(db, id, rawName) {
  const tag = getById(db, id);
  if (!tag) throw new Error('tag not found');
  const name = normalizeName(rawName);
  if (!name) throw new Error('tag name required');
  const clash = db.prepare(`
    SELECT id FROM tags WHERE organization_id = ? AND name = ? COLLATE NOCASE AND id != ?
  `).get(tag.organization_id, name, id);
  if (clash) throw new Error('tag name already exists');
  db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, id);
  return getById(db, id);
}

function boardIdsUsingTag(db, tagId) {
  return db.prepare(`
    SELECT DISTINCT c.board_id AS board_id
    FROM card_tags ct
    JOIN cards c ON c.id = ct.card_id
    WHERE ct.tag_id = ?
  `).all(tagId).map(r => r.board_id);
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
  remove,
  boardIdsUsingTag,
};
