-- epic_id may point to epics row or a card with issue_type epic (Jira model)
PRAGMA foreign_keys=OFF;

CREATE TABLE cards_epic_link (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id),
  board_id        TEXT NOT NULL REFERENCES boards(id),
  epic_id         TEXT,
  stage_id        TEXT NOT NULL REFERENCES board_stages(id),
  position        INTEGER NOT NULL,
  title           TEXT NOT NULL,
  notes           TEXT,
  session_ref     TEXT,
  flagged         INTEGER NOT NULL DEFAULT 0,
  archived        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  priority        INTEGER NOT NULL DEFAULT 0,
  issue_number    INTEGER,
  estimated_minutes INTEGER,
  schedule_start_date TEXT,
  schedule_end_date TEXT,
  sprint_id       TEXT REFERENCES sprints(id) ON DELETE SET NULL,
  issue_type      TEXT NOT NULL DEFAULT 'task',
  parent_id       TEXT
);

INSERT INTO cards_epic_link SELECT
  id, project_id, board_id, epic_id, stage_id, position, title, notes,
  session_ref, flagged, archived, created_at, updated_at,
  priority, issue_number, estimated_minutes, schedule_start_date, schedule_end_date,
  sprint_id, issue_type, parent_id
FROM cards;

DROP TABLE cards;
ALTER TABLE cards_epic_link RENAME TO cards;

CREATE INDEX idx_cards_board_stage ON cards(board_id, stage_id);
CREATE INDEX idx_cards_project ON cards(project_id);
CREATE INDEX idx_cards_epic ON cards(epic_id);
CREATE INDEX idx_cards_sprint ON cards(board_id, sprint_id);
CREATE INDEX idx_cards_issue_type ON cards(issue_type);
CREATE INDEX idx_cards_parent ON cards(parent_id);

PRAGMA foreign_keys=ON;
