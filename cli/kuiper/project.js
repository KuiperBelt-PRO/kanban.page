'use strict';

const projects = require('../../server/db/repositories/projects.js');
const { withDb } = require('./db.js');
const { printOk, printErr, humanErr } = require('./json.js');

function run(sub, args, opts) {
  try {
    return withDb(opts, db => {
      if (sub === 'list') {
        const rows = projects.listByOrg(db, {
          organization_slug: opts.org,
          organization_id: opts.organizationId,
        });
        if (opts.json) return printOk({ projects: rows }, { command: 'project list' });
        rows.forEach(p => console.log(`${p.slug}\t${p.name}`));
        return 0;
      }
      if (sub === 'create') {
        const name = opts.name || args[0];
        if (!name) throw new Error('--name required');
        if (!opts.org) throw new Error('--org required');
        const project = projects.create(db, {
          organization_slug: opts.org,
          slug: opts.slug,
          name,
          description: opts.description,
        });
        if (opts.json) return printOk({ project }, { command: 'project create' });
        console.log(`created ${project.slug}`);
        return 0;
      }
      if (sub === 'get') {
        const ref = args[0];
        const project = projects.getById(db, ref)
          || (opts.org ? projects.getByOrgSlug(db, opts.org, ref) : null);
        if (!project) throw new Error(`project not found: ${ref}`);
        const repos = projects.listRepos(db, project.id);
        if (opts.json) return printOk({ project, repos }, { command: 'project get' });
        console.log(JSON.stringify({ project, repos }, null, 2));
        return 0;
      }
      if (sub === 'link-repo') {
        const projectId = opts.project || args[0];
        const owner = opts.owner;
        const repo = opts.repo;
        if (!projectId || !owner || !repo) throw new Error('--project --owner --repo required');
        const link = projects.linkRepo(db, { project_id: projectId, owner, repo });
        if (opts.json) return printOk({ link }, { command: 'project link-repo' });
        console.log(`linked ${owner}/${repo}`);
        return 0;
      }
      if (opts.json) return printErr('usage', 'project subcommands: list, create, get, link-repo');
      return humanErr('project subcommands: list, create, get, link-repo');
    });
  } catch (err) {
    if (opts.json) return printErr('validation', err.message);
    return humanErr(err.message);
  }
}

module.exports = { run };
