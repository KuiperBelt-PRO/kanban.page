-- Tags, enlaces, tiempo, comentarios y estimación por tarjeta

ALTER TABLE cards ADD COLUMN estimated_minutes INTEGER;

CREATE TABLE tags (
  id            TEXT PRIMARY KEY,
  board_id      TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  UNIQUE (board_id, name COLLATE NOCASE)
);

CREATE TABLE card_tags (
  card_id       TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  tag_id        TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, tag_id)
);

CREATE TABLE card_links (
  id            TEXT PRIMARY KEY,
  from_card_id  TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  to_card_id    TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  link_type     TEXT NOT NULL CHECK (link_type IN ('blocks', 'relates')),
  created_at    TEXT NOT NULL,
  UNIQUE (from_card_id, to_card_id, link_type)
);

CREATE TABLE time_entries (
  id                TEXT PRIMARY KEY,
  card_id           TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  started_at        TEXT,
  ended_at          TEXT,
  duration_minutes  INTEGER NOT NULL DEFAULT 0,
  label             TEXT,
  source            TEXT NOT NULL CHECK (source IN ('manual', 'timer')),
  created_at        TEXT NOT NULL
);

CREATE TABLE card_comments (
  id            TEXT PRIMARY KEY,
  card_id       TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE INDEX idx_tags_board ON tags(board_id);
CREATE INDEX idx_card_tags_card ON card_tags(card_id);
CREATE INDEX idx_card_links_from ON card_links(from_card_id);
CREATE INDEX idx_card_links_to ON card_links(to_card_id);
CREATE INDEX idx_time_entries_card ON time_entries(card_id);
CREATE INDEX idx_card_comments_card ON card_comments(card_id);
