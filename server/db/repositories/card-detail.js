'use strict';

const tags = require('./tags.js');
const cardLinks = require('./card-links.js');
const timeEntries = require('./time-entries.js');
const comments = require('./comments.js');
const events = require('./events.js');
const cards = require('./cards.js');

function getDetail(db, cardId) {
  const card = cards.getById(db, cardId);
  if (!card) throw new Error('card not found');
  const boardId = card.board_id;
  return {
    card,
    tags: tags.listForCard(db, cardId),
    boardTags: tags.listByBoard(db, boardId),
    links: cardLinks.summaryForCard(db, cardId),
    timeEntries: timeEntries.listForCard(db, cardId),
    activeTimer: timeEntries.activeTimer(db, cardId),
    timeLoggedMinutes: timeEntries.totalMinutes(db, cardId),
    comments: comments.listForCard(db, cardId),
    events: events.listForCard(db, cardId),
  };
}

function enrichSnapshot(db, snapshot) {
  const boardId = snapshot.board.id;
  const tagMap = tags.mapForBoardCards(db, boardId);
  const linkMap = cardLinks.mapForBoardCards(db, boardId);
  const { totals, activeTimers } = timeEntries.mapTotalsForBoard(db, boardId);
  snapshot.cards = snapshot.cards.map(card => {
    const links = linkMap.get(card.id) || { blockedBy: [], blocks: [], related: [] };
    return {
      ...card,
      tags: tagMap.get(card.id) || [],
      blocked_by: links.blockedBy,
      blocks: links.blocks,
      related: links.related,
      time_logged_minutes: totals.get(card.id) || 0,
      active_timer: activeTimers.get(card.id) || null,
    };
  });
  snapshot.board_tags = tags.listByBoard(db, boardId);
  return snapshot;
}

module.exports = { getDetail, enrichSnapshot };
