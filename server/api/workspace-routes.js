'use strict';

const orgs = require('../db/repositories/organizations.js');
const projects = require('../db/repositories/projects.js');
const boards = require('../db/repositories/boards.js');
const epics = require('../db/repositories/epics.js');
const tags = require('../db/repositories/tags.js');
const sprints = require('../db/repositories/sprints.js');
const { sendJson, readBody } = require('./middleware.js');

function conflict(res, message) {
  sendJson(res, 409, { ok: false, error: { code: 'conflict', message } });
}

async function handleWorkspaceRoutes(req, res, db, urlPath, method, { badRequest, notFound }) {
  const orgProjects = urlPath.match(/^\/api\/v1\/organizations\/([^/]+)\/projects$/);
  if (orgProjects && method === 'GET') {
    const org = orgs.getBySlug(db, decodeURIComponent(orgProjects[1]));
    if (!org) return notFound(res);
    return sendJson(res, 200, { ok: true, data: { projects: projects.listByOrg(db, { organization_id: org.id }) } });
  }
  if (orgProjects && method === 'POST') {
    try {
      const body = await readBody(req);
      const project = projects.create(db, {
        organization_slug: decodeURIComponent(orgProjects[1]),
        name: body.name,
        slug: body.slug,
        description: body.description,
        code: body.code,
      });
      return sendJson(res, 201, { ok: true, data: { project } });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return conflict(res, err.message);
      return badRequest(res, err.message);
    }
  }

  const orgSprints = urlPath.match(/^\/api\/v1\/organizations\/([^/]+)\/sprints$/);
  if (orgSprints && method === 'GET') {
    const org = orgs.getBySlug(db, decodeURIComponent(orgSprints[1]));
    if (!org) return notFound(res);
    const rows = sprints.listByOrg(db, { organization_id: org.id }).map(s => sprints.attachProjects(db, s));
    return sendJson(res, 200, { ok: true, data: { sprints: rows } });
  }
  if (orgSprints && method === 'POST') {
    try {
      const body = await readBody(req);
      const sprint = sprints.create(db, {
        organization_slug: decodeURIComponent(orgSprints[1]),
        name: body.name,
        slug: body.slug,
        goal: body.goal,
        start_date: body.start_date,
        end_date: body.end_date,
        status: body.status,
        project_ids: body.project_ids,
      });
      return sendJson(res, 201, { ok: true, data: { sprint } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const orgBoards = urlPath.match(/^\/api\/v1\/organizations\/([^/]+)\/boards$/);
  if (orgBoards && method === 'GET') {
    const org = orgs.getBySlug(db, decodeURIComponent(orgBoards[1]));
    if (!org) return notFound(res);
    const rows = boards.list(db, { organization_id: org.id }).map(b => ({
      ...b,
      project_ids: boards.listProjects(db, b.id).map(p => p.id),
    }));
    return sendJson(res, 200, { ok: true, data: { boards: rows } });
  }
  if (orgBoards && method === 'POST') {
    try {
      const body = await readBody(req);
      const result = boards.create(db, {
        organization_slug: decodeURIComponent(orgBoards[1]),
        name: body.name,
        slug: body.slug,
        project_ids: body.project_ids || [],
      });
      return sendJson(res, 201, { ok: true, data: result });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const orgPatch = urlPath.match(/^\/api\/v1\/organizations\/([^/]+)$/);
  if (orgPatch && method === 'PATCH') {
    try {
      const body = await readBody(req);
      const org = orgs.update(db, decodeURIComponent(orgPatch[1]), { name: body.name });
      return sendJson(res, 200, { ok: true, data: { organization: org } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const projectPatch = urlPath.match(/^\/api\/v1\/projects\/([^/]+)$/);
  if (projectPatch && method === 'PATCH') {
    try {
      const body = await readBody(req);
      const project = projects.update(db, decodeURIComponent(projectPatch[1]), body);
      return sendJson(res, 200, { ok: true, data: { project } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }
  if (projectPatch && method === 'DELETE') {
    try {
      const data = projects.remove(db, decodeURIComponent(projectPatch[1]));
      return sendJson(res, 200, { ok: true, data });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const projectEpics = urlPath.match(/^\/api\/v1\/projects\/([^/]+)\/epics$/);
  if (projectEpics && method === 'GET') {
    const list = epics.listByProject(db, decodeURIComponent(projectEpics[1]));
    return sendJson(res, 200, { ok: true, data: { epics: list } });
  }
  if (projectEpics && method === 'POST') {
    try {
      const body = await readBody(req);
      const epic = epics.create(db, {
        project_id: decodeURIComponent(projectEpics[1]),
        title: body.title,
        description: body.description,
        status: body.status,
        sprint_id: body.sprint_id,
      });
      return sendJson(res, 201, { ok: true, data: { epic } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const epicId = urlPath.match(/^\/api\/v1\/epics\/([^/]+)$/);
  if (epicId && method === 'PATCH') {
    try {
      const body = await readBody(req);
      const epic = epics.update(db, decodeURIComponent(epicId[1]), body);
      return sendJson(res, 200, { ok: true, data: { epic } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }
  if (epicId && method === 'DELETE') {
    try {
      const data = epics.remove(db, decodeURIComponent(epicId[1]));
      return sendJson(res, 200, { ok: true, data });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const boardMembership = urlPath.match(/^\/api\/v1\/boards\/([^/]+)\/membership$/);
  if (boardMembership && method === 'GET') {
    const board = boards.resolveBoard(db, decodeURIComponent(boardMembership[1]));
    if (!board) return notFound(res);
    return sendJson(res, 200, { ok: true, data: boards.getMembership(db, board.id) });
  }

  const boardPatch = urlPath.match(/^\/api\/v1\/boards\/([^/]+)$/);
  if (boardPatch && method === 'PATCH') {
    try {
      const board = boards.resolveBoard(db, decodeURIComponent(boardPatch[1]));
      if (!board) return notFound(res);
      const body = await readBody(req);
      const updated = boards.updateBoard(db, board.id, { name: body.name });
      return sendJson(res, 200, { ok: true, data: { board: updated } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const boardProject = urlPath.match(/^\/api\/v1\/boards\/([^/]+)\/projects$/);
  if (boardProject && method === 'POST') {
    try {
      const board = boards.resolveBoard(db, decodeURIComponent(boardProject[1]));
      if (!board) return notFound(res);
      const body = await readBody(req);
      boards.addProject(db, { board_id: board.id, project_id: body.project_id });
      return sendJson(res, 200, { ok: true, data: boards.getMembership(db, board.id) });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const boardProjectDel = urlPath.match(/^\/api\/v1\/boards\/([^/]+)\/projects\/([^/]+)$/);
  if (boardProjectDel && method === 'DELETE') {
    try {
      const board = boards.resolveBoard(db, decodeURIComponent(boardProjectDel[1]));
      if (!board) return notFound(res);
      const projectId = decodeURIComponent(boardProjectDel[2]);
      const n = db.prepare('SELECT COUNT(*) AS c FROM cards WHERE board_id = ? AND project_id = ?').get(board.id, projectId);
      if (n.c > 0) return badRequest(res, 'project has cards on this board');
      boards.removeProject(db, { board_id: board.id, project_id: projectId });
      return sendJson(res, 200, { ok: true, data: boards.getMembership(db, board.id) });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const boardStages = urlPath.match(/^\/api\/v1\/boards\/([^/]+)\/stages$/);
  if (boardStages && method === 'POST') {
    try {
      const board = boards.resolveBoard(db, decodeURIComponent(boardStages[1]));
      if (!board) return notFound(res);
      const body = await readBody(req);
      const stage = boards.createStage(db, board.id, body.name);
      return sendJson(res, 201, { ok: true, data: { stage } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const boardStageReorder = urlPath.match(/^\/api\/v1\/boards\/([^/]+)\/stages\/reorder$/);
  if (boardStageReorder && method === 'PATCH') {
    try {
      const board = boards.resolveBoard(db, decodeURIComponent(boardStageReorder[1]));
      if (!board) return notFound(res);
      const body = await readBody(req);
      const stages = boards.reorderStages(db, board.id, body.order);
      return sendJson(res, 200, { ok: true, data: { stages } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const boardStage = urlPath.match(/^\/api\/v1\/boards\/([^/]+)\/stages\/([^/]+)$/);
  if (boardStage && method === 'PATCH') {
    try {
      const board = boards.resolveBoard(db, decodeURIComponent(boardStage[1]));
      if (!board) return notFound(res);
      const body = await readBody(req);
      const stage = boards.updateStage(db, board.id, decodeURIComponent(boardStage[2]), body);
      return sendJson(res, 200, { ok: true, data: { stage } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }
  if (boardStage && method === 'DELETE') {
    try {
      const board = boards.resolveBoard(db, decodeURIComponent(boardStage[1]));
      if (!board) return notFound(res);
      const data = boards.deleteStage(db, board.id, decodeURIComponent(boardStage[2]));
      return sendJson(res, 200, { ok: true, data });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const boardTagsPost = urlPath.match(/^\/api\/v1\/boards\/([^/]+)\/tags$/);
  if (boardTagsPost && method === 'POST') {
    try {
      const board = boards.resolveBoard(db, decodeURIComponent(boardTagsPost[1]));
      if (!board) return notFound(res);
      const body = await readBody(req);
      const tag = tags.create(db, board.id, body.name);
      boards.bumpVersion(db, board.id);
      return sendJson(res, 201, { ok: true, data: { tag } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const tagId = urlPath.match(/^\/api\/v1\/tags\/([^/]+)$/);
  if (tagId && method === 'PATCH') {
    try {
      const body = await readBody(req);
      const tag = tags.rename(db, decodeURIComponent(tagId[1]), body.name);
      const card = db.prepare('SELECT board_id FROM cards JOIN card_tags ON card_tags.card_id = cards.id WHERE card_tags.tag_id = ? LIMIT 1').get(tag.id);
      if (card?.board_id) boards.bumpVersion(db, card.board_id);
      return sendJson(res, 200, { ok: true, data: { tag } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }
  if (tagId && method === 'DELETE') {
    try {
      const tag = tags.getById(db, decodeURIComponent(tagId[1]));
      if (!tag) return notFound(res);
      tags.remove(db, tag.id);
      boards.bumpVersion(db, tag.board_id);
      return sendJson(res, 200, { ok: true, data: { removed: true } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  const sprintId = urlPath.match(/^\/api\/v1\/sprints\/([^/]+)$/);
  if (sprintId && method === 'GET') {
    const sprint = sprints.getById(db, decodeURIComponent(sprintId[1]));
    if (!sprint) return notFound(res);
    return sendJson(res, 200, { ok: true, data: { sprint: sprints.attachProjects(db, sprint) } });
  }
  if (sprintId && method === 'PATCH') {
    try {
      const body = await readBody(req);
      const sprint = sprints.update(db, decodeURIComponent(sprintId[1]), body);
      return sendJson(res, 200, { ok: true, data: { sprint } });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }
  if (sprintId && method === 'DELETE') {
    try {
      const data = sprints.remove(db, decodeURIComponent(sprintId[1]));
      return sendJson(res, 200, { ok: true, data });
    } catch (err) {
      return badRequest(res, err.message);
    }
  }

  return false;
}

module.exports = { handleWorkspaceRoutes };
