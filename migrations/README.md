# Migraciones SQLite (Kuiper Kanban)

Aplicar con:

```bash
node cli/kanban.js db migrate
```

Cada fichero `NNN_*.sql` se ejecuta una sola vez y se registra en `schema_migrations`.
