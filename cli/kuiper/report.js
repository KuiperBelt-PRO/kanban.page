'use strict';

const boards = require('../../server/db/repositories/boards.js');
const events = require('../../server/db/repositories/events.js');
const { withDb } = require('./db.js');
const { printOk, printErr, humanErr } = require('./json.js');

function buildMarkdown(snapshot, eventRows) {
  const lines = [`# ${snapshot.board.name}`, '', `Board: \`${snapshot.board.slug}\` · version ${snapshot.version}`, ''];
  for (const stage of snapshot.stages) {
    lines.push(`## ${stage.name}`);
    const cards = snapshot.cards.filter(c => c.stage_id === stage.id && !c.archived);
    if (!cards.length) {
      lines.push('- _(vacío)_');
    } else {
      for (const card of cards) {
        lines.push(`- **${card.id}** ${card.title}`);
      }
    }
    lines.push('');
  }
  if (eventRows.length) {
    lines.push('## Eventos recientes');
    for (const ev of eventRows.slice(-20)) {
      lines.push(`- ${ev.created_at} · ${ev.event_type} · ${ev.card_id}`);
    }
  }
  return lines.join('\n');
}

function run(args, opts) {
  try {
    return withDb(opts, db => {
      const boardRef = opts.board;
      if (!boardRef) throw new Error('--board required');
      const snapshot = boards.getSnapshot(db, boardRef);
      const eventRows = events.listForReport(db, snapshot.board.id, { since: opts.since });
      const markdown = buildMarkdown(snapshot, eventRows);
      if (opts.json || opts.md) {
        return printOk({ markdown, board: snapshot.board }, { command: 'report' });
      }
      console.log(markdown);
      return 0;
    });
  } catch (err) {
    if (opts.json) return printErr('not_found', err.message);
    return humanErr(err.message);
  }
}

module.exports = { run };
