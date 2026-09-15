'use strict';

const {
  normalizeProjectCode,
  suggestProjectCode,
  CARD_ID_RE,
  LEGACY_CARD_ID_RE,
} = require('../ids.js');

function allocateProjectCode(db, orgId, slug, name, excludeId = null) {
  let base = suggestProjectCode(slug, name);
  let code = base;
  let n = 1;
  while (db.prepare(`
    SELECT 1 AS n FROM projects
    WHERE organization_id = ? AND code = ? AND (? IS NULL OR id != ?)
  `).get(orgId, code, excludeId, excludeId)) {
    const suffix = String(n);
    code = `${base.slice(0, Math.max(2, 4 - suffix.length))}${suffix}`.slice(0, 4);
    n += 1;
    if (n > 99) throw new Error(`could not allocate project code for ${slug}`);
  }
  return code;
}

function backfillProjectCodes(db) {
  const rows = db.prepare('SELECT id, organization_id, slug, name, code FROM projects').all();
  for (const row of rows) {
    if (row.code) continue;
    const code = allocateProjectCode(db, row.organization_id, row.slug, row.name, row.id);
    db.prepare('UPDATE projects SET code = ? WHERE id = ?').run(code, row.id);
  }
}

function reassignCardId(db, oldId, newId, issueNumber) {
  if (oldId === newId) {
    db.prepare('UPDATE cards SET issue_number = ? WHERE id = ?').run(issueNumber, oldId);
    return;
  }
  const exists = db.prepare('SELECT 1 AS n FROM cards WHERE id = ?').get(newId);
  if (exists) throw new Error(`card id collision: ${newId}`);
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.prepare('UPDATE card_events SET card_id = ? WHERE card_id = ?').run(newId, oldId);
    db.prepare('UPDATE cards SET id = ?, issue_number = ? WHERE id = ?').run(newId, issueNumber, oldId);
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

function cardNeedsMigration(card, projectCode) {
  if (LEGACY_CARD_ID_RE.test(card.id)) return true;
  if (card.issue_number == null) return true;
  if (!/^[A-Z0-9]{2,4}-\d+$/.test(card.id)) return true;
  if (!card.id.startsWith(`${projectCode}-`)) return true;
  const num = Number(card.id.split('-').pop());
  return Number.isNaN(num) || num !== card.issue_number;
}

function backfillCardIssueIds(db) {
  const projects = db.prepare('SELECT id, code FROM projects WHERE code IS NOT NULL').all();
  for (const project of projects) {
    const cards = db.prepare(`
      SELECT id, issue_number, created_at FROM cards WHERE project_id = ?
      ORDER BY created_at
    `).all(project.id);
    if (!cards.some(c => cardNeedsMigration(c, project.code))) continue;
    let num = 0;
    for (const card of cards) {
      num += 1;
      reassignCardId(db, card.id, `${project.code}-${num}`, num);
    }
  }
}

function backfill003(db) {
  const version = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get()?.v || 0;
  if (version < 3) return;
  backfillProjectCodes(db);
  backfillCardIssueIds(db);
}

module.exports = { backfill003, allocateProjectCode, normalizeProjectCode };
