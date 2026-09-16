'use strict';

const { entityId } = require('../../ids.js');
const { nowIso } = require('../../util.js');
const events = require('./events.js');

function rowToEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    card_id: row.card_id,
    started_at: row.started_at,
    ended_at: row.ended_at,
    duration_minutes: row.duration_minutes,
    label: row.label || '',
    source: row.source,
    created_at: row.created_at,
  };
}

function listForCard(db, cardId) {
  return db.prepare(`
    SELECT * FROM time_entries WHERE card_id = ?
    ORDER BY COALESCE(ended_at, started_at, created_at) DESC, created_at DESC
  `).all(cardId).map(rowToEntry);
}

function activeTimer(db, cardId) {
  return rowToEntry(db.prepare(`
    SELECT * FROM time_entries
    WHERE card_id = ? AND source = 'timer' AND ended_at IS NULL
    ORDER BY started_at DESC LIMIT 1
  `).get(cardId));
}

function totalMinutes(db, cardId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(duration_minutes), 0) AS total
    FROM time_entries WHERE card_id = ? AND ended_at IS NOT NULL
  `).get(cardId);
  const active = activeTimer(db, cardId);
  let total = row?.total || 0;
  if (active?.started_at) {
    const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(active.started_at)) / 60000));
    total += elapsed;
  }
  return total;
}

function addManual(db, cardId, { duration_minutes, started_at, ended_at, label }) {
  const card = db.prepare('SELECT board_id FROM cards WHERE id = ?').get(cardId);
  if (!card) throw new Error('card not found');

  let start = started_at || null;
  let end = ended_at || null;
  let mins;

  if (start && end) {
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) throw new Error('invalid datetime');
    if (endMs <= startMs) throw new Error('end must be after start');
    mins = Math.max(1, Math.round((endMs - startMs) / 60000));
  } else {
    mins = Math.max(1, Math.round(Number(duration_minutes) || 0));
    if (!mins) throw new Error('duration or start/end required');
    end = end || nowIso();
  }

  const id = entityId();
  const ts = nowIso();
  db.prepare(`
    INSERT INTO time_entries(
      id, card_id, started_at, ended_at, duration_minutes, label, source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)
  `).run(id, cardId, start, end, mins, label || null, ts);
  events.insert(db, {
    card_id: cardId,
    board_id: card.board_id,
    event_type: 'time_logged',
    payload: { entry_id: id, duration_minutes: mins, label: label || null, source: 'manual' },
  });
  return rowToEntry(db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id));
}

function startTimer(db, cardId, { label } = {}) {
  const card = db.prepare('SELECT board_id FROM cards WHERE id = ?').get(cardId);
  if (!card) throw new Error('card not found');
  const running = activeTimer(db, cardId);
  if (running) throw new Error('timer already running');
  const id = entityId();
  const ts = nowIso();
  db.prepare(`
    INSERT INTO time_entries(
      id, card_id, started_at, ended_at, duration_minutes, label, source, created_at
    ) VALUES (?, ?, ?, NULL, 0, ?, 'timer', ?)
  `).run(id, cardId, ts, label || null, ts);
  events.insert(db, {
    card_id: cardId,
    board_id: card.board_id,
    event_type: 'timer_started',
    payload: { entry_id: id, label: label || null },
  });
  return rowToEntry(db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id));
}

function stopTimer(db, cardId, entryId, { label } = {}) {
  const card = db.prepare('SELECT board_id FROM cards WHERE id = ?').get(cardId);
  if (!card) throw new Error('card not found');
  const row = db.prepare(`
    SELECT * FROM time_entries
    WHERE id = ? AND card_id = ? AND source = 'timer' AND ended_at IS NULL
  `).get(entryId, cardId);
  if (!row) throw new Error('active timer not found');
  const finalLabel = label !== undefined ? (label || null) : (row.label || null);
  const ended = nowIso();
  const mins = Math.max(1, Math.round((Date.parse(ended) - Date.parse(row.started_at)) / 60000));
  db.prepare(`
    UPDATE time_entries SET ended_at = ?, duration_minutes = ?, label = ? WHERE id = ?
  `).run(ended, mins, finalLabel, entryId);
  events.insert(db, {
    card_id: cardId,
    board_id: card.board_id,
    event_type: 'timer_stopped',
    payload: { entry_id: entryId, duration_minutes: mins, label: finalLabel },
  });
  return rowToEntry(db.prepare('SELECT * FROM time_entries WHERE id = ?').get(entryId));
}

function discardTimer(db, cardId, entryId) {
  const card = db.prepare('SELECT board_id FROM cards WHERE id = ?').get(cardId);
  if (!card) throw new Error('card not found');
  const row = db.prepare(`
    SELECT * FROM time_entries
    WHERE id = ? AND card_id = ? AND source = 'timer' AND ended_at IS NULL
  `).get(entryId, cardId);
  if (!row) throw new Error('active timer not found');
  db.prepare('DELETE FROM time_entries WHERE id = ?').run(entryId);
  events.insert(db, {
    card_id: cardId,
    board_id: card.board_id,
    event_type: 'timer_discarded',
    payload: { entry_id: entryId },
  });
}

function mapTotalsForBoard(db, boardId) {
  const rows = db.prepare(`
    SELECT card_id, COALESCE(SUM(duration_minutes), 0) AS total
    FROM time_entries
    WHERE card_id IN (SELECT id FROM cards WHERE board_id = ?) AND ended_at IS NOT NULL
    GROUP BY card_id
  `).all(boardId);
  const map = new Map(rows.map(r => [r.card_id, r.total]));
  const activeRows = db.prepare(`
    SELECT te.* FROM time_entries te
    JOIN cards c ON c.id = te.card_id
    WHERE c.board_id = ? AND te.source = 'timer' AND te.ended_at IS NULL
  `).all(boardId);
  const activeMap = new Map();
  for (const row of activeRows) {
    activeMap.set(row.card_id, rowToEntry(row));
  }
  return { totals: map, activeTimers: activeMap };
}

module.exports = {
  listForCard,
  activeTimer,
  totalMinutes,
  addManual,
  startTimer,
  stopTimer,
  discardTimer,
  mapTotalsForBoard,
};
