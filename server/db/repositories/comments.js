'use strict';

const { entityId } = require('../../ids.js');
const { nowIso } = require('../../util.js');
const events = require('./events.js');

function rowToComment(row) {
  if (!row) return null;
  return {
    id: row.id,
    card_id: row.card_id,
    body: row.body,
    created_at: row.created_at,
  };
}

function listForCard(db, cardId) {
  return db.prepare(`
    SELECT * FROM card_comments WHERE card_id = ?
    ORDER BY created_at DESC
  `).all(cardId).map(rowToComment);
}

function add(db, cardId, body) {
  const text = String(body || '').trim();
  if (!text) throw new Error('comment body required');
  const card = db.prepare('SELECT board_id FROM cards WHERE id = ?').get(cardId);
  if (!card) throw new Error('card not found');
  const id = entityId();
  const ts = nowIso();
  db.prepare(`
    INSERT INTO card_comments(id, card_id, body, created_at) VALUES (?, ?, ?, ?)
  `).run(id, cardId, text, ts);
  events.insert(db, {
    card_id: cardId,
    board_id: card.board_id,
    event_type: 'comment_added',
    payload: { comment_id: id },
  });
  return rowToComment(db.prepare('SELECT * FROM card_comments WHERE id = ?').get(id));
}

function update(db, cardId, commentId, body) {
  const text = String(body || '').trim();
  if (!text) throw new Error('comment body required');
  const row = db.prepare('SELECT * FROM card_comments WHERE id = ? AND card_id = ?').get(commentId, cardId);
  if (!row) throw new Error('comment not found');
  const card = db.prepare('SELECT board_id FROM cards WHERE id = ?').get(cardId);
  if (!card) throw new Error('card not found');
  if (row.body === text) return rowToComment(row);
  db.prepare('UPDATE card_comments SET body = ? WHERE id = ?').run(text, commentId);
  events.insert(db, {
    card_id: cardId,
    board_id: card.board_id,
    event_type: 'comment_updated',
    payload: { comment_id: commentId },
  });
  return rowToComment(db.prepare('SELECT * FROM card_comments WHERE id = ?').get(commentId));
}

module.exports = { listForCard, add, update, rowToComment };
