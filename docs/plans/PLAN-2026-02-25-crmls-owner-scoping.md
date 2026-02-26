**Status: Completed — 2026-02-25**

# PLAN-2026-02-25-crmls-owner-scoping.md

## Goal
Add `owner_id` scoping to the CRMLS pipeline so that each real estate user only sees and can mutate their own imported properties. Admin (not acting-as) sees all data globally. Admin acting-as a real estate user sees only that user's data.

## Current State

### Problem
- `crmls_properties` has no `owner_id` column — it is a fully global table
- All real estate users share one property pool (currently not a problem with one RE user, but breaks isolation)
- Admin switching to nonprofit context still shows all CRMLS data
- Any authenticated `realestate` user can mutate (update owner name, mark not-found, bulk-delete) any other user's properties
- Import route uses `req.session.user.id` directly instead of `getEffectiveOwnerId(req)`, so admin acting-as attribution is wrong

### Files Involved
| File | Issue |
|---|---|
| `db/init.js` | `crmls_properties` missing `owner_id` column and index |
| `services/csv.js` | `importCrmlsProperties()` does not insert `owner_id` |
| `routes/realestate.js` | All queries unfiltered; import uses wrong user ID |
| `routes/api.js` | 4 mutation endpoints have no ownership check |

### Existing Pattern to Follow
`getEffectiveOwnerId(req)` in `middleware/auth.js`:
- Non-admin user → returns own `req.session.user.id`
- Admin acting-as user → returns `req.session.actingAsUserId`
- Admin not acting-as → returns `null`

Admin bypass pattern (from `rules/sqlite.md` and `rules/express.md`):
```js
const isAdmin = req.session.user.role === 'admin';
const effectiveOwnerId = getEffectiveOwnerId(req);
// admin not acting-as: see all; everyone else: filter by owner
const ownerWhere = (isAdmin && !effectiveOwnerId) ? '1=1' : 'owner_id = ?';
const ownerParams = (isAdmin && !effectiveOwnerId) ? [] : [effectiveOwnerId];
```

---

## Steps

### Step 1 — Schema: add `owner_id` to `crmls_properties` (`db/init.js`)

**1a.** Add column to the `CREATE TABLE IF NOT EXISTS crmls_properties` definition (after `csv_upload_id`):
```sql
owner_id INTEGER REFERENCES users(id),
```

**1b.** Add an `ALTER TABLE` migration guard below the existing table definitions (following the project's `IF NOT EXISTS` column-check pattern):
```js
// Migrate: add owner_id to crmls_properties if missing
const crmlsCols = db.prepare("PRAGMA table_info(crmls_properties)").all().map(c => c.name);
if (!crmlsCols.includes('owner_id')) {
  db.prepare('ALTER TABLE crmls_properties ADD COLUMN owner_id INTEGER REFERENCES users(id)').run();
}
```

**1c.** Add index after existing `crmls_properties`-related indexes:
```sql
CREATE INDEX IF NOT EXISTS idx_crmls_owner ON crmls_properties(owner_id);
```

**Note on existing rows:** Any pre-existing `crmls_properties` rows will have `owner_id = NULL` after migration. These will only be visible to admin in global view (no filter). They will not appear for any regular RE user. This is acceptable since there is currently one RE user and existing data can be cleaned up manually if needed.

---

### Step 2 — Service: insert `owner_id` in `importCrmlsProperties` (`services/csv.js`)

**2a.** Update the `insertStmt` prepared statement to include `owner_id` (line ~170):
```js
const insertStmt = db.prepare(
  `INSERT INTO crmls_properties (property_address, city, raw_city, state, zip, sale_date, sale_price, csv_upload_id, owner_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
```

**2b.** Add `ownerId` as the last argument in `insertStmt.run(...)` (line ~216):
```js
insertStmt.run(
  prop.property_address,
  prop.city || null,
  prop.raw_city || null,
  prop.state || null,
  prop.zip || null,
  prop.sale_date || null,
  prop.sale_price || null,
  uploadResult.lastInsertRowid,
  ownerId   // ← add this
);
```

---

### Step 3 — Import route: use `getEffectiveOwnerId` (`routes/realestate.js`)

**3a.** Add `getEffectiveOwnerId` to the auth require at the top (line 5):
```js
const { requireRole, setFlash, getEffectiveOwnerId } = require('../middleware/auth');
```

**3b.** In `POST /realestate/import/confirm` (line ~152), replace:
```js
const result = csv.importCrmlsProperties(crmlsImport.rows, mapping, req.session.user.id);
```
with:
```js
const result = csv.importCrmlsProperties(crmlsImport.rows, mapping, getEffectiveOwnerId(req));
```

---

### Step 4 — Dashboard stats: add owner filter (`routes/realestate.js`, lines ~38–48)

Replace the unfiltered stats query:
```js
const userId = req.session.user.id;
const isAdmin = req.session.user.role === 'admin';

const stats = db.prepare(`
  SELECT COUNT(*) as total, ...
  FROM crmls_properties
`).get();
```
with:
```js
const isAdmin = req.session.user.role === 'admin';
const effectiveOwnerId = getEffectiveOwnerId(req);
const statsWhere = (isAdmin && !effectiveOwnerId) ? '1=1' : 'owner_id = ?';
const statsParams = (isAdmin && !effectiveOwnerId) ? [] : [effectiveOwnerId];

const stats = db.prepare(`
  SELECT COUNT(*) as total,
    SUM(CASE WHEN realist_lookup_status = 'pending' THEN 1 ELSE 0 END) as pending,
    SUM(CASE WHEN realist_lookup_status = 'found' THEN 1 ELSE 0 END) as found,
    SUM(CASE WHEN realist_lookup_status = 'not_found' THEN 1 ELSE 0 END) as not_found
  FROM crmls_properties
  WHERE ${statsWhere}
`).get(...statsParams);
```

---

### Step 5 — Lookup page: add owner filter (`routes/realestate.js`, lines ~173–233)

**5a.** Build owner scope variables at the top of the handler:
```js
const isAdmin = req.session.user.role === 'admin';
const effectiveOwnerId = getEffectiveOwnerId(req);
const ownerWhere = (isAdmin && !effectiveOwnerId) ? '1=1' : 'owner_id = ?';
const ownerParams = (isAdmin && !effectiveOwnerId) ? [] : [effectiveOwnerId];
```

**5b.** Add to the counts query:
```sql
FROM crmls_properties WHERE ${ownerWhere}
```
params: `...ownerParams`

**5c.** Add to the paginated property list query — combine with existing status filter:
```js
let conditions = [ownerWhere];
const params = [...ownerParams];
if (['pending', 'found', 'not_found'].includes(statusFilter)) {
  conditions.push('realist_lookup_status = ?');
  params.push(statusFilter);
}
const where = conditions.join(' AND ');
```

**5d.** The unmapped cities count (admin-only badge) queries `crmls_properties` globally — this is intentional since city mappings are system-wide. Leave as-is.

---

### Step 6 — Finalize route: filter found properties by owner (`routes/realestate.js`, lines ~237–305)

Replace the unscoped `SELECT * FROM crmls_properties WHERE realist_lookup_status = 'found'` (line ~243) with an owner-scoped version:
```js
const isAdmin = req.session.user.role === 'admin';
const effectiveOwnerId = getEffectiveOwnerId(req);
const ownerWhere = (isAdmin && !effectiveOwnerId) ? '1=1' : 'owner_id = ?';
const ownerParams = (isAdmin && !effectiveOwnerId) ? [] : [effectiveOwnerId];

const found = db.prepare(
  `SELECT * FROM crmls_properties WHERE realist_lookup_status = 'found' AND realist_owner_name IS NOT NULL AND ${ownerWhere}`
).all(...ownerParams);
```

Also update `userId` used for contact insertion to use `effectiveOwnerId`:
```js
const userId = isAdmin ? (effectiveOwnerId || req.session.user.id) : req.session.user.id;
```

---

### Step 7 — API mutations: add ownership checks (`routes/api.js`)

**7a.** Add `getEffectiveOwnerId` to the auth import at the top of `routes/api.js`.

**7b.** `PUT /api/realist-lookup/:id` — after fetching the property, add:
```js
const isAdmin = req.session.user.role === 'admin';
const effectiveOwnerId = getEffectiveOwnerId(req);
if (!isAdmin && prop.owner_id !== effectiveOwnerId) {
  return res.status(403).json({ error: 'Not authorized.' });
}
```
Also scope the counts query response by the same owner filter.

**7c.** `POST /api/realist-lookup/:id/not-found` — same ownership check as 7b.

**7d.** `POST /api/realist-lookup/bulk-not-found` — before updating, filter IDs to only those owned by the effective user:
```js
const isAdmin = req.session.user.role === 'admin';
const effectiveOwnerId = getEffectiveOwnerId(req);
// Validate all submitted IDs belong to this user (skip check for global admin)
if (!isAdmin || effectiveOwnerId) {
  for (const id of ids) {
    const prop = db.prepare('SELECT owner_id FROM crmls_properties WHERE id = ?').get(parseInt(id));
    if (!prop || prop.owner_id !== effectiveOwnerId) {
      return res.status(403).json({ error: 'Not authorized to modify one or more properties.' });
    }
  }
}
```

**7e.** `POST /api/realist-lookup/bulk-delete` — same ownership validation as 7d.

**7f.** For each counts query returned in API responses (lines ~450–457, ~482–489, ~516–522, ~547–553), scope them to the effective owner using the same `ownerWhere`/`ownerParams` pattern so the updated counts reflect only the user's data.

---

## Testing

### Manual verification
1. Log in as real estate user → import a CRMLS CSV → verify properties appear on lookup page
2. Log in as second real estate user (create one if needed) → verify lookup page shows empty / only their own data
3. Log in as admin (no act-as) → verify all properties from all users are visible on `/realestate/lookup`
4. Log in as admin, act-as the real estate user → verify only that user's properties are shown
5. Log in as nonprofit user → navigate directly to `/realestate` → should be blocked by `requireRole` (existing behavior, unchanged)
6. Attempt API mutation as wrong user: `PUT /api/realist-lookup/<other-user-property-id>` → expect 403

### Database check
After import, confirm the row has the correct `owner_id`:
```sql
SELECT id, property_address, owner_id FROM crmls_properties ORDER BY id DESC LIMIT 5;
```

### Regression check
- Existing data with `owner_id = NULL` should still appear in admin global view
- vCard import, phone matching, contacts, campaigns — all unrelated to CRMLS, should be unaffected
- City mappings (admin-only) remain global — no change needed

---

## Risks

| Risk | Mitigation |
|---|---|
| Existing `crmls_properties` rows have `owner_id = NULL` — they disappear for RE users | Acceptable; admin can see them. Document for operator to re-assign or reimport if needed. |
| Admin acting-as a RE user imports properties — attributed to acting-as user, not admin | Intended behavior — `getEffectiveOwnerId` is designed for this |
| Admin not acting-as triggers `getEffectiveOwnerId` returning `null` — passed to `importCrmlsProperties` as `null` | Import should be blocked in UI when admin has no acting-as context; add a guard in the import confirm route: if `effectiveOwnerId === null`, flash error and redirect |
| Bulk API endpoints do a per-row ownership check (N queries) | Acceptable for current data volumes; can optimize with a single `WHERE id IN (...) AND owner_id != ?` check if needed |
| City mapping bulk-update touches all matching `crmls_properties` rows globally | Intentional — city mappings are system-wide canonical data, not per-user |
