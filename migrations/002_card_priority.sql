-- Prioridad de tarjeta (0=sin prioridad, 1=baja, 2=media, 3=alta, 4=crítica)
ALTER TABLE cards ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
