-- Código corto de sprint (único por org), distinto del slug URL interno
ALTER TABLE sprints ADD COLUMN code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sprints_org_code ON sprints(organization_id, code);
