# SQLite Database Rules
> See also: `security.md` (SQL injection prevention), `services.md` (how services call the DB), `express.md` (pagination queries)

## Engine & Configuration
- Use `better-sqlite3` (synchronous API) — never use async sqlite3 drivers
- Enable WAL mode on init: `db.pragma('journal_mode = WAL')`
- Enable foreign keys on init: `db.pragma('foreign_keys = ON')`
- Single shared instance via `getDb()` from `db/init.js` — never create new connections

## Naming Conventions
- **Tables**: plural snake_case nouns (`contacts`, `campaign_recipients`, `crmls_properties`)
- **Columns**: snake_case (`first_name`, `owner_id`, `smtp_password_encrypted`)
- **Foreign keys**: `{referenced_table_singular}_id` (`owner_id`, `campaign_id`, `contact_id`)
- **Indexes**: `idx_{table}_{column(s)}` (`idx_contacts_owner`, `idx_anniversary_status`)
- **Timestamps**: `created_at`, `updated_at` with `DATETIME DEFAULT CURRENT_TIMESTAMP`

## Data Types
- IDs: `INTEGER PRIMARY KEY AUTOINCREMENT`
- Strings: `TEXT` with optional `CHECK` constraints for enums
- Money: `REAL` (e.g., `purchase_price`)
- Dates: `DATE` for date-only, `DATETIME` for timestamps
- Booleans: `INTEGER` (0/1)

## Query Patterns
- **Always** use prepared statements with `?` placeholders — no string interpolation
- `.get()` for single row, `.all()` for multiple rows, `.run()` for mutations
- Wrap bulk inserts/updates in `db.transaction()`:
  ```js
  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      stmt.run(...values);
    }
  });
  insertMany(rows);
  ```

## Ownership & Multi-Tenancy
- Every user-facing table must have `owner_id INTEGER REFERENCES users(id)`
- **All** queries must filter by `owner_id` unless the user is admin
- Admin bypass pattern:
  ```js
  const where = isAdmin ? '1=1' : 'owner_id = ?';
  const params = isAdmin ? [] : [userId];
  ```

## Pagination
- Standard page size: 25 rows
- Use `LIMIT ? OFFSET ?` with computed offset: `(page - 1) * perPage`
- Always query total count separately for pagination controls

## Indexing
- Index every `owner_id` column
- Index columns used in WHERE/JOIN filters
- Use composite indexes for multi-column lookups (e.g., `(status, anniversary_date)`)

## Schema Changes
- All table creation lives in `db/init.js` with `CREATE TABLE IF NOT EXISTS`
- Add new columns with `ALTER TABLE` guarded by a check for column existence
- Never drop columns or tables in production without a migration plan
