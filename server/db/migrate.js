'use strict';

const fs = require('fs');
const path = require('path');
const { migrationsDir } = require('../config.js');
const { nowIso } = require('../util.js');
const { backfill003 } = require('./backfill-003.js');

function listMigrationFiles() {
  const dir = migrationsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^\d+_.+\.sql$/.test(f))
    .sort();
}

function currentVersion(db) {
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get();
  return row && row.v != null ? row.v : 0;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const files = listMigrationFiles();
  let applied = 0;
  for (const file of files) {
    const version = Number(file.split('_')[0]);
    if (!version) continue;
    const done = db.prepare('SELECT 1 AS n FROM schema_migrations WHERE version = ?').get(version);
    if (done) continue;
    const sql = fs.readFileSync(path.join(migrationsDir(), file), 'utf8');
    db.exec(sql);
    db.prepare('INSERT OR REPLACE INTO schema_migrations(version, applied_at) VALUES (?, ?)')
      .run(version, nowIso());
    applied += 1;
  }
  backfill003(db);
  return { version: currentVersion(db), applied };
}

module.exports = { migrate, currentVersion, listMigrationFiles };
