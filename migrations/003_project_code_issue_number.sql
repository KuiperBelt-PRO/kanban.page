-- Project issue codes (2–4 uppercase) and per-project incremental card numbers.

ALTER TABLE projects ADD COLUMN code TEXT;
ALTER TABLE cards ADD COLUMN issue_number INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_org_code ON projects(organization_id, code);
