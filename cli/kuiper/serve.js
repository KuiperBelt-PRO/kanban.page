'use strict';

const { startServer } = require('../../server/index.js');
const { DEFAULT_PORT } = require('../../server/config.js');

function run(args, opts) {
  const port = Number(opts.port || DEFAULT_PORT);
  startServer({ port, dbPath: opts.db });
  // Mantener el proceso vivo hasta Ctrl+C (kanban.js haría exit(0) si devolvemos).
  return new Promise(() => {});
}

module.exports = { run };
