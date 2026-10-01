'use strict';

const { allocateSprintCode } = require('./repositories/sprints.js');

function backfillSprintCodes(db) {
  const rows = db.prepare('SELECT id, organization_id, slug, name, code FROM sprints').all();
  for (const row of rows) {
    if (row.code) continue;
    const code = allocateSprintCode(db, row.organization_id, row.slug, row.name, row.id);
    db.prepare('UPDATE sprints SET code = ? WHERE id = ?').run(code, row.id);
  }
}

module.exports = { backfillSprintCodes };
