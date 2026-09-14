'use strict';

const { entityId } = require('../../ids.js');
const { nowIso } = require('../../util.js');

function insert(db, { card_id, board_id, event_type, payload }) {
  const id = entityId();
  const ts = nowIso();
  db.prepare(`
    INSERT INTO card_events(id, card_id, board_id, event_type, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, card_id, board_id || null, event_type, payload ? JSON.stringify(payload) : null, ts);
  return { id, card_id, board_id, event_type, created_at: ts };
}

function listForBoard(db, boardId, { since } = {}) {
  let sql = `
    SELECT * FROM card_events
    WHERE board_id = ?
  `;
  const params = [boardId];
  if (since) {
    sql += ' AND created_at >= ?';
    params.push(since);
  }
  sql += ' ORDER BY created_at ASC';
  return db.prepare(sql).all(...params);
}

function listForReport(db, boardId, { since } = {}) {
  return listForBoard(db, boardId, { since });
}

module.exports = { insert, listForBoard, listForReport };
