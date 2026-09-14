'use strict';

const http = require('http');
const { openDb } = require('./db/connection.js');
const { migrate } = require('./db/migrate.js');
const { route } = require('./api/router.js');
const { DEFAULT_PORT } = require('./config.js');

function startServer({ port = DEFAULT_PORT, dbPath } = {}) {
  if (dbPath) process.env.KANBAN_DB_PATH = dbPath;
  const db = openDb(dbPath);
  migrate(db);

  const server = http.createServer(async (req, res) => {
    try {
      await route(req, res, db);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: { message: err.message } }));
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`kanban serve · http://127.0.0.1:${port}/?kuiper=1&board=hub-delivery`);
  });
  return server;
}

module.exports = { startServer };
