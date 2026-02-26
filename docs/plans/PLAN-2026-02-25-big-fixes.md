**Status: Completed — 2026-02-25**

# PLAN-2026-02-25-big-fixes.md

## Goal

Address the 5 major remaining items from FIXES.md Second Set:

1. **Admin-as-supervisor rework** — Admin is supervisory only, cannot own contacts/templates/campaigns
2. **Client type separation** — Total separation of nonprofit vs realestate field sets
3. **Field management GUI** — Admin toggles which DB columns are visible per role
4. **Anniversary digest config** — Per-user enable/disable, configurable lookahead days, admin sends via Protonmail
5. **Template editing + scheduled sends** — Full edit on campaigns page, optional date for auto-send

These are deeply interconnected so they must be implemented in dependency order.

---

## Phase 1 — Admin-as-Supervisor Rework

**The core change**: Admin never owns data. Every admin action on contacts, templates, campaigns, or properties must target a specific non-admin user. A persistent "Acting as" banner lets admin select which user they're operating on behalf of.

### Step 1.1 — Session-based "acting as" user context

**Files:** `server.js` (middleware), `routes/admin.js`

- Add middleware that sets `res.locals.actingUser`:
  - For non-admin: always `req.session.user` (themselves)
  - For admin: `req.session.actingAsUserId` → look up that user, or `null` if not set
- Add `POST /admin/act-as` endpoint to set `req.session.actingAsUserId` (must be a non-admin user ID)
- Add `POST /admin/act-as/clear` to unset it
- When `actingAsUserId` is set, `res.locals.actingUser` = that user's `{id, email, name, role}`
- When not set, `res.locals.actingUser = null`

### Step 1.2 — Persistent "Acting as" banner in nav

**Files:** `views/partials/nav.ejs`, `public/css/style.css`

- Below the navbar, for admin only, render a banner:
  ```
  [Acting as: [dropdown of non-admin users] ] or [No user selected — select a user to manage their data]
  ```
- Dropdown populated from `res.locals.allUsers` (fetched in middleware for admin)
- Selecting a user POSTs to `/admin/act-as` and reloads
- Banner uses a distinct background color (e.g., amber/warning)

### Step 1.3 — Guard all create/mutate endpoints for admin

**Files:** `routes/api.js`, `routes/contacts.js`, `routes/campaign.js`

- Introduce helper: `getEffectiveOwnerId(req)`:
  - If not admin: return `req.session.user.id`
  - If admin and `req.session.actingAsUserId` set: return that ID
  - If admin and NOT set: return `null` (block the action)
- On all POST (create) endpoints: use `getEffectiveOwnerId()` instead of `req.session.user.id`
  - If `null`, return 400 error: "Admin must select a user to act on behalf of"
- On PUT/DELETE: admin can still edit/delete any record (no change needed)
- **Campaign creation** (`POST /campaign/create`): fetch contacts using `actingUser.id` not admin's ID

### Step 1.4 — Admin data views use acting-as context

**Files:** `routes/contacts.js`, `routes/campaign.js`, `routes/realestate.js`

- When admin has `actingAsUserId` set, all list/view queries scope to that user (not "see all")
- When not set, show a prompt: "Select a user from the banner above to view their data"
- The existing `?user_id=` query param filter on contacts/campaigns should be replaced by the session-based acting-as system (remove the per-page dropdown that was added in First Set fixes)

### Step 1.5 — Template variables follow acting-as user's role

**Files:** `routes/campaign.js`, `services/template.js`

- In campaign wizard, variable set is determined by `actingUser.role` not admin's role
- Template list in campaign shows only `actingUser`'s templates

---

## Phase 2 — Client Type Separation

**The core change**: Contacts, templates, and field visibility are strictly separated by the owning user's role. Nonprofit users see nonprofit fields, realestate users see realestate fields.

### Step 2.1 — Define role-specific field sets

**File:** New file `config/field-config.js`

```js
var ROLE_FIELDS = {
  nonprofit: {
    contacts: ['first_name', 'last_name', 'email', 'phone', 'organization', 'title', 'district', 'city', 'state', 'zip', 'notes'],
    label_map: { first_name: 'First Name', last_name: 'Last Name', title: 'Title', district: 'District', organization: 'Organization', ... }
  },
  realestate: {
    contacts: ['first_name', 'last_name', 'email', 'phone', 'property_address', 'purchase_date', 'purchase_price', 'city', 'state', 'zip', 'notes'],
    label_map: { property_address: 'Property Address', purchase_date: 'Close Date', purchase_price: 'Close Price', ... }
  }
};
module.exports = { ROLE_FIELDS };
```

This is the **default** config. Phase 3 (Field Management GUI) will allow admin to override these defaults per-role in the DB.

### Step 2.2 — Contacts list view uses role-specific columns

**Files:** `routes/contacts.js`, `views/contacts/list.ejs`

- Route passes `visibleFields` based on the viewing user's role (or `actingUser.role` for admin)
- EJS template dynamically renders `<th>` and `<td>` columns from `visibleFields` array
- Inline editing only offered for fields in the visible set

### Step 2.3 — CSV import respects role-specific fields

**Files:** `routes/contacts.js`, `views/contacts/import-mapping.ejs`

- Column mapping step only shows fields valid for the user's role
- Reject mappings to fields not in the role's field set

### Step 2.4 — Contact creation form uses role-specific fields

**Files:** `views/contacts/list.ejs` (add-contact modal), `routes/api.js`

- "Add Contact" form dynamically shows only the role's fields
- API endpoint validates that submitted fields belong to the user's role field set

---

## Phase 3 — Field Management GUI

**The core change**: Admin can toggle which of the existing DB columns appear for each role, overriding the defaults from Phase 2.

### Step 3.1 — DB table for field visibility overrides

**File:** `db/init.js`

```sql
CREATE TABLE IF NOT EXISTS field_visibility (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK (role IN ('nonprofit', 'realestate')),
  field_name TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  UNIQUE(role, field_name)
);
```

Seed with defaults from `config/field-config.js` if table is empty.

### Step 3.2 — Admin field management page

**Files:** New `views/admin/field-management.ejs`, `routes/admin.js`

- Route: `GET /admin/fields` — renders the GUI
- Shows two columns (nonprofit | realestate) with all contact fields
- Each field has a toggle switch (visible/hidden) and drag handles for reorder
- Changes auto-save via PUT to `/api/field-visibility`

### Step 3.3 — API endpoints for field visibility

**File:** `routes/api.js`

- `GET /api/field-visibility` — returns current visibility config
- `PUT /api/field-visibility` — updates visibility for a role+field
- `PUT /api/field-visibility/reorder` — updates display_order

### Step 3.4 — Integrate field visibility into contacts/templates

**File:** `config/field-config.js`

- `getVisibleFields(role)` function: checks `field_visibility` table, falls back to defaults
- Replace hardcoded field lists in Phase 2 with calls to this function

---

## Phase 4 — Anniversary Digest Configuration

**The core change**: Admin configures per-user digest settings. Digests are sent FROM admin's Protonmail TO each RE user's login email.

### Step 4.1 — Add Protonmail to providers

**File:** `config/providers.json`

```json
"protonmail": {
  "label": "ProtonMail",
  "host": "smtp.protonmail.ch",
  "port": 587,
  "secure": false,
  "dailyLimit": 150,
  "defaultDelay": 2000
}
```

Note: ProtonMail SMTP requires ProtonMail Bridge or a paid plan with SMTP access.

### Step 4.2 — DB table for digest settings

**File:** `db/init.js`

```sql
CREATE TABLE IF NOT EXISTS digest_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  enabled INTEGER NOT NULL DEFAULT 1,
  lookahead_days INTEGER NOT NULL DEFAULT 7,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);
```

### Step 4.3 — Digest settings UI on anniversaries page

**Files:** `views/realestate/anniversaries.ejs`, `routes/realestate.js`, `routes/api.js`

- Admin-only section at the top of anniversaries page: "Digest Settings"
- For each realestate user, show:
  - Toggle: Enable/Disable digest
  - Number input: Lookahead days (1-30, default 7)
- Auto-save on change via `PUT /api/digest-settings/:userId`

### Step 4.4 — Rework cron digest to use admin's SMTP + per-user settings

**File:** `services/cron.js`

- `sendMorningDigest()` changes:
  - Fetch admin user with SMTP configured
  - For each realestate user: check `digest_settings` (default: enabled, 7 days)
  - If disabled for that user, skip
  - Use the user's `lookahead_days` setting for the anniversary query window
  - Send FROM admin's `smtp_email` TO the RE user's `email` (login email, from `users` table)
  - Create transport using admin's SMTP config, not the RE user's

---

## Phase 5 — Template Editing + Scheduled Sends

### Step 5.1 — Full template CRUD on campaigns page

**Files:** `views/campaign/history.ejs`, `public/js/campaign-history.js`

- The history page already shows a template list. Add:
  - "Edit" button on each template → opens an edit modal/inline form
  - Full view of template body (expandable)
  - "Delete" button with confirmation
- Edit modal has: name, subject, body, variable toolbar

### Step 5.2 — Add scheduled_date column to templates

**File:** `db/init.js`

```sql
-- ALTER TABLE migration
ALTER TABLE templates ADD COLUMN scheduled_date DATE;
```

- Optional field: if set, the template is auto-sent on that date
- Add `scheduled_date` to the edit form (date picker input)

### Step 5.3 — Cron job for scheduled template sends

**File:** `services/cron.js`

- New function `processScheduledTemplates()`:
  - Query templates where `scheduled_date = today` and no campaign exists for them today
  - For each: create a campaign targeting all of the owner's contacts, enter `sending` state
  - Use the existing `sendCampaign()` flow
- Add to the daily 7AM cron schedule

### Step 5.4 — UI indicators for scheduled templates

**Files:** `views/campaign/history.ejs`, `views/campaign/create.ejs`

- Templates with a scheduled_date show a calendar icon and the date
- In the campaign wizard, warn if selecting a scheduled template: "This template is set to auto-send on [date]"

---

## Implementation Order

```
Phase 1 (Admin-as-supervisor)  ←  Must come first, everything depends on it
  ↓
Phase 2 (Client type separation)  ←  Depends on Phase 1 for acting-as role context
  ↓
Phase 3 (Field management GUI)  ←  Extends Phase 2's field config
  ↓
Phase 4 (Anniversary digest config)  ←  Independent but builds on admin SMTP
  ↓
Phase 5 (Template editing + scheduled sends)  ←  Independent
```

Phases 4 and 5 are independent of each other and could be done in either order.

---

## Testing Strategy

- After each phase: `npm test` to verify no regressions
- Manual testing of admin flows (acting-as, field visibility) requires running the app
- Unit-testable additions:
  - `config/field-config.js` → `getVisibleFields()` (pure function with DB mock)
  - `services/cron.js` → updated digest logic

---

## Risks

| Risk | Mitigation |
|---|---|
| Admin acting-as changes touch many routes | Use a shared helper (`getEffectiveOwnerId`) to minimize spread |
| Existing admin-created data has admin's owner_id | Provide a one-time migration note; admin can reassign via Users page |
| ProtonMail SMTP requires Bridge or paid plan | Document this requirement; provider config is just connection details |
| Scheduled template sends could double-send | Deduplicate by checking if a campaign already exists for that template+date |
| Field visibility changes could hide data | Hidden fields still exist in DB; toggling visibility back shows the data again |

---

## Estimated Commits

1. `feat: add admin acting-as user context with persistent banner`
2. `feat: guard all create endpoints to use acting-as user ownership`
3. `feat: scope admin data views to acting-as user context`
4. `feat: add role-specific field configuration`
5. `feat: dynamic contacts list columns based on role field set`
6. `feat: add field visibility admin GUI with toggle and reorder`
7. `feat: add Protonmail provider and digest settings table`
8. `feat: admin-configurable anniversary digest with per-user settings`
9. `feat: full template CRUD on campaigns page`
10. `feat: add scheduled template sends with cron integration`
