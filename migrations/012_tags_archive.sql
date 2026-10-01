-- Soft-archive for organization tags (hidden from pickers by default)

ALTER TABLE tags ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
