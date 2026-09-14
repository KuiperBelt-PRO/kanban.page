'use strict';

const boards = require('../../server/db/repositories/boards.js');
const { withDb } = require('./db.js');
const { printOk, printErr, humanErr } = require('./json.js');

function run(sub, args, opts) {
  try {
    return withDb(opts, db => {
      if (sub === 'list') {
        const rows = boards.list(db, {
          organization_slug: opts.org,
          organization_id: opts.organizationId,
        });
        if (opts.json) return printOk({ boards: rows }, { command: 'board list' });
        rows.forEach(b => console.log(`${b.slug}\t${b.name}`));
        return 0;
      }
      if (sub === 'create') {
        const name = opts.name || args[0];
        if (!name || !opts.org) throw new Error('--name and --org required');
        const created = boards.create(db, {
          organization_slug: opts.org,
          slug: opts.slug,
          name,
          project_ids: opts.project ? [opts.project] : [],
        });
        if (opts.json) return printOk(created, { command: 'board create' });
        console.log(`created ${created.board.slug}`);
        return 0;
      }
      if (sub === 'show') {
        const ref = args[0] || opts.board;
        if (!ref) throw new Error('board id or slug required');
        const snapshot = boards.getSnapshot(db, ref);
        if (opts.json) return printOk(snapshot, { command: 'board show' });
        console.log(JSON.stringify(snapshot, null, 2));
        return 0;
      }
      if (sub === 'add-project') {
        const boardId = opts.board || args[0];
        const projectId = opts.project || args[1];
        if (!boardId || !projectId) throw new Error('--board and --project required');
        const result = boards.addProject(db, { board_id: boardId, project_id: projectId });
        if (opts.json) return printOk(result, { command: 'board add-project' });
        console.log('project linked');
        return 0;
      }
      if (sub === 'remove-project') {
        const boardId = opts.board || args[0];
        const projectId = opts.project || args[1];
        if (!boardId || !projectId) throw new Error('--board and --project required');
        const result = boards.removeProject(db, { board_id: boardId, project_id: projectId });
        if (opts.json) return printOk(result, { command: 'board remove-project' });
        console.log('project unlinked');
        return 0;
      }
      if (opts.json) {
        return printErr('usage', 'board subcommands: list, create, show, add-project, remove-project');
      }
      return humanErr('board subcommands: list, create, show, add-project, remove-project');
    });
  } catch (err) {
    if (opts.json) return printErr('not_found', err.message);
    return humanErr(err.message);
  }
}

module.exports = { run };
