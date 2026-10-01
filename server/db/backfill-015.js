'use strict';

const { allocateOrganizationCode } = require('./repositories/organizations.js');

function backfillOrganizationCodes(db) {
  const rows = db.prepare('SELECT id, slug, name, code FROM organizations').all();
  for (const row of rows) {
    if (row.code) continue;
    const code = allocateOrganizationCode(db, row.slug, row.name, row.id);
    db.prepare('UPDATE organizations SET code = ? WHERE id = ?').run(code, row.id);
  }
}

module.exports = { backfillOrganizationCodes };
