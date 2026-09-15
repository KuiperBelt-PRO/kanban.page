# Migraciones SQLite (Kuiper Kanban)

Aplicar con:

```bash
node cli/kanban.js db migrate
```

Cada fichero `NNN_*.sql` se ejecuta una sola vez y se registra en `schema_migrations`.

| Versión | Fichero | Descripción |
| --- | --- | --- |
| 1 | `001_initial.sql` | Esquema base (org, proyecto, tablero, épica, tarjeta) |
| 2 | `002_card_priority.sql` | Columna `cards.priority` (0–4) |
| 3 | `003_project_code_issue_number.sql` | Código de proyecto (`code`) e ID de issue incremental (`PROJ-1`) |
