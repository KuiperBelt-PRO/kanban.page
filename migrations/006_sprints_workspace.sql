-- Sprints, workspace colors, sprint assignment on cards/epics

ALTER TABLE projects ADD COLUMN color TEXT;

CREATE TABLE sprints (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  slug            TEXT NOT NULL,
  name            TEXT NOT NULL,
  goal            TEXT,
  start_date      TEXT NOT NULL,
  end_date        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'planned',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (organization_id, slug)
);

CREATE TABLE sprint_projects (
  sprint_id   TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (sprint_id, project_id)
);

ALTER TABLE cards ADD COLUMN sprint_id TEXT REFERENCES sprints(id) ON DELETE SET NULL;
ALTER TABLE epics ADD COLUMN sprint_id TEXT REFERENCES sprints(id) ON DELETE SET NULL;

CREATE INDEX idx_sprints_org_start ON sprints(organization_id, start_date);
CREATE INDEX idx_sprint_projects_project ON sprint_projects(project_id);
CREATE INDEX idx_cards_sprint ON cards(board_id, sprint_id);
CREATE INDEX idx_epics_sprint ON epics(sprint_id);
