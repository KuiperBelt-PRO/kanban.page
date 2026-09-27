-- Soft-archive for org / project / board (hidden from navigation by default)
ALTER TABLE organizations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE boards ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
