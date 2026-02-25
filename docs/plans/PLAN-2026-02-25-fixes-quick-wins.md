# PLAN-2026-02-25-fixes-quick-wins.md

## Goal

Address the 6 quick-win items from the Second Set of Fixes in FIXES.md. The larger
architectural rework (admin-as-supervisor, client type separation, field management GUI,
anniversary digest settings, template editing) will be planned separately.

---

## Items Covered

| # | Fix | Complexity |
|---|---|---|
| 1 | Anniversary preview on Real Estate dashboard | Small |
| 2 | Copy button: normalize spacing, append city + ", CA" | Small |
| 3 | Rename "City / State / Zip" column to just "City" | Trivial |
| 4 | Unified button color system (orange=upload, gray-blue=nav, blue=active) | Small |
| 5 | RE "Import CSV" quick action → "Manage CRMLS Data" linking to /realestate | Trivial |
| 6 | Contacts sort direction toggle (A-Z / Z-A) | Small |

---

## Steps

### Step 1 — Anniversary preview on Real Estate dashboard

**Files:** `routes/realestate.js`, `views/realestate/dashboard.ejs`

In the GET `/realestate/` handler, add a query for upcoming anniversaries (next 7 days)
similar to the anniversaries page logic:

```js
// In routes/realestate.js GET '/'
var todayStr = new Date().toISOString().slice(0, 10);
var futureDate = new Date();
futureDate.setDate(futureDate.getDate() + 7);
var futureStr = futureDate.toISOString().slice(0, 10);

var ownerFilter = isAdmin ? '' : 'AND c.owner_id = ?';
var ownerParams = isAdmin ? [] : [userId];

var upcomingAnniversaries = db.prepare(`
  SELECT al.*, c.first_name, c.last_name, c.property_address, c.id as cid
  FROM anniversary_log al
  JOIN contacts c ON al.contact_id = c.id
  WHERE al.anniversary_date >= ? AND al.anniversary_date <= ?
    AND al.status = 'pending' ${ownerFilter}
  ORDER BY al.anniversary_date
  LIMIT 5
`).all(todayStr, futureStr, ...ownerParams);
```

In `dashboard.ejs`, add a compact "Upcoming Anniversaries" section below stats:
- Show up to 5 entries: name, years, property address, date
- "View All" link to `/realestate/anniversaries`
- If none: "No upcoming anniversaries this week."

---

### Step 2 — Fix copy button to include city + state with normalized spacing

**Files:** `views/realestate/realist-lookup.ejs`, `public/js/realist.js`

**2a.** In the EJS template, the copy button and the `<tr>` both carry `data-address`.
Add `data-city` and `data-state` attributes to the `<tr>`:

```ejs
<tr data-property-id="<%= p.id %>" data-status="<%= p.realist_lookup_status %>"
    data-address="<%= p.property_address %>" data-city="<%= p.city || '' %>"
    data-state="<%= p.state || 'CA' %>">
```

**2b.** In `realist.js`, update the copy logic to:
1. Normalize whitespace (collapse multiple spaces to one)
2. Append `, City, State`

```js
var address = btn.dataset.address;
var row = btn.closest('tr');
var city = row.dataset.city || '';
var state = row.dataset.state || 'CA';
// Normalize spacing
address = address.replace(/\s+/g, ' ').trim();
// Build full address string
var fullAddress = address;
if (city) fullAddress += ', ' + city;
fullAddress += ', ' + state;
navigator.clipboard.writeText(fullAddress)...
```

**2c.** Also update the Tab-key copy behavior (which copies the next row's address)
to use the same normalization + city/state append logic.

---

### Step 3 — Rename "City / State / Zip" column to just "City"

**File:** `views/realestate/realist-lookup.ejs`

Change the `<th>` text from `City / State / Zip` to `City`. Keep the admin City Mappings
button inline.

The cell data already shows `[p.city, p.state, p.zip].filter(Boolean).join(', ')`. Since
the user says it's "just the City," also simplify the cell to show only `p.city`:

```ejs
<td><%= p.city || '' %></td>
```

---

### Step 4 — Unified button color system

**Files:** `public/css/style.css`, `views/realestate/dashboard.ejs`

Define a new `.btn-upload` class for upload/import actions (orange):
```css
.btn-upload {
  background: #ea580c; color: #fff; border: none;
}
.btn-upload:hover {
  background: #c2410c; color: #fff; text-decoration: none;
}
```

Apply across the app:
- **Real Estate dashboard**: "Import CRMLS CSV" → `btn-upload` (was `btn-primary`)
- **Real Estate dashboard**: "Import Contacts" → `btn-upload` (was `btn-secondary`)
- Navigation buttons (Realist Lookup, Phone Matching, Anniversaries) stay `btn-secondary`
- Active filter pills (All/Pending/Found/Not Found) stay `btn-primary` when active

Audit other views for inconsistent button colors:
- `views/contacts/list.ejs` — import buttons if any
- `views/campaign/history.ejs` — check for upload-style buttons

---

### Step 5 — RE "Import CSV" quick action → "Manage CRMLS Data"

**File:** `views/realestate/dashboard.ejs`

Change the first quick action button:
- **Text**: "Import CRMLS CSV" → "Manage CRMLS Data"
- **Link**: `/realestate/import` → `/realestate` (or keep as `/realestate/import` if
  the user means the import sub-flow; based on the fix text "takes you to the main
  Real Estate Page" → link to `/realestate`)

Wait — the dashboard IS the main Real Estate page (`/realestate`). A button on the
dashboard linking to itself doesn't make sense. The fix says "for the real estate user"
so this likely applies to the **general dashboard** or another page where a quick action
exists for RE users. Need to check if the general dashboard has a quick action for
real estate users.

If the fix only applies to the RE dashboard: remove the "Import CRMLS CSV" quick action
button entirely (since you're already on the page), or change it to something more useful.
Based on the fix wording, change it to link to `/realestate/lookup` (the Realist Lookup
page where CRMLS data is managed).

**Resolution**: Replace "Import CRMLS CSV" (`/realestate/import`) with "Manage CRMLS Data"
linking to `/realestate/lookup` where the user manages their imported CRMLS properties.

---

### Step 6 — Contacts sort direction toggle (A-Z / Z-A)

**Files:** `routes/contacts.js`, `views/contacts/list.ejs`

**6a.** Add a `dir` query parameter to the contacts route:
```js
var dir = req.query.dir === 'desc' ? 'DESC' : 'ASC';
// Apply to ORDER BY:
var orderBy = SORT_OPTIONS[sort] || SORT_OPTIONS['name'];
// Replace implicit ASC with the chosen direction on each column:
orderBy = orderBy.split(', ').map(col => col + ' ' + dir).join(', ');
```

**6b.** In `list.ejs`, add a sort direction toggle next to the sort dropdown. Can be a
simple button or a second `<select>`:

```ejs
<select name="dir" onchange="this.form.submit()">
  <option value="asc" <%= dir === 'asc' ? 'selected' : '' %>>A → Z</option>
  <option value="desc" <%= dir === 'desc' ? 'selected' : '' %>>Z → A</option>
</select>
```

Pass `dir` to the template from the route. Ensure pagination links carry the `dir` param.

---

## Testing

| # | Test | Expected |
|---|---|---|
| 1 | Visit /realestate | Anniversary preview shows (if anniversaries exist) with link to full page |
| 2 | Click Copy on realist lookup | Clipboard contains normalized address + ", City, CA" |
| 3 | Tab from owner name field | Next address copied with city+state appended |
| 4 | View realist lookup table header | Column says "City" not "City / State / Zip" |
| 5 | View realist lookup table cells | City column shows only city name |
| 6 | Import buttons are orange | "Import CRMLS CSV" / "Import Contacts" use orange color |
| 7 | Navigation buttons are gray-blue | "Realist Lookup", "Anniversaries" etc stay gray-blue |
| 8 | RE dashboard first button | Says "Manage CRMLS Data", links to /realestate/lookup |
| 9 | Contacts page sort direction | Can toggle A-Z / Z-A, results reverse correctly |
| 10 | Pagination with sort direction | Page 2 with desc sort preserves direction |
| 11 | Syntax check | `node -c` passes on all modified JS files |

---

## Risks

| Risk | Mitigation |
|---|---|
| Anniversary preview query on dashboard could be slow with large datasets | LIMIT 5 + existing indexes on anniversary_log |
| Copy button change breaks Tab-key workflow | Update both copy paths (click + Tab) consistently |
| Sort direction applied to composite sort keys | Apply direction to each column in the sort expression |
| Button color audit may miss views | Grep for `btn-primary` in all EJS files to find outliers |
