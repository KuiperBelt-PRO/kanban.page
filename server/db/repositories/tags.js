'use strict';

const { entityId } = require('../../ids.js');
const { nowIso } = require('../../util.js');
const events = require('./events.js');

function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function listByBoard(db, boardId) {
  return db.prepare(`
    SELECT * FROM tags WHERE board_id = ?
    ORDER BY name COLLATE NOCASE
  `).all(boardId);
}

function findOrCreate(db, boardId, rawName) {
  const name = normalizeName(rawName);
  if (!name) return null;
  const existing = db.prepare(`
    SELECT * FROM tags WHERE board_id = ? AND name = ? COLLATE NOCASE
  `).get(boardId, name);
  if (existing) return existing;
  const id = entityId();
  const ts = nowIso();
  db.prepare(`
    INSERT INTO tags(id, board_id, name, created_at) VALUES (?, ?, ?, ?)
  `).run(id, boardId, name, ts);
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
  const names = [...new Set((rawNames || []).map(normalizeName).filter(Boolean))];
  const tagIds = names.map(n => findOrCreate(db, boardId, n).id);
  db.prepare('DELETE FROM card_tags WHERE card_id = ?').run(cardId);
  const ins = db.prepare('INSERT INTO card_tags(card_id, tag_id) VALUES (?, ?)');
  for (const tagId of tagIds) ins.run(cardId, tagId);
  if (emitEvent) {
    events.insert(db, {
      card_id: cardId,
      board_id: boardId,
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

module.exports = {
  normalizeName,
  listByBoard,
  findOrCreate,
  listForCard,
  setForCard,
  mapForBoardCards,
};
