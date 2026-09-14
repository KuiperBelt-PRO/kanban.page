'use strict';

const epics = require('../../server/db/repositories/epics.js');
const { withDb } = require('./db.js');
const { printOk, printErr, humanErr } = require('./json.js');

function run(sub, args, opts) {
  try {
    return withDb(opts, db => {
      if (sub === 'list') {
        if (!opts.project) throw new Error('--project required');
        const rows = epics.listByProject(db, opts.project);
        if (opts.json) return printOk({ epics: rows }, { command: 'epic list' });
        rows.forEach(e => console.log(`${e.id}\t${e.title}`));
        return 0;
      }
      if (sub === 'create') {
        if (!opts.project || !opts.title) throw new Error('--project and --title required');
        const epic = epics.create(db, {
          project_id: opts.project,
          title: opts.title,
          description: opts.description,
          status: opts.status,
        });
        if (opts.json) return printOk({ epic }, { command: 'epic create' });
        console.log(`created ${epic.id}`);
        return 0;
      }
      if (sub === 'get') {
        const id = args[0];
        const epic = epics.getById(db, id);
        if (!epic) throw new Error(`epic not found: ${id}`);
        if (opts.json) return printOk({ epic }, { command: 'epic get' });
        console.log(JSON.stringify(epic, null, 2));
        return 0;
      }
      if (sub === 'update') {
        const id = args[0];
        const epic = epics.update(db, id, {
          title: opts.title,
          description: opts.description,
          status: opts.status,
        });
        if (opts.json) return printOk({ epic }, { command: 'epic update' });
        console.log(`updated ${epic.id}`);
        return 0;
      }
      if (opts.json) return printErr('usage', 'epic subcommands: list, create, get, update');
      return humanErr('epic subcommands: list, create, get, update');
    });
  } catch (err) {
    if (opts.json) return printErr('validation', err.message);
    return humanErr(err.message);
  }
}

module.exports = { run };
