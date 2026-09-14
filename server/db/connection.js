'use strict';

const Database = require('better-sqlite3');
const { resolveDbPath, ensureDbDir } = require('../config.js');

let shared = null;
let sharedPath = null;

function openDb(dbPath) {
  const resolved = resolveDbPath(dbPath);
  if (shared && sharedPath === resolved) return shared;
  ensureDbDir(resolved);
  const db = new Database(resolved);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  shared = db;
  sharedPath = resolved;
  return db;
}

function closeDb() {
  if (shared) {
    shared.close();
    shared = null;
    sharedPath = null;
  }
}

function resetSharedForTests() {
  closeDb();
}

module.exports = { openDb, closeDb, resetSharedForTests };
