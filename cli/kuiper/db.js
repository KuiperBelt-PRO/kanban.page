'use strict';

const { openDb } = require('../../server/db/connection.js');
const { migrate } = require('../../server/db/migrate.js');
const { resolveDbPath } = require('../../server/config.js');
const orgs = require('../../server/db/repositories/organizations.js');
const projects = require('../../server/db/repositories/projects.js');
const boards = require('../../server/db/repositories/boards.js');
const epics = require('../../server/db/repositories/epics.js');
const cards = require('../../server/db/repositories/cards.js');
const { printOk, printErr, humanErr } = require('./json.js');

function withDb(opts, fn) {
  const db = openDb(opts.db);
  migrate(db);
  return fn(db);
}

function cmdMigrate(args, opts) {
  return withDb(opts, db => {
    const result = migrate(db);
    if (opts.json) return printOk({ version: result.version, applied: result.applied }, { command: 'db migrate' });
    console.log(`migrated to version ${result.version} (${result.applied} applied)`);
    return 0;
  });
}

function cmdPath(args, opts) {
  const path = resolveDbPath(opts.db);
  if (opts.json) return printOk({ path }, { command: 'db path' });
  console.log(path);
  return 0;
}

function cmdSeed(args, opts) {
  return withDb(opts, db => {
    let org = orgs.getBySlug(db, 'kuiperbelt-pro');
    if (!org) {
      org = orgs.create(db, { slug: 'kuiperbelt-pro', name: 'KuiperBelt-PRO' });
    }
    let vibe = projects.getByOrgSlug(db, 'kuiperbelt-pro', 'vibe-coding');
    if (!vibe) {
      vibe = projects.create(db, {
        organization_slug: 'kuiperbelt-pro',
        slug: 'vibe-coding',
        name: 'KuiperBelt Vibe-Coding',
        description: 'Hub de desarrollo y MCPs',
      });
      projects.linkRepo(db, { project_id: vibe.id, owner: 'KuiperBelt-PRO', repo: 'Vibe-Coding' });
    }
    let openMed = projects.getByOrgSlug(db, 'kuiperbelt-pro', 'open-medical');
    if (!openMed) {
      openMed = projects.create(db, {
        organization_slug: 'kuiperbelt-pro',
        slug: 'open-medical',
        name: 'Open Medical Project',
        description: 'Plataforma médica abierta',
      });
      projects.linkRepo(db, { project_id: openMed.id, owner: 'KuiperBelt-PRO', repo: 'open-medical-project' });
    }
    let board = boards.getBySlug(db, 'kuiperbelt-pro', 'hub-delivery');
    if (!board) {
      const created = boards.create(db, {
        organization_slug: 'kuiperbelt-pro',
        slug: 'hub-delivery',
        name: 'Hub delivery',
        project_ids: [vibe.id, openMed.id],
      });
      board = created.board;
    } else {
      boards.addProject(db, { board_id: board.id, project_id: vibe.id });
      boards.addProject(db, { board_id: board.id, project_id: openMed.id });
    }
    let epic = epics.listByProject(db, vibe.id)[0];
    if (!epic) {
      epic = epics.create(db, {
        project_id: vibe.id,
        title: 'Kanban Kuiper MCP',
        description: 'Sustituir Jira con tablero local',
        status: 'in_progress',
      });
    }
    const existing = cards.listByBoard(db, board.id);
    if (!existing.length) {
      cards.create(db, {
        board_id: board.id,
        project_id: vibe.id,
        title: 'Implementar MCP kuiper-kanban',
        notes: 'Fase 1–4 del plan de implementación',
        stage: 'DOING',
        epic_id: epic.id,
      });
    }
    const snapshot = boards.getSnapshot(db, board.slug);
    if (opts.json) return printOk({ seeded: true, board: snapshot.board }, { command: 'db seed' });
    console.log(`seed ok · board "${board.slug}"`);
    return 0;
  });
}

function run(sub, args, opts) {
  try {
    if (sub === 'migrate') return cmdMigrate(args, opts);
    if (sub === 'path') return cmdPath(args, opts);
    if (sub === 'seed') return cmdSeed(args, opts);
    if (opts.json) return printErr('usage', 'db subcommands: migrate, path, seed');
    return humanErr('db subcommands: migrate, path, seed');
  } catch (err) {
    if (opts.json) return printErr('validation', err.message);
    return humanErr(err.message);
  }
}

module.exports = { run, withDb };
