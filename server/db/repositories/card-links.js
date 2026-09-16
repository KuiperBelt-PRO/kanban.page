'use strict';

const { entityId } = require('../../ids.js');
const { nowIso } = require('../../util.js');
const events = require('./events.js');

function cardTitle(db, id) {
  const row = db.prepare('SELECT id, title FROM cards WHERE id = ?').get(id);
  return row ? { id: row.id, title: row.title } : null;
}

function assertSameBoard(db, aId, bId) {
  const a = db.prepare('SELECT board_id FROM cards WHERE id = ?').get(aId);
  const b = db.prepare('SELECT board_id FROM cards WHERE id = ?').get(bId);
  if (!a || !b) throw new Error('card not found');
  if (a.board_id !== b.board_id) throw new Error('cards must be on the same board');
  return a.board_id;
}

function add(db, { from_card_id, to_card_id, link_type }) {
  if (from_card_id === to_card_id) throw new Error('cannot link card to itself');
  if (!['blocks', 'relates'].includes(link_type)) throw new Error('invalid link type');
  const boardId = assertSameBoard(db, from_card_id, to_card_id);
  const existing = db.prepare(`
    SELECT id FROM card_links
    WHERE from_card_id = ? AND to_card_id = ? AND link_type = ?
  `).get(from_card_id, to_card_id, link_type);
  if (existing) return db.prepare('SELECT * FROM card_links WHERE id = ?').get(existing.id);

  const id = entityId();
  const ts = nowIso();
  db.prepare(`
    INSERT INTO card_links(id, from_card_id, to_card_id, link_type, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, from_card_id, to_card_id, link_type, ts);
  events.insert(db, {
    card_id: from_card_id,
    board_id: boardId,
    event_type: 'link_added',
    payload: { link_id: id, from_card_id, to_card_id, link_type },
  });
  events.insert(db, {
    card_id: to_card_id,
    board_id: boardId,
    event_type: 'link_added',
    payload: { link_id: id, from_card_id, to_card_id, link_type },
  });
  return db.prepare('SELECT * FROM card_links WHERE id = ?').get(id);
}

function remove(db, linkId) {
  const row = db.prepare('SELECT * FROM card_links WHERE id = ?').get(linkId);
  if (!row) throw new Error('link not found');
  const boardId = assertSameBoard(db, row.from_card_id, row.to_card_id);
  db.prepare('DELETE FROM card_links WHERE id = ?').run(linkId);
  const payload = {
    link_id: linkId,
    from_card_id: row.from_card_id,
    to_card_id: row.to_card_id,
    link_type: row.link_type,
  };
  events.insert(db, {
    card_id: row.from_card_id,
    board_id: boardId,
    event_type: 'link_removed',
    payload,
  });
  events.insert(db, {
    card_id: row.to_card_id,
    board_id: boardId,
    event_type: 'link_removed',
    payload,
  });
  return row;
}

function summaryForCard(db, cardId) {
  const blockedBy = db.prepare(`
    SELECT l.id AS link_id, c.id, c.title
    FROM card_links l
    JOIN cards c ON c.id = l.from_card_id
    WHERE l.to_card_id = ? AND l.link_type = 'blocks'
    ORDER BY c.title COLLATE NOCASE
  `).all(cardId);

  const blocks = db.prepare(`
    SELECT l.id AS link_id, c.id, c.title
    FROM card_links l
    JOIN cards c ON c.id = l.to_card_id
    WHERE l.from_card_id = ? AND l.link_type = 'blocks'
    ORDER BY c.title COLLATE NOCASE
  `).all(cardId);

  const related = db.prepare(`
    SELECT l.id AS link_id,
      CASE WHEN l.from_card_id = ? THEN c2.id ELSE c1.id END AS id,
      CASE WHEN l.from_card_id = ? THEN c2.title ELSE c1.title END AS title
    FROM card_links l
    JOIN cards c1 ON c1.id = l.from_card_id
    JOIN cards c2 ON c2.id = l.to_card_id
    WHERE l.link_type = 'relates' AND (l.from_card_id = ? OR l.to_card_id = ?)
    ORDER BY title COLLATE NOCASE
  `).all(cardId, cardId, cardId, cardId);

  return { blockedBy, blocks, related };
}

function mapForBoardCards(db, boardId) {
  const map = new Map();
  const cards = db.prepare('SELECT id FROM cards WHERE board_id = ?').all(boardId);
  for (const { id } of cards) map.set(id, summaryForCard(db, id));
  return map;
}

module.exports = {
  add,
  remove,
  summaryForCard,
  mapForBoardCards,
  cardTitle,
};
