-- Sprint archive + rename legacy status planned → inactive
ALTER TABLE sprints ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
UPDATE sprints SET status = 'inactive' WHERE status = 'planned';
