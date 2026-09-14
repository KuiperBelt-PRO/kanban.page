'use strict';

const orgs = require('../../server/db/repositories/organizations.js');
const { withDb } = require('./db.js');
const { printOk, printErr, humanErr } = require('./json.js');

function run(sub, args, opts) {
  try {
    return withDb(opts, db => {
      if (sub === 'list') {
        const rows = orgs.list(db);
        if (opts.json) return printOk({ organizations: rows }, { command: 'org list' });
        rows.forEach(o => console.log(`${o.slug}\t${o.name}`));
        return 0;
      }
      if (sub === 'create') {
        const name = opts.name || args[0];
        if (!name) throw new Error('--name required');
        const org = orgs.create(db, { slug: opts.slug, name });
        if (opts.json) return printOk({ organization: org }, { command: 'org create' });
        console.log(`created ${org.slug}`);
        return 0;
      }
      if (sub === 'get') {
        const ref = args[0] || opts.slug;
        const org = orgs.getBySlug(db, ref) || orgs.getById(db, ref);
        if (!org) throw new Error(`organization not found: ${ref}`);
        if (opts.json) return printOk({ organization: org }, { command: 'org get' });
        console.log(JSON.stringify(org, null, 2));
        return 0;
      }
      if (opts.json) return printErr('usage', 'org subcommands: list, create, get');
      return humanErr('org subcommands: list, create, get');
    });
  } catch (err) {
    if (opts.json) return printErr('not_found', err.message);
    return humanErr(err.message);
  }
}

module.exports = { run };
