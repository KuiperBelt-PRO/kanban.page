'use strict';

const org = require('./org.js');
const project = require('./project.js');
const board = require('./board.js');
const epic = require('./epic.js');
const card = require('./card.js');
const db = require('./db.js');
const report = require('./report.js');
const serve = require('./serve.js');

const KUIPER_ROOTS = new Set(['org', 'project', 'board', 'epic', 'card', 'db', 'report', 'serve']);

const UPSTREAM_CMDS = new Set([
  'add', 'mv', 'done', 'edit', 'archive', 'restore', 'ls', 'show', 'report',
]);

function isKuiperCommand(cmd) {
  return KUIPER_ROOTS.has(cmd);
}

function isLocalMode() {
  return !!process.env.KANBAN_DB_PATH || process.env.KUIPER_LOCAL_MODE === '1';
}

function localModeMessage(cmd) {
  return `local_mode: sync disabled in Kuiper fork (command "${cmd}" uses upstream relay)`;
}

async function dispatch(cmd, args, opts) {
  if (cmd === 'serve') return await serve.run(args, opts);
  if (cmd === 'report') return report.run(args, opts);
  if (cmd === 'db') return db.run(args[0], args.slice(1), opts);

  const [sub, ...rest] = args;
  if (!sub) return 2;

  if (cmd === 'org') return org.run(sub, rest, opts);
  if (cmd === 'project') return project.run(sub, rest, opts);
  if (cmd === 'board') return board.run(sub, rest, opts);
  if (cmd === 'epic') return epic.run(sub, rest, opts);
  if (cmd === 'card') return card.run(sub, rest, opts);
  return 2;
}

module.exports = {
  dispatch,
  isKuiperCommand,
  isLocalMode,
  localModeMessage,
  UPSTREAM_CMDS,
};
