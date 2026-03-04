---
name: db-migrate
description: Add columns, indexes, or tables to SendReed's SQLite database safely. Use when modifying database schema.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Edit, Bash
argument-hint: "[description of schema change needed]"
---

# SQLite Schema Migration

## Context
- Current schema: !`head -200 db/init.js`
- Current branch: !`git branch --show-current`

## SendReed DB Conventions (from .claude/rules/sqlite.md)
- Engine: better-sqlite3 (synchronous API)
- WAL mode + foreign keys enabled on init
- Tables: plural snake_case (`contacts`, `campaign_recipients`)
- Columns: snake_case (`first_name`, `owner_id`)
- Foreign keys: `{table_singular}_id` pattern
- IDs: `INTEGER PRIMARY KEY AUTOINCREMENT`
- Timestamps: `created_at`, `updated_at` with `DATETIME DEFAULT CURRENT_TIMESTAMP`
- Every user-facing table MUST have `owner_id INTEGER REFERENCES users(id)`
- Index every `owner_id` column: `idx_{table}_{column}`

## Process
1. Understand the schema change needed: $ARGUMENTS
2. Read `db/init.js` to understand current schema
3. For new columns: use `ALTER TABLE` guarded by column existence check:
   ```js
   const cols = db.pragma('table_info(table_name)').map(c => c.name);
   if (!cols.includes('new_column')) {
     db.exec('ALTER TABLE table_name ADD COLUMN new_column TYPE DEFAULT value');
   }
   ```
4. For new tables: add `CREATE TABLE IF NOT EXISTS` block in init.js
5. For new indexes: add `CREATE INDEX IF NOT EXISTS idx_table_column ON table(column)`
6. If adding a user-facing table, MUST include `owner_id` + index
7. Run `node -e "require('./db/init')"` to verify schema applies without error
8. Commit: `feat(db): add {description}`

## Rules
- NEVER drop columns or tables without explicit user approval
- NEVER modify existing column types (SQLite doesn't support ALTER COLUMN)
- Always use IF NOT EXISTS / IF NOT INCLUDES guards for idempotency
- Add both the schema change AND any queries that use the new columns
