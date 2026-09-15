'use strict';

/** Map Kuiper board snapshot → upstream kanban.page state shape. */

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
    name: p.name,
    color: ['#FFB454', '#7FD1AE', '#8FB8FF', '#F58FA8'][index % 4],
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
      session: card.session_ref || '',
      flag: !!card.flagged,
      columnId: card.stage_id,
      order: card.position,
      createdAt: Date.parse(card.created_at) || now,
      updatedAt: Date.parse(card.updated_at) || now,
    });
  }
  return {
    columns,
    columnsMt: now,
    projects,
    projectsMt: now,
    tasks,
    events: [],
    theme: 'dark',
    density: 'comfortable',
    _kuiper: {
      boardId: snapshot.board.id,
      boardSlug: snapshot.board.slug,
      version: snapshot.version,
    },
  };
}

module.exports = { snapshotToState };
