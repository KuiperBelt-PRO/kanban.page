'use strict';

const crypto = require('crypto');

const CARD_ID_RE = /^[A-Z0-9]{2,4}-\d+$/;
const LEGACY_CARD_ID_RE = /^kb[a-z0-9]{4,6}$/;
const PROJECT_CODE_RE = /^[A-Z0-9]{2,4}$/;

function entityId() {
  return crypto.randomUUID().replace(/-/g, '');
}

function normalizeProjectCode(value) {
  const code = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!PROJECT_CODE_RE.test(code)) {
    throw new Error('project code must be 2–4 uppercase letters or digits');
  }
  return code;
}

function suggestProjectCode(slug, name) {
  const slugParts = String(slug || '')
    .split(/[-_]+/)
    .map(p => p.replace(/[^a-z0-9]/gi, ''))
    .filter(Boolean);
  if (slugParts.length >= 2) {
    const initials = slugParts.map(p => p[0]).join('').toUpperCase();
    if (initials.length >= 2) return initials.slice(0, 4);
  }
  const fromSlug = String(slug || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (fromSlug.length >= 2) return fromSlug.slice(0, 4);
  const fromName = String(name || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (fromName.length >= 2) return fromName.slice(0, 4);
  return 'PRJ';
}

function nextCardIdentity(db, projectId) {
  const project = db.prepare('SELECT code FROM projects WHERE id = ?').get(projectId);
  if (!project?.code) throw new Error('project code missing');
  const row = db.prepare('SELECT MAX(issue_number) AS m FROM cards WHERE project_id = ?').get(projectId);
  const issueNumber = (row?.m || 0) + 1;
  const id = `${project.code}-${issueNumber}`;
  const clash = db.prepare('SELECT 1 AS n FROM cards WHERE id = ?').get(id);
  if (clash) throw new Error(`card id collision: ${id}`);
  return { id, issue_number: issueNumber };
}

function generateCardId(db, projectId) {
  return nextCardIdentity(db, projectId).id;
}

function isCardId(value) {
  return typeof value === 'string' && (CARD_ID_RE.test(value) || LEGACY_CARD_ID_RE.test(value));
}

module.exports = {
  entityId,
  normalizeProjectCode,
  suggestProjectCode,
  nextCardIdentity,
  generateCardId,
  isCardId,
  CARD_ID_RE,
  LEGACY_CARD_ID_RE,
  PROJECT_CODE_RE,
};
