-- Kuiper Kanban — schema v1
-- schema_migrations la crea server/db/migrate.js antes de aplicar ficheros.

CREATE TABLE organizations (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE projects (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  slug            TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (organization_id, slug)
);

CREATE TABLE project_github_repos (
  project_id    TEXT NOT NULL REFERENCES projects(id),
  owner         TEXT NOT NULL,
  repo          TEXT NOT NULL,
  PRIMARY KEY (project_id, owner, repo)
);

CREATE TABLE boards (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  slug            TEXT NOT NULL,
  name            TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (organization_id, slug)
);

CREATE TABLE board_projects (
  board_id    TEXT NOT NULL REFERENCES boards(id),
  project_id  TEXT NOT NULL REFERENCES projects(id),
  PRIMARY KEY (board_id, project_id)
);

CREATE TABLE board_stages (
  id          TEXT PRIMARY KEY,
  board_id    TEXT NOT NULL REFERENCES boards(id),
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL,
  UNIQUE (board_id, position),
  UNIQUE (board_id, name)
);

CREATE TABLE board_versions (
  board_id  TEXT PRIMARY KEY REFERENCES boards(id),
  version   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE epics (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id),
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'planned',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE cards (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id),
  board_id        TEXT NOT NULL REFERENCES boards(id),
  epic_id         TEXT REFERENCES epics(id),
  stage_id        TEXT NOT NULL REFERENCES board_stages(id),
  position        INTEGER NOT NULL,
  title           TEXT NOT NULL,
  notes           TEXT,
  session_ref     TEXT,
  flagged         INTEGER NOT NULL DEFAULT 0,
  archived        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE card_events (
  id          TEXT PRIMARY KEY,
  card_id     TEXT NOT NULL REFERENCES cards(id),
  board_id    TEXT,
  event_type  TEXT NOT NULL,
  payload     TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX idx_cards_board_stage ON cards(board_id, stage_id);
CREATE INDEX idx_cards_project ON cards(project_id);
CREATE INDEX idx_cards_epic ON cards(epic_id);
CREATE INDEX idx_card_events_card ON card_events(card_id, created_at);
