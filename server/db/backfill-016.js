'use strict';

const { allocateBoardCode } = require('./repositories/boards.js');

function backfillBoardCodes(db) {
  const rows = db.prepare('SELECT id, organization_id, slug, name, code FROM boards').all();
  for (const row of rows) {
    if (row.code) continue;
    const code = allocateBoardCode(db, row.organization_id, row.slug, row.name, row.id);
    db.prepare('UPDATE boards SET code = ? WHERE id = ?').run(code, row.id);
  }
}

module.exports = { backfillBoardCodes };
