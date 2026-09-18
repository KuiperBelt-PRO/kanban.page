'use strict';

const { nextCardIdentity } = require('../../ids.js');
const { nowIso, boolToInt, rowToCard } = require('../../util.js');
const boards = require('./boards.js');
const projects = require('./projects.js');
const epics = require('./epics.js');
const events = require('./events.js');
const tags = require('./tags.js');
const { resolveScheduleFields } = require('../../schedule.js');

function assertProjectOnBoard(db, boardId, projectId) {
  const row = db.prepare('SELECT 1 AS n FROM board_projects WHERE board_id = ? AND project_id = ?')
    .get(boardId, projectId);
  if (!row) throw new Error('project is not linked to board');
}

function resolveStage(db, boardId, stageRef) {
  const stages = boards.listStages(db, boardId);
  if (!stageRef) return stages[0];
  const byId = stages.find(s => s.id === stageRef);
  if (byId) return byId;
  const upper = String(stageRef).toUpperCase();
  const byName = stages.find(s => s.name.toUpperCase() === upper);
  if (byName) return byName;
  throw new Error(`stage not found: ${stageRef}`);
}

function nextPosition(db, stageId) {
  const row = db.prepare('SELECT MAX(position) AS m FROM cards WHERE stage_id = ? AND archived = 0')
    .get(stageId);
  return (row && row.m != null ? row.m : -1) + 1;
}

function getById(db, id) {
  return rowToCard(db.prepare('SELECT * FROM cards WHERE id = ?').get(id));
}

function listByBoard(db, boardId, { includeArchived = false } = {}) {
  let sql = 'SELECT * FROM cards WHERE board_id = ?';
  if (!includeArchived) sql += ' AND archived = 0';
  sql += ' ORDER BY stage_id, position, created_at';
  return db.prepare(sql).all(boardId).map(rowToCard);
}

function create(db, {
  board_id,
  board_slug,
  project_id,
  project_slug,
  organization_slug,
  title,
  notes,
  session_ref,
  stage_id,
  stage,
  epic_id,
  flagged,
  priority,
  estimated_minutes,
  schedule_start_date,
  schedule_end_date,
  tags: tagNames,
}) {
  let board = board_id ? boards.getById(db, board_id) : null;
  if (!board && board_slug) board = boards.resolveBoard(db, board_slug);
  if (!board) throw new Error('board not found');

  let project = project_id ? projects.getById(db, project_id) : null;
  if (!project && project_slug && organization_slug) {
    project = projects.getByOrgSlug(db, organization_slug, project_slug);
  }
  if (!project) throw new Error('project not found');
  assertProjectOnBoard(db, board.id, project.id);

  if (epic_id) {
    const epic = epics.getById(db, epic_id);
    if (!epic || epic.project_id !== project.id) throw new Error('epic not found for project');
  }

  const stageRow = resolveStage(db, board.id, stage_id || stage);
  const schedule = resolveScheduleFields(
    { schedule_start_date: null, schedule_end_date: null },
    { schedule_start_date, schedule_end_date },
  );
  const { id, issue_number } = nextCardIdentity(db, project.id);
  const ts = nowIso();
  const position = nextPosition(db, stageRow.id);
  db.prepare(`
    INSERT INTO cards(
      id, project_id, board_id, epic_id, stage_id, position, title, notes,
      session_ref, flagged, priority, estimated_minutes,
      schedule_start_date, schedule_end_date,
      issue_number, archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    id,
    project.id,
    board.id,
    epic_id || null,
    stageRow.id,
    position,
    title,
    notes || '',
    session_ref || null,
    boolToInt(flagged),
    priority != null ? Number(priority) : 0,
    estimated_minutes != null ? Math.max(0, Math.round(Number(estimated_minutes))) : null,
    schedule.schedule_start_date,
    schedule.schedule_end_date,
    issue_number,
    ts,
    ts,
  );
  if (tagNames?.length) {
    tags.setForCard(db, id, board.id, tagNames, { emitEvent: false });
  }
  events.insert(db, {
    card_id: id,
    board_id: board.id,
    event_type: 'created',
    payload: { stage_id: stageRow.id, title },
  });
  boards.bumpVersion(db, board.id);
  return getById(db, id);
}

function update(db, id, fields) {
  const card = getById(db, id);
  if (!card) throw new Error('card not found');

  let projectId = card.project_id;
  if (fields.project_id && fields.project_id !== card.project_id) {
    assertProjectOnBoard(db, card.board_id, fields.project_id);
    projectId = fields.project_id;
  }

  let epicId = card.epic_id;
  if (fields.epic_id !== undefined) {
    if (fields.epic_id) {
      const epic = epics.getById(db, fields.epic_id);
      if (!epic || epic.project_id !== projectId) throw new Error('epic not found for project');
      epicId = fields.epic_id;
    } else {
      epicId = null;
    }
  }

  const title = fields.title != null ? fields.title : card.title;
  const notes = fields.notes != null ? fields.notes : card.notes;
  const sessionRef = fields.session_ref != null ? fields.session_ref : card.session_ref;
  const flagged = fields.flagged != null ? boolToInt(fields.flagged) : boolToInt(card.flagged);
  const priority = fields.priority != null ? Number(fields.priority) : card.priority;
  const estimatedMinutes = fields.estimated_minutes !== undefined
    ? (fields.estimated_minutes == null ? null : Math.max(0, Math.round(Number(fields.estimated_minutes))))
    : card.estimated_minutes;
  const schedule = (fields.schedule_start_date !== undefined || fields.schedule_end_date !== undefined)
    ? resolveScheduleFields(card, fields)
    : {
      schedule_start_date: card.schedule_start_date || null,
      schedule_end_date: card.schedule_end_date || null,
    };
  const ts = nowIso();

  db.prepare(`
    UPDATE cards SET project_id = ?, epic_id = ?, title = ?, notes = ?,
      session_ref = ?, flagged = ?, priority = ?, estimated_minutes = ?,
      schedule_start_date = ?, schedule_end_date = ?, updated_at = ?
    WHERE id = ?
  `).run(
    projectId, epicId, title, notes, sessionRef, flagged, priority, estimatedMinutes,
    schedule.schedule_start_date, schedule.schedule_end_date, ts, id,
  );

  if (fields.tags !== undefined) {
    tags.setForCard(db, id, card.board_id, fields.tags, { emitEvent: false });
  }

  const eventPayload = { ...fields };
  if (fields.estimated_minutes !== undefined && estimatedMinutes !== card.estimated_minutes) {
    eventPayload.estimated_minutes = estimatedMinutes;
  }
  events.insert(db, {
    card_id: id,
    board_id: card.board_id,
    event_type: 'updated',
    payload: eventPayload,
  });
  if (fields.estimated_minutes !== undefined && estimatedMinutes !== card.estimated_minutes) {
    events.insert(db, {
      card_id: id,
      board_id: card.board_id,
      event_type: 'estimated_changed',
      payload: { estimated_minutes: estimatedMinutes },
    });
  }
  const scheduleChanged = fields.schedule_start_date !== undefined || fields.schedule_end_date !== undefined;
  if (scheduleChanged && (
    schedule.schedule_start_date !== (card.schedule_start_date || null)
    || schedule.schedule_end_date !== (card.schedule_end_date || null)
  )) {
    events.insert(db, {
      card_id: id,
      board_id: card.board_id,
      event_type: 'schedule_changed',
      payload: {
        schedule_start_date: schedule.schedule_start_date,
        schedule_end_date: schedule.schedule_end_date,
      },
    });
  }
  if (fields.tags !== undefined) {
    events.insert(db, {
      card_id: id,
      board_id: card.board_id,
      event_type: 'tags_changed',
      payload: { tags: fields.tags },
    });
  }
  boards.bumpVersion(db, card.board_id);
  return getById(db, id);
}

function move(db, id, { stage_id, stage, position }) {
  const card = getById(db, id);
  if (!card) throw new Error('card not found');
  const stageRow = resolveStage(db, card.board_id, stage_id || stage);
  const pos = position != null ? position : nextPosition(db, stageRow.id);
  const ts = nowIso();
  db.prepare(`
    UPDATE cards SET stage_id = ?, position = ?, updated_at = ?
    WHERE id = ?
  `).run(stageRow.id, pos, ts, id);
  events.insert(db, {
    card_id: id,
    board_id: card.board_id,
    event_type: 'moved',
    payload: { from_stage_id: card.stage_id, to_stage_id: stageRow.id, position: pos },
  });
  boards.bumpVersion(db, card.board_id);
  const updated = getById(db, id);
  return {
    card: updated,
    board_snapshot: boards.getSnapshot(db, card.board_id),
  };
}

function archive(db, id, archived = true) {
  const card = getById(db, id);
  if (!card) throw new Error('card not found');
  const ts = nowIso();
  db.prepare('UPDATE cards SET archived = ?, updated_at = ? WHERE id = ?')
    .run(archived ? 1 : 0, ts, id);
  events.insert(db, {
    card_id: id,
    board_id: card.board_id,
    event_type: archived ? 'archived' : 'restored',
    payload: {},
  });
  boards.bumpVersion(db, card.board_id);
  return getById(db, id);
}

module.exports = {
  getById,
  listByBoard,
  create,
  update,
  move,
  archive,
  resolveStage,
};
