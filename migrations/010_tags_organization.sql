-- Tags scoped to organization (transversal across boards/projects)

CREATE TABLE tags_org (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  UNIQUE (organization_id, name COLLATE NOCASE)
);

INSERT INTO tags_org (id, organization_id, name, created_at)
SELECT t.id, b.organization_id, t.name, t.created_at
FROM tags t
JOIN boards b ON b.id = t.board_id;

DROP TABLE tags;
ALTER TABLE tags_org RENAME TO tags;

CREATE INDEX idx_tags_organization ON tags(organization_id);
