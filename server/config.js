'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_PORT = 8765;
const DEFAULT_STAGES = ['INBOX', 'DOING', 'WAITING', 'DONE'];

function resolveDbPath(override) {
  if (override) return path.resolve(override);
  if (process.env.KANBAN_DB_PATH) return path.resolve(process.env.KANBAN_DB_PATH);
  return path.join(os.homedir(), '.kuiper', 'kanban', 'kuiper.db');
}

function ensureDbDir(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

function migrationsDir() {
  return path.join(__dirname, '..', 'migrations');
}

module.exports = {
  DEFAULT_PORT,
  DEFAULT_STAGES,
  resolveDbPath,
  ensureDbDir,
  migrationsDir,
};
