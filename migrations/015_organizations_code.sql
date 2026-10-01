-- Código corto de organización (único global), distinto del slug URL
ALTER TABLE organizations ADD COLUMN code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_code ON organizations(code);
