-- Código corto de tablero (único por org), distinto del slug URL
ALTER TABLE boards ADD COLUMN code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_boards_org_code ON boards(organization_id, code);
