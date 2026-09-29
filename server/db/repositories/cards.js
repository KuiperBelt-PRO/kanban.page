'use strict';

const { nextCardIdentity } = require('../../ids.js');
const { nowIso, boolToInt, rowToCard } = require('../../util.js');
const boards = require('./boards.js');
const projects = require('./projects.js');
const epics = require('./epics.js');
const events = require('./events.js');
const tags = require('./tags.js');
const { resolveScheduleFields } = require('../../schedule.js');
const sprints = require('./sprints.js');
const {
  normalizeIssueType,
  allowsEpicLink,
  allowsParentLink,
  resolveEpicRef,
  resolveParentRef,
} = require('../../issue-types.js');

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

function nextSubtaskPosition(db, parentId) {
  const row = db.prepare(`
    SELECT MAX(position) AS m FROM cards WHERE parent_id = ? AND archived = 0
  `).get(parentId);
  return (row && row.m != null ? row.m : -1) + 1;
}

function listSubtasks(db, parentId) {
  return db.prepare(`
    SELECT * FROM cards WHERE parent_id = ? AND archived = 0
    ORDER BY position ASC, created_at ASC
  `).all(parentId).map(rowToCard);
}

function propagateEpicContextToSubtasks(db, parentId, { project_id, epic_id }) {
  const ts = nowIso();
  db.prepare(`
    UPDATE cards SET project_id = ?, epic_id = ?, updated_at = ?
    WHERE parent_id = ? AND archived = 0
  `).run(project_id, epic_id, ts, parentId);
}

function getParentRow(db, parentId) {
  return db.prepare(`
    SELECT id, board_id, project_id, epic_id, sprint_id, issue_type, archived
    FROM cards WHERE id = ?
  `).get(parentId);
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
  sprint_id,
  issue_type,
  parent_id,
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

  const issueType = normalizeIssueType(issue_type);
  let project = project_id ? projects.getById(db, project_id) : null;
  if (!project && project_slug && organization_slug) {
    project = projects.getByOrgSlug(db, organization_slug, project_slug);
  }
  if (issueType === 'subtask' && parent_id) {
    const parentPreview = getParentRow(db, parent_id);
    if (!parentPreview || parentPreview.archived || parentPreview.board_id !== board.id) {
      throw new Error('parent issue not found');
    }
    if (parentPreview.issue_type === 'subtask') throw new Error('parent cannot be a sub-task');
    project = projects.getById(db, parentPreview.project_id);
  }
  if (!project) throw new Error('project not found');
  assertProjectOnBoard(db, board.id, project.id);
  let epicId = null;
  let parentId = null;
  let sprintId = sprint_id || null;

  if (issueType === 'subtask') {
    if (!parent_id) throw new Error('sub-task requires parent');
    parentId = resolveParentRef(db, board.id, project.id, parent_id, issueType);
    const parent = getParentRow(db, parentId);
    project = projects.getById(db, parent.project_id);
    if (!project) throw new Error('project not found');
    assertProjectOnBoard(db, board.id, project.id);
    epicId = parent.epic_id || null;
    if (sprint_id !== undefined) {
      sprintId = sprint_id || null;
      if (sprintId) {
        sprints.assertCardSprint(db, { sprint_id: sprintId, project_id: project.id, board_id: board.id });
      }
    } else {
      sprintId = parent.sprint_id || null;
    }
  } else {
    if (epic_id && allowsEpicLink(issueType)) {
      epicId = resolveEpicRef(db, epics, project.id, epic_id);
    }
    if (parent_id) {
      parentId = resolveParentRef(db, board.id, project.id, parent_id, issueType);
    }
    if (sprintId) {
      sprints.assertCardSprint(db, { sprint_id: sprintId, project_id: project.id, board_id: board.id });
    }
  }

  const stageRow = resolveStage(db, board.id, stage_id || stage);
  const schedule = resolveScheduleFields(
    { schedule_start_date: null, schedule_end_date: null },
    { schedule_start_date, schedule_end_date },
  );
  const { id, issue_number } = nextCardIdentity(db, project.id);
  const ts = nowIso();
  const position = parentId
    ? nextSubtaskPosition(db, parentId)
    : nextPosition(db, stageRow.id);
  db.prepare(`
    INSERT INTO cards(
      id, project_id, board_id, epic_id, sprint_id, issue_type, parent_id,
      stage_id, position, title, notes,
      session_ref, flagged, priority, estimated_minutes,
      schedule_start_date, schedule_end_date,
      issue_number, archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    id,
    project.id,
    board.id,
    epicId,
    sprintId,
    issueType,
    parentId,
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

  let issueType = normalizeIssueType(
    fields.issue_type !== undefined ? fields.issue_type : card.issue_type,
  );
  let epicId = card.epic_id;
  if (fields.epic_id !== undefined || fields.issue_type !== undefined) {
    const rawEpic = fields.epic_id !== undefined ? fields.epic_id : card.epic_id;
    if (rawEpic && allowsEpicLink(issueType)) {
      epicId = resolveEpicRef(db, epics, projectId, rawEpic);
    } else {
      epicId = null;
    }
  } else if (!allowsEpicLink(issueType)) {
    epicId = null;
  }

  let parentId = card.parent_id;
  if (fields.parent_id !== undefined || fields.issue_type !== undefined) {
    const rawParent = fields.parent_id !== undefined ? fields.parent_id : card.parent_id;
    if (rawParent && allowsParentLink(issueType)) {
      parentId = resolveParentRef(db, card.board_id, projectId, rawParent, issueType);
    } else {
      parentId = null;
    }
  } else if (!allowsParentLink(issueType)) {
    parentId = null;
  }

  if (issueType === 'subtask' && !parentId) {
    throw new Error('sub-task requires parent');
  }

  let sprintId = card.sprint_id;
  if (issueType === 'subtask' && parentId) {
    const parent = getParentRow(db, parentId);
    if (!parent || parent.archived) throw new Error('parent issue not found');
    projectId = parent.project_id;
    epicId = parent.epic_id || null;
    if (fields.sprint_id !== undefined) {
      if (fields.sprint_id) {
        sprints.assertCardSprint(db, {
          sprint_id: fields.sprint_id,
          project_id: projectId,
          board_id: card.board_id,
        });
        sprintId = fields.sprint_id;
      } else {
        sprintId = null;
      }
    }
  } else if (fields.sprint_id !== undefined) {
    if (fields.sprint_id) {
      sprints.assertCardSprint(db, {
        sprint_id: fields.sprint_id,
        project_id: projectId,
        board_id: card.board_id,
      });
      sprintId = fields.sprint_id;
    } else {
      sprintId = null;
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
    UPDATE cards SET project_id = ?, epic_id = ?, sprint_id = ?, issue_type = ?, parent_id = ?,
      title = ?, notes = ?,
      session_ref = ?, flagged = ?, priority = ?, estimated_minutes = ?,
      schedule_start_date = ?, schedule_end_date = ?, updated_at = ?
    WHERE id = ?
  `).run(
    projectId, epicId, sprintId, issueType, parentId, title, notes, sessionRef, flagged, priority,
    estimatedMinutes,
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
  const epicContextChanged = !allowsParentLink(issueType) && (
    projectId !== card.project_id
    || epicId !== (card.epic_id || null)
  );
  if (epicContextChanged) {
    propagateEpicContextToSubtasks(db, id, {
      project_id: projectId,
      epic_id: epicId,
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

function getCascadedSubtaskIdsFromLastArchive(db, parentId) {
  const row = db.prepare(`
    SELECT payload FROM card_events
    WHERE card_id = ? AND event_type = 'archived'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(parentId);
  if (!row?.payload) return [];
  try {
    const payload = JSON.parse(row.payload);
    return Array.isArray(payload.cascaded_subtask_ids) ? payload.cascaded_subtask_ids : [];
  } catch {
    return [];
  }
}

function archive(db, id, archived = true, { cascadeSubtasks = true } = {}) {
  const card = getById(db, id);
  if (!card) throw new Error('card not found');
  const ts = nowIso();
  let cascadedSubtaskIds = [];

  if (cascadeSubtasks && card.issue_type !== 'subtask') {
    if (archived) {
      const children = db.prepare('SELECT id FROM cards WHERE parent_id = ? AND archived = 0').all(id);
      cascadedSubtaskIds = children.map(c => c.id);
    } else {
      cascadedSubtaskIds = getCascadedSubtaskIdsFromLastArchive(db, id);
    }
  }

  db.prepare('UPDATE cards SET archived = ?, updated_at = ? WHERE id = ?')
    .run(archived ? 1 : 0, ts, id);
  const eventPayload = {};
  if (archived && cascadedSubtaskIds.length) {
    eventPayload.cascaded_subtask_ids = cascadedSubtaskIds;
  }
  events.insert(db, {
    card_id: id,
    board_id: card.board_id,
    event_type: archived ? 'archived' : 'restored',
    payload: eventPayload,
  });

  if (cascadeSubtasks && card.issue_type !== 'subtask') {
    if (archived) {
      for (const childId of cascadedSubtaskIds) {
        archive(db, childId, true, { cascadeSubtasks: false });
      }
    } else {
      for (const childId of cascadedSubtaskIds) {
        const child = db.prepare('SELECT archived, parent_id FROM cards WHERE id = ?').get(childId);
        if (child && child.archived === 1 && child.parent_id === id) {
          archive(db, childId, false, { cascadeSubtasks: false });
        }
      }
    }
  }

  boards.bumpVersion(db, card.board_id);
  return getById(db, id);
}

function removeCardTree(db, cardId) {
  const card = db.prepare('SELECT board_id FROM cards WHERE id = ?').get(cardId);
  if (!card) return null;
  const children = db.prepare('SELECT id FROM cards WHERE parent_id = ?').all(cardId);
  for (const child of children) removeCardTree(db, child.id);
  db.prepare('DELETE FROM card_events WHERE card_id = ?').run(cardId);
  db.prepare('DELETE FROM cards WHERE id = ?').run(cardId);
  return card.board_id;
}

function remove(db, id) {
  const card = getById(db, id);
  if (!card) throw new Error('card not found');
  const boardId = removeCardTree(db, id);
  if (boardId) boards.bumpVersion(db, boardId);
  return { removed: true, id };
}

function listByProject(db, projectId, { includeArchived = true } = {}) {
  let sql = 'SELECT * FROM cards WHERE project_id = ?';
  if (!includeArchived) sql += ' AND archived = 0';
  return db.prepare(sql).all(projectId);
}

module.exports = {
  getById,
  listByBoard,
  listByProject,
  listSubtasks,
  create,
  update,
  move,
  archive,
  remove,
  removeCardTree,
  resolveStage,
};
