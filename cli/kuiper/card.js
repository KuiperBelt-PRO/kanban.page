'use strict';

const cards = require('../../server/db/repositories/cards.js');
const boards = require('../../server/db/repositories/boards.js');
const { withDb } = require('./db.js');
const { printOk, printErr, humanErr } = require('./json.js');

function run(sub, args, opts) {
  try {
    return withDb(opts, db => {
      if (sub === 'list') {
        const boardRef = opts.board;
        if (!boardRef) throw new Error('--board required');
        const board = boards.resolveBoard(db, boardRef);
        if (!board) throw new Error(`board not found: ${boardRef}`);
        const rows = cards.listByBoard(db, board.id, { includeArchived: !!opts.all });
        if (opts.json) return printOk({ cards: rows }, { command: 'card list' });
        rows.forEach(c => console.log(`${c.id}\t${c.title}`));
        return 0;
      }
      if (sub === 'create') {
        const title = opts.title || args[0];
        if (!title) throw new Error('--title required');
        const card = cards.create(db, {
          board_id: opts.board,
          board_slug: opts.board,
          project_id: opts.project,
          project_slug: opts.projectSlug,
          organization_slug: opts.org,
          title,
          notes: opts.notes,
          session_ref: opts.session,
          stage: opts.stage,
          stage_id: opts.stageId,
          epic_id: opts.epic,
          flagged: opts.flag,
          priority: opts.priority != null ? Number(opts.priority) : undefined,
        });
        if (opts.json) return printOk({ card }, { command: 'card create' });
        console.log(`created ${card.id}`);
        return 0;
      }
      if (sub === 'get') {
        const id = args[0];
        const card = cards.getById(db, id);
        if (!card) throw new Error(`card not found: ${id}`);
        if (opts.json) return printOk({ card }, { command: 'card get' });
        console.log(JSON.stringify(card, null, 2));
        return 0;
      }
      if (sub === 'update') {
        const id = args[0];
        const card = cards.update(db, id, {
          title: opts.title,
          notes: opts.notes,
          session_ref: opts.session,
          project_id: opts.project,
          epic_id: opts.epic,
          flagged: opts.flag != null ? true : (opts.noFlag ? false : undefined),
          priority: opts.priority != null ? Number(opts.priority) : undefined,
        });
        if (opts.json) return printOk({ card }, { command: 'card update' });
        console.log(`updated ${card.id}`);
        return 0;
      }
      if (sub === 'move') {
        const id = args[0];
        const result = cards.move(db, id, {
          stage: opts.stage,
          stage_id: opts.stageId,
          position: opts.position != null ? Number(opts.position) : undefined,
        });
        if (opts.json) return printOk(result, { command: 'card move' });
        console.log(`moved ${id}`);
        return 0;
      }
      if (sub === 'archive') {
        const id = args[0];
        const card = cards.archive(db, id, true);
        if (opts.json) return printOk({ card }, { command: 'card archive' });
        console.log(`archived ${id}`);
        return 0;
      }
      if (sub === 'restore') {
        const id = args[0];
        const card = cards.archive(db, id, false);
        if (opts.json) return printOk({ card }, { command: 'card restore' });
        console.log(`restored ${id}`);
        return 0;
      }
      if (opts.json) {
        return printErr('usage', 'card subcommands: list, create, get, update, move, archive, restore');
      }
      return humanErr('card subcommands: list, create, get, update, move, archive, restore');
    });
  } catch (err) {
    if (opts.json) return printErr('not_found', err.message);
    return humanErr(err.message);
  }
}

module.exports = { run };
