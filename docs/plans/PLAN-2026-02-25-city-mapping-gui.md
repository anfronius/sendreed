**Status: Completed — 2026-02-25**

# PLAN-2026-02-25-city-mapping-gui.md

## Goal

Replace the hardcoded static city abbreviation map (`config/ca-cities.js`) with a
database-driven city mapping system managed by the admin via a GUI panel on the Realist
Lookup page. Admins can see unrecognized city values from imported CSVs alongside a
sample address for each, enter the correct city name, save the mapping, and have all
matching property records updated automatically. Future CSV imports will apply saved
mappings at import time.

---

## Current State

### City mapping flow (before this change)
1. CRMLS CSV imported → `services/csv.js:importCrmlsProperties()` calls `expandCity()`
   on each row's city value
2. `expandCity()` looks up `config/ca-cities.js:CA_CITY_MAP` (97 hardcoded entries)
3. Expanded (or unchanged) city stored in `crmls_properties.city`
4. Raw CSV value is discarded — no record of what the original abbreviation was

### Problems
- CA_CITY_MAP contains wrong mappings (e.g., `'DB'` → `'Daytona Beach'` in California data)
- No way to correct or audit mappings without editing source code
- Once a wrong city is stored in the DB, there is no mechanism to bulk-correct it
- No GUI; only admins with code access can update mappings

### Key files
| File | Relevance |
|---|---|
| `config/ca-cities.js` | Static map + `expandCity()` |
| `services/csv.js` (lines ~198-201) | Calls `expandCity()` during import |
| `db/init.js` (lines 104-116) | `crmls_properties` table schema |
| `routes/realestate.js` (lines ~151-200) | GET /realestate/lookup route |
| `routes/api.js` (lines ~395-528) | Realist lookup API endpoints |
| `views/realestate/realist-lookup.ejs` | Lookup page template |
| `public/js/realist.js` | Lookup page frontend JS |

---

## Steps

### Step 1 — Clear the static city map (`config/ca-cities.js`)

Clear `CA_CITY_MAP` to an empty object. Keep the `expandCity()` function signature
intact (it becomes a no-op with an empty map) so existing call sites don't break during
the transition. The function will be retired from the import pipeline in Step 3.

```js
const CA_CITY_MAP = {}; // Cleared — mappings now managed in DB via city_mappings table
```

---

### Step 2 — Add DB tables and columns (`db/init.js`)

**2a. Add `city_mappings` table** inside `createTables()` db.exec block:

```sql
CREATE TABLE IF NOT EXISTS city_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_city TEXT UNIQUE NOT NULL,
  mapped_city TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_city_mappings_raw ON city_mappings(raw_city);
```

**2b. Add `raw_city` column to `crmls_properties`** using a guarded ALTER TABLE
(after the `db.exec()` block in `createTables()`):

```js
// Add raw_city column if it doesn't exist yet
const crmlsCols = db.pragma('table_info(crmls_properties)').map(c => c.name);
if (!crmlsCols.includes('raw_city')) {
  db.exec('ALTER TABLE crmls_properties ADD COLUMN raw_city TEXT');
}
```

**2c. Migrate existing data** — set `raw_city = city` for rows where `raw_city` is
NULL (preserves whatever value was already stored as the raw reference):

```js
db.prepare(
  'UPDATE crmls_properties SET raw_city = city WHERE raw_city IS NULL'
).run();
```

This migration runs once on startup. Existing records will appear in the admin panel
with their current city value as the "raw" label — admin can confirm or remap them.

---

### Step 3 — Update CSV import service (`services/csv.js`)

In `importCrmlsProperties()`, replace the `expandCity()` call with a DB mapping lookup:

**Remove:**
```js
if (prop.city) {
  prop.city = expandCity(prop.city);
}
```

**Replace with** (before the INSERT loop, build a lookup map from `city_mappings`):
```js
// Load saved city mappings for this import
const cityMappings = {};
db.prepare('SELECT raw_city, mapped_city FROM city_mappings').all()
  .forEach(function(row) { cityMappings[row.raw_city.toUpperCase()] = row.mapped_city; });
```

Then in the per-row processing:
```js
var rawCity = prop.city ? prop.city.trim() : null;
prop.raw_city = rawCity;
if (rawCity && cityMappings[rawCity.toUpperCase()]) {
  prop.city = cityMappings[rawCity.toUpperCase()];
} else {
  prop.city = rawCity; // store as-is; admin will map it later
}
```

Update the INSERT statement to include `raw_city`:
```sql
INSERT INTO crmls_properties
  (property_address, city, raw_city, state, zip, sale_date, sale_price, csv_upload_id)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```

Remove the `require('./config/ca-cities')` import from `services/csv.js` once
`expandCity` is no longer called.

---

### Step 4 — Add city mapping API endpoint (`routes/api.js`)

Add two endpoints after the existing realist-lookup block (~line 528):

**POST /api/city-mappings** — save a mapping and bulk-update all matching properties:
```js
router.post('/city-mappings', requireRole('admin'), function(req, res) {
  try {
    var raw_city = (req.body.raw_city || '').trim();
    var mapped_city = (req.body.mapped_city || '').trim();
    if (!raw_city || !mapped_city) {
      return res.status(400).json({ error: 'raw_city and mapped_city are required.' });
    }
    var db = getDb();
    // Upsert the mapping
    db.prepare(
      'INSERT INTO city_mappings (raw_city, mapped_city, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ' +
      'ON CONFLICT(raw_city) DO UPDATE SET mapped_city = excluded.mapped_city, updated_at = CURRENT_TIMESTAMP'
    ).run(raw_city, mapped_city);
    // Bulk-update all matching properties
    var result = db.prepare(
      'UPDATE crmls_properties SET city = ? WHERE raw_city = ?'
    ).run(mapped_city, raw_city);
    res.json({ success: true, updated: result.changes });
  } catch (err) {
    console.error('City mapping save error:', err);
    res.status(500).json({ error: 'Failed to save city mapping.' });
  }
});
```

**GET /api/city-mappings/unmapped** — return distinct unmapped city values with a sample
address each (admin only):
```js
router.get('/city-mappings/unmapped', requireRole('admin'), function(req, res) {
  try {
    var db = getDb();
    var rows = db.prepare(`
      SELECT cp.raw_city,
             cp.property_address AS sample_address,
             COUNT(*) OVER (PARTITION BY cp.raw_city) AS count
      FROM crmls_properties cp
      WHERE cp.raw_city IS NOT NULL
        AND cp.raw_city NOT IN (SELECT raw_city FROM city_mappings)
      GROUP BY cp.raw_city
      ORDER BY count DESC
    `).all();
    // Deduplicate to one row per raw_city
    var seen = {};
    var unmapped = rows.filter(function(r) {
      if (seen[r.raw_city]) return false;
      seen[r.raw_city] = true;
      return true;
    });
    res.json({ success: true, unmapped: unmapped });
  } catch (err) {
    console.error('Unmapped cities error:', err);
    res.status(500).json({ error: 'Failed to load unmapped cities.' });
  }
});
```

---

### Step 5 — Pass unmapped city count to lookup page (`routes/realestate.js`)

In the GET /realestate/lookup handler, add a count query for the admin badge (only
runs if admin):

```js
var unmappedCount = 0;
if (req.session.user.role === 'admin') {
  unmappedCount = db.prepare(`
    SELECT COUNT(DISTINCT raw_city) as c
    FROM crmls_properties
    WHERE raw_city IS NOT NULL
      AND raw_city NOT IN (SELECT raw_city FROM city_mappings)
  `).get().c;
}
// Add to res.render locals:
// { ..., unmappedCount }
```

---

### Step 6 — Add city mappings panel to the lookup view
(`views/realestate/realist-lookup.ejs`)

**6a.** In the table column header for City/State/Zip, add an admin-only button:

```ejs
<th>City / State / Zip
  <% if (user.role === 'admin') { %>
    <button id="btn-city-mappings" class="btn-sm btn-secondary" style="margin-left:8px;">
      City Mappings<% if (unmappedCount > 0) { %>
        <span class="badge-count"><%= unmappedCount %></span>
      <% } %>
    </button>
  <% } %>
</th>
```

**6b.** Add the city mappings panel (admin only, hidden by default), placed after the
properties table:

```ejs
<% if (user.role === 'admin') { %>
<div id="city-mappings-panel" class="panel-overlay" style="display:none;">
  <div class="panel-box">
    <div class="panel-header">
      <h3>Unmapped City Values</h3>
      <button id="btn-close-city-panel" class="btn-sm">&times;</button>
    </div>
    <p class="panel-hint">
      Each row is a city value from an imported CSV that has no mapping yet.
      Look up the sample address to identify the correct city, then type it and save.
    </p>
    <div id="city-mappings-list">
      <p>Loading…</p>
    </div>
  </div>
</div>
<% } %>
```

The panel list is populated dynamically via the GET /api/city-mappings/unmapped endpoint
when the panel opens. Each row rendered by JS will look like:

```
[raw city value]  [sample address — copy button]  [input: correct city name]  [Save]
```

Saved rows disappear from the list and the count badge on the button updates.

---

### Step 7 — Add city mapping JS handlers (`public/js/realist.js`)

Add to the `DOMContentLoaded` block (after existing code):

```js
// City Mappings Panel (admin only)
var cityPanelBtn = document.getElementById('btn-city-mappings');
if (cityPanelBtn) {
  var cityPanel = document.getElementById('city-mappings-panel');
  var cityList = document.getElementById('city-mappings-list');

  cityPanelBtn.addEventListener('click', function() {
    cityPanel.style.display = 'flex';
    loadUnmappedCities();
  });

  document.getElementById('btn-close-city-panel').addEventListener('click', function() {
    cityPanel.style.display = 'none';
  });

  function loadUnmappedCities() {
    cityList.innerHTML = '<p>Loading…</p>';
    fetch('/api/city-mappings/unmapped', {
      headers: { 'X-CSRF-Token': window.CSRF_TOKEN }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.unmapped || data.unmapped.length === 0) {
        cityList.innerHTML = '<p class="text-muted">All cities are mapped.</p>';
        return;
      }
      var html = '<table class="data-table"><thead><tr>' +
        '<th>Raw City Value</th><th>Sample Address</th><th>Correct City Name</th><th></th>' +
        '</tr></thead><tbody>';
      data.unmapped.forEach(function(row) {
        html += '<tr data-raw="' + escapeAttr(row.raw_city) + '">' +
          '<td><code>' + escapeHtml(row.raw_city) + '</code> <small>(' + row.count + ' records)</small></td>' +
          '<td>' + escapeHtml(row.sample_address) +
            ' <button class="btn-sm copy-addr" data-addr="' + escapeAttr(row.sample_address) + '">Copy</button></td>' +
          '<td><input class="city-input" type="text" placeholder="Enter correct city name" style="width:200px"></td>' +
          '<td><button class="btn-sm btn-primary save-mapping">Save</button></td>' +
          '</tr>';
      });
      html += '</tbody></table>';
      cityList.innerHTML = html;
    });
  }

  cityList.addEventListener('click', function(e) {
    // Copy sample address
    if (e.target.classList.contains('copy-addr')) {
      var addr = e.target.getAttribute('data-addr');
      navigator.clipboard ? navigator.clipboard.writeText(addr) : (function() {
        var ta = document.createElement('textarea');
        ta.value = addr; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      })();
      e.target.textContent = 'Copied!';
      setTimeout(function() { e.target.textContent = 'Copy'; }, 1500);
    }
    // Save mapping
    if (e.target.classList.contains('save-mapping')) {
      var row = e.target.closest('tr');
      var rawCity = row.getAttribute('data-raw');
      var mappedCity = row.querySelector('.city-input').value.trim();
      if (!mappedCity) { alert('Please enter the correct city name.'); return; }
      e.target.disabled = true;
      e.target.textContent = 'Saving…';
      fetch('/api/city-mappings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': window.CSRF_TOKEN
        },
        body: JSON.stringify({ raw_city: rawCity, mapped_city: mappedCity })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) {
          row.remove();
          // Update badge count
          var badge = cityPanelBtn.querySelector('.badge-count');
          var remaining = cityList.querySelectorAll('tbody tr').length;
          if (badge) {
            if (remaining === 0) badge.remove();
            else badge.textContent = remaining;
          }
          if (remaining === 0) {
            cityList.innerHTML = '<p class="text-muted">All cities are mapped.</p>';
          }
        } else {
          e.target.disabled = false;
          e.target.textContent = 'Save';
          alert('Error: ' + (data.error || 'Save failed.'));
        }
      });
    }
  });
}
```

Note: `escapeHtml` and `escapeAttr` helpers must be available in this JS file or defined
locally (check if already defined in realist.js; add minimal versions if not).

---

### Step 8 — Add CSS for the city mappings panel (`public/css/main.css` or inline)

```css
.panel-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.panel-box {
  background: #fff; border-radius: 8px;
  padding: 24px; width: 90%; max-width: 860px;
  max-height: 80vh; overflow-y: auto;
  box-shadow: 0 4px 24px rgba(0,0,0,0.2);
}
.panel-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 12px;
}
.panel-hint { color: #475569; font-size: 0.875rem; margin-bottom: 16px; }
.badge-count {
  background: #dc2626; color: #fff;
  border-radius: 10px; padding: 1px 7px;
  font-size: 0.75rem; margin-left: 4px;
}
```

---

## Testing

| # | Test | Expected result |
|---|---|---|
| 1 | Restart server | No errors; `city_mappings` table created; `raw_city` column added to `crmls_properties`; existing rows have `raw_city = city` |
| 2 | Import a CRMLS CSV with abbreviated city values | `raw_city` stores raw CSV value; `city` stores raw (no expansion); no JS errors |
| 3 | Import a CSV where raw city has an existing mapping | `city` field stores the mapped value; `raw_city` stores the original |
| 4 | Admin visits /realestate/lookup | "City Mappings" button visible with count badge (if any unmapped); button absent for non-admin |
| 5 | Non-admin visits /realestate/lookup | No City Mappings button; GET /api/city-mappings/unmapped returns 403 |
| 6 | Admin opens panel | Unmapped raw city values shown with sample address and count |
| 7 | Admin types correct city and saves | Row removed from panel; badge count decrements; re-import check: DB shows updated `city` on all matching rows |
| 8 | Admin saves mapping for a value with 0 remaining | Panel shows "All cities are mapped." |
| 9 | Run `npm test` | All existing unit tests pass; `config/ca-cities.js` city map tests now expect empty map |

---

## Risks

| Risk | Mitigation |
|---|---|
| **Existing `ca-cities.js` unit tests** — `cities.test.js` tests against the 97-entry map | Update `cities.test.js` to expect an empty `CA_CITY_MAP`; `expandCity()` still exists and returns input unchanged |
| **Existing crmls_properties data** — rows already have expanded-but-possibly-wrong city values; migration sets `raw_city = city` | Admin will see these in the panel and can confirm or remap; no data loss |
| **`expandCity()` still imported elsewhere** — if other files call it | Grep for `expandCity` before removing the import in csv.js; the function still works (returns input unchanged) |
| **SQLite `ON CONFLICT` syntax** — `better-sqlite3` requires SQLite 3.24+ | Node 20 ships with a new enough SQLite; already used pattern in project |
| **Window function `COUNT(*) OVER`** — used in unmapped query | SQLite 3.25+ supports window functions; already in use elsewhere; verify or replace with subquery if needed |
| **Large number of unmapped cities** — panel could be long | Panel is scrollable (`max-height: 80vh; overflow-y: auto`); ordered by record count descending so most impactful mappings appear first |
| **CSRF on new API endpoints** — `requireRole` passes through CSRF check | Verify CSRF middleware order in `routes/api.js`; new endpoints follow same pattern as existing ones |
