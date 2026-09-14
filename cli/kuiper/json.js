'use strict';

const { resolveDbPath } = require('../../server/config.js');

const EXIT = {
  ok: 0,
  usage: 2,
  not_found: 3,
  validation: 4,
  internal: 1,
};

function printOk(data, meta = {}) {
  const payload = {
    ok: true,
    data,
    meta: {
      ...meta,
      db_path: resolveDbPath(process.env.KANBAN_DB_PATH),
    },
  };
  console.log(JSON.stringify(payload, null, 2));
  return EXIT.ok;
}

function printErr(code, message) {
  const payload = {
    ok: false,
    error: { code, message },
  };
  console.log(JSON.stringify(payload, null, 2));
  return EXIT[code] ?? EXIT.internal;
}

function humanErr(message) {
  console.error(message);
  return EXIT.validation;
}

module.exports = { EXIT, printOk, printErr, humanErr };
