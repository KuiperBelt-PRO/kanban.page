-- Fechas de planificación (calendario / Gantt), independientes de estimación y time log

ALTER TABLE cards ADD COLUMN schedule_start_date TEXT;
ALTER TABLE cards ADD COLUMN schedule_end_date TEXT;

CREATE INDEX IF NOT EXISTS idx_cards_schedule_start ON cards(board_id, schedule_start_date)
  WHERE schedule_start_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cards_schedule_end ON cards(board_id, schedule_end_date)
  WHERE schedule_end_date IS NOT NULL;
