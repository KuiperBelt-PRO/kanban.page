'use strict';

const ISSUE_TYPES = ['initiative', 'epic', 'story', 'task', 'bug', 'spike', 'subtask'];
const DEFAULT_ISSUE_TYPE = 'task';

function normalizeIssueType(raw) {
  const t = String(raw || '').toLowerCase();
  return ISSUE_TYPES.includes(t) ? t : DEFAULT_ISSUE_TYPE;
}

function allowsEpicLink(type) {
  const t = normalizeIssueType(type);
  return t === 'story' || t === 'task' || t === 'bug' || t === 'spike';
}

function allowsParentLink(type) {
  return normalizeIssueType(type) === 'subtask';
}

function resolveEpicRef(db, epicsRepo, projectId, epicRef) {
  if (!epicRef) return null;
  const epic = epicsRepo.getById(db, epicRef);
  if (epic && epic.project_id === projectId) return epicRef;
  const row = db.prepare(`
    SELECT id, project_id, issue_type, archived FROM cards WHERE id = ?
  `).get(epicRef);
  if (row && !row.archived && row.issue_type === 'epic' && row.project_id === projectId) {
    return epicRef;
  }
  throw new Error('epic not found for project');
}

function resolveParentRef(db, boardId, projectId, parentRef, issueType) {
  if (!parentRef) return null;
  if (!allowsParentLink(issueType)) throw new Error('parent only allowed for sub-task');
  const parent = db.prepare(`
    SELECT id, board_id, project_id, issue_type, archived FROM cards WHERE id = ?
  `).get(parentRef);
  if (!parent || parent.archived || parent.board_id !== boardId || parent.project_id !== projectId) {
    throw new Error('parent issue not found');
  }
  if (parent.issue_type === 'subtask') throw new Error('parent cannot be a sub-task');
  return parentRef;
}

module.exports = {
  ISSUE_TYPES,
  DEFAULT_ISSUE_TYPE,
  normalizeIssueType,
  allowsEpicLink,
  allowsParentLink,
  resolveEpicRef,
  resolveParentRef,
};
