-- Tipos de issue (modelo Jira) y jerarquía sub-task
ALTER TABLE cards ADD COLUMN issue_type TEXT NOT NULL DEFAULT 'task';
ALTER TABLE cards ADD COLUMN parent_id TEXT REFERENCES cards(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cards_issue_type ON cards(issue_type);
CREATE INDEX IF NOT EXISTS idx_cards_parent ON cards(parent_id);
