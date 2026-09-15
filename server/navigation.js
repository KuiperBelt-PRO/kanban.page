'use strict';

const orgs = require('./db/repositories/organizations.js');
const projects = require('./db/repositories/projects.js');
const boards = require('./db/repositories/boards.js');

/** Árbol org → proyectos + tableros para la UI Kuiper. */
function buildNavigation(db) {
  const organizations = orgs.list(db).map(org => {
    const projectRows = projects.listByOrg(db, { organization_id: org.id });
    const boardRows = boards.list(db, { organization_id: org.id });
    return {
      id: org.id,
      slug: org.slug,
      name: org.name,
      projects: projectRows.map(p => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        organization_id: org.id,
        organization_slug: org.slug,
      })),
      boards: boardRows.map(b => ({
        id: b.id,
        slug: b.slug,
        name: b.name,
        organization_id: org.id,
        organization_slug: org.slug,
        project_ids: boards.listProjects(db, b.id).map(p => p.id),
      })),
    };
  });
  return { organizations };
}

module.exports = { buildNavigation };
