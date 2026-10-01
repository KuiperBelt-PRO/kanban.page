-- Persisted colors for org tags (projects.color exists from 006)

ALTER TABLE tags ADD COLUMN color TEXT;
