'use strict';

const { colorByIndex, colorByName } = require('../entity-colors.js');

function backfillEntityColors(db) {
  const tagRows = db.prepare('SELECT id, organization_id, name, color FROM tags ORDER BY organization_id, name COLLATE NOCASE').all();
  let tagIdxByOrg = new Map();
  for (const row of tagRows) {
    if (row.color) continue;
    const n = tagIdxByOrg.get(row.organization_id) || 0;
    const color = colorByName(row.name) || colorByIndex(n + 2);
    db.prepare('UPDATE tags SET color = ? WHERE id = ?').run(color, row.id);
    tagIdxByOrg.set(row.organization_id, n + 1);
  }

  const projRows = db.prepare(`
    SELECT id, organization_id, name, color FROM projects
    ORDER BY organization_id, name COLLATE NOCASE
  `).all();
  let projIdxByOrg = new Map();
  for (const row of projRows) {
    if (row.color) continue;
    const n = projIdxByOrg.get(row.organization_id) || 0;
    const color = colorByIndex(n);
    db.prepare('UPDATE projects SET color = ? WHERE id = ?').run(color, row.id);
    projIdxByOrg.set(row.organization_id, n + 1);
  }
}

module.exports = { backfillEntityColors };
