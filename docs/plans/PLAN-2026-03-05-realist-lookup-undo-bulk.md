# Plan: Realist Lookup — Undo, Smart Bulk Actions & Status Labels

**Date:** 2026-03-05
**Branch:** `feat/13th-set-of-fixes`

## Context

The Realist Lookup page has several UX gaps in its bulk action and undo systems:
- Bulk "Not Found" removes the action button but never creates Undo buttons (bug)
- No way to undo a "Found" status (Copy button stays even after owner name auto-sets status)
- Bulk action buttons are status-unaware — they show for ALL selected items regardless of status
- The `NOT_FOUND` badge shows with an underscore because CSS `text-transform: uppercase` uppercases the raw DB value `not_found`
- Bulk action buttons have the same `gap` whitespace issue that filter buttons had

## Changes

### 1. Fix Bulk Button Gap (CSS)
**File:** `public/css/style.css`

The `#bulk-not-found-btn` and `#bulk-delete-btn` inherit `.btn`'s `display: inline-flex; gap: var(--space-2)` which spaces out the `<span>` count from surrounding text. Add `gap: 0` to these buttons. Simplest approach: add a `.btn-danger` or targeted rule, or add `gap: 0` inline to the two buttons in the EJS. Since we'll be refactoring these buttons anyway (adding a third bulk Undo button), we'll use a `.bulk-action-btn` class with `gap: 0`.

### 2. Status Badge Display Text — Remove Underscores
**Files:** `views/realestate/realist-lookup.ejs`, `public/js/realist.js`

Create a JS helper `statusLabel(status)` that maps DB values to display labels:
- `pending` → `Pending`
- `found` → `Found`
- `not_found` → `Not Found`

Remove `text-transform: uppercase` from the lookup badges (they use `.lookup-status-*` classes). Instead, set the text directly to the display-friendly form. Apply in:
- EJS template: server-side rendering of initial badge text
- JS: every place that sets `badge.textContent` (owner name save, not-found, undo, bulk not-found)

### 3. "Found" Items: Copy → Undo Button
**Files:** `public/js/realist.js`, `routes/api.js`

**Backend:** Create `POST /api/realist-lookup/:id/undo-found`
- Sets `realist_lookup_status = 'pending'`, clears `realist_owner_name`, clears `looked_up_at`
- Returns updated counts
- Follows same ownership check pattern as existing endpoints

**Frontend:** When owner name auto-save sets status to `found`:
- Replace the "Not Found" button with an "Undo" button (class `undo-found-btn`)
- When clicking Undo on a found item: calls undo-found endpoint, clears owner name input, sets badge to Pending, replaces Undo with "Not Found" button, re-enables input

**EJS template:** For server-rendered rows with status `found`, show Undo button instead of Copy + Not Found. Update the conditional:
```
if status === 'not_found' → Copy + Undo (existing)
if status === 'found' → Undo (replaces Copy + Not Found)
if status === 'pending' → Copy + Not Found (existing)
```

Wait — re-reading the user's request: "When an object has been Found have the Copy button become an undo button." This means the Copy button position gets replaced by Undo, not the Not Found button. So:
```
if status === 'not_found' → Undo (as today, no copy needed for not_found)
if status === 'found' → Undo (was Copy) — the Not Found btn is gone since it has a name
if status === 'pending' → Copy + Not Found (as today)
```

Actually, let me re-think the action column layout for each status:
- **pending**: `[Copy] [Not Found]` — can copy address, can mark not found
- **found**: `[Undo]` — undo clears name and reverts to pending
- **not_found**: `[Undo]` — undo reverts to pending

### 4. Bulk Not Found — Create Undo Buttons
**File:** `public/js/realist.js`

In the bulk not-found success handler (lines 101-117), after updating each row:
- Remove the Not Found button (already done)
- Create and insert an Undo button (currently missing — this is the bug)
- Also remove the Copy button since not_found items don't need it

### 5. Smart Bulk Action Buttons
**Files:** `views/realestate/realist-lookup.ejs`, `public/js/realist.js`

**New bulk button:** Add `#bulk-undo-btn` to the page header alongside existing bulk buttons.

**Rewrite `updateBulkState()`** to be status-aware:
```js
function updateBulkState() {
  var checked = table.querySelectorAll('.lookup-checkbox:checked');
  var pendingOrFound = 0;  // can be marked Not Found
  var notFoundOrFound = 0; // can be Undone
  var total = checked.length;

  checked.forEach(function(cb) {
    var row = cb.closest('tr');
    var status = row.dataset.status;
    if (status === 'pending' || status === 'found') pendingOrFound++;
    if (status === 'not_found' || status === 'found') notFoundOrFound++;
  });

  // Show/hide and update counts
  toggle(bulkNotFoundBtn, pendingOrFound);  // "Not Found (3)"
  toggle(bulkUndoBtn, notFoundOrFound);     // "Undo (2)"
  toggle(bulkDeleteBtn, total);              // "Delete (4)"
}
```

**New endpoint:** `POST /api/realist-lookup/bulk-undo`
- Accepts `{ ids: [...] }`
- For each: sets status to `pending`, clears `realist_owner_name` and `looked_up_at`
- Returns updated counts

**Frontend handler for bulk undo:**
- For each row: set badge to Pending, clear & enable owner name input, swap buttons to Copy + Not Found
- Update counts, uncheck boxes

### 6. Backend: New Endpoints
**File:** `routes/api.js`

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/realist-lookup/:id/undo-found` | POST | Undo found → pending (clear name) |
| `/api/realist-lookup/bulk-undo` | POST | Bulk undo (found/not_found → pending) |

Both follow the existing ownership check + counts return pattern.

## Files Modified

| File | Changes |
|---|---|
| `public/css/style.css` | `gap: 0` on bulk buttons; remove `text-transform: uppercase` from lookup badges |
| `public/js/realist.js` | Status label helper, smart bulk state, bulk undo handler, found→undo button swap, bulk not-found creates undo buttons, undo-found handler |
| `views/realestate/realist-lookup.ejs` | Add bulk undo button, status-aware action column, display-friendly badge text |
| `routes/api.js` | Add `undo-found` and `bulk-undo` endpoints |

## Verification

1. **Individual Not Found:** Click "Not Found" → shows "Undo", badge shows "Not Found"
2. **Individual Undo (not_found):** Click Undo → badge back to "Pending", shows Copy + Not Found
3. **Individual Found:** Enter owner name, blur → badge shows "Found", buttons become Undo only
4. **Individual Undo (found):** Click Undo → badge "Pending", name cleared, shows Copy + Not Found
5. **Bulk Not Found:** Select 3 pending items → "Not Found (3)" shows, click → all show Undo buttons
6. **Bulk Undo:** Select 2 not_found + 1 found → "Undo (3)" shows, click → all revert to Pending
7. **Smart counts:** Select 1 pending + 1 found + 1 not_found → shows "Not Found (2)", "Undo (2)", "Delete (3)"
8. **Badge text:** No underscores — "Pending", "Found", "Not Found"
9. **Bulk button spacing:** No extra whitespace in "Not Found (3)" or "Delete (3)"
