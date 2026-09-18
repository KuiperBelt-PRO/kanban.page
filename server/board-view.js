'use strict';

const orgs = require('./db/repositories/organizations.js');

/** Map Kuiper board snapshot → upstream kanban.page state shape. */

const ENTITY_COLORS = [
  '#FFB454', '#7FD1AE', '#8FB8FF', '#F58FA8', '#C79BFF', '#6FD3E8', '#D6C36B', '#9AA5B8',
];

function snapshotToState(snapshot) {
  const now = Date.now();
  const columns = snapshot.stages.map((s, index) => ({
    id: s.id,
    name: s.name,
    order: s.position - 1,
    mt: now,
  }));
  const projects = snapshot.projects.map((p, index) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    code: p.code || null,
    organizationId: p.organization_id || snapshot.organization?.id || null,
    organizationSlug: p.organization_slug || snapshot.organization?.slug || null,
    color: ENTITY_COLORS[index % ENTITY_COLORS.length],
    mt: now,
  }));
  const epics = (snapshot.epics || []).map((e, index) => ({
    id: e.id,
    projectId: e.project_id,
    title: e.title,
    status: e.status,
    color: ENTITY_COLORS[index % ENTITY_COLORS.length],
    mt: now,
  }));
  const tasks = [];
  for (const card of snapshot.cards) {
    if (card.archived) continue;
    tasks.push({
      id: card.id,
      title: card.title,
      notes: card.notes || '',
      projectId: card.project_id,
      epicId: card.epic_id || null,
      priority: card.priority != null ? card.priority : 0,
      estimatedMinutes: card.estimated_minutes != null ? card.estimated_minutes : null,
      tags: (card.tags || []).map(t => t.name),
      blockedBy: (card.blocked_by || []).map(l => ({ id: l.id, title: l.title, linkId: l.link_id })),
      blocks: (card.blocks || []).map(l => ({ id: l.id, title: l.title, linkId: l.link_id })),
      related: (card.related || []).map(l => ({ id: l.id, title: l.title, linkId: l.link_id })),
      scheduleStartDate: card.schedule_start_date || null,
      scheduleEndDate: card.schedule_end_date || null,
      timeLoggedMinutes: card.time_logged_minutes || 0,
      activeTimer: card.active_timer ? {
        id: card.active_timer.id,
        startedAt: card.active_timer.started_at,
        label: card.active_timer.label || '',
      } : null,
      session: card.session_ref || '',
      flag: !!card.flagged,
      columnId: card.stage_id,
      order: card.position,
      createdAt: Date.parse(card.created_at) || now,
      updatedAt: Date.parse(card.updated_at) || now,
    });
  }
  const org = snapshot.organization || null;
  return {
    columns,
    columnsMt: now,
    projects,
    projectsMt: now,
    epics,
    epicsMt: now,
    tasks,
    events: [],
    theme: 'dark',
    density: 'comfortable',
    epicFilter: null,
    projectFilters: [],
    epicFilters: [],
    groupBy: 'none',
    sortBy: 'position',
    _kuiper: {
      boardId: snapshot.board.id,
      boardSlug: snapshot.board.slug,
      boardName: snapshot.board.name,
      version: snapshot.version,
      boardTags: (snapshot.board_tags || []).map(t => t.name),
      organization: org ? { id: org.id, slug: org.slug, name: org.name } : null,
    },
  };
}

function attachOrganization(snapshot, db) {
  const board = snapshot.board;
  if (!board?.organization_id) return snapshot;
  const org = orgs.getById(db, board.organization_id);
  if (!org) return snapshot;
  return {
    ...snapshot,
    organization: { id: org.id, slug: org.slug, name: org.name },
    projects: snapshot.projects.map(p => ({
      ...p,
      organization_id: org.id,
      organization_slug: org.slug,
    })),
  };
}

module.exports = { snapshotToState, attachOrganization };
