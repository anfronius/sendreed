# Plan: 6th Set of Fixes

## Issues

1. **Variable toolbar missing from New Template modal** — The modal on the campaigns page has no variable insertion buttons like the campaign builder does.
2. **CSRF errors saving/editing templates via modal** — `window.CSRF_TOKEN` is never set on `history.ejs`, so all AJAX calls send `undefined` as the token.
3. **CSRF errors on Fields page + template deletion** — Same root cause: `window.CSRF_TOKEN` missing from `field-management.ejs`.

## Root Cause

The CSRF token is available server-side (`res.locals.csrfToken`) on every page, but the `<script>window.CSRF_TOKEN = '...';</script>` block only exists in `create.ejs` and `review.ejs`. Pages `history.ejs` and `field-management.ejs` never emit it, so their JS files send `"undefined"` as the token header, which always fails validation.

## Fix Plan

### Step 1: Add `window.CSRF_TOKEN` to `history.ejs`
- Add `<script>window.CSRF_TOKEN = '<%= csrfToken %>';</script>` before the layout-footer include
- This fixes: template save, template edit, template delete on the campaigns page

### Step 2: Add `window.CSRF_TOKEN` to `field-management.ejs`
- Same pattern, before the layout-footer include
- This fixes: field checkbox toggling for admin

### Step 3: Pass `variables` to the history view
- In `routes/campaign.js` GET `/` handler, compute the variables list based on effective role
- Pass `variables` to `res.render('campaign/history', { ... })`

### Step 4: Add variable toolbar to the template modal in `history.ejs`
- Add a `.variable-toolbar` div with `.var-btn` buttons inside the modal, between the subject input and body textarea
- Use server-rendered `<% variables.forEach(...) %>` loop, same pattern as `create.ejs`

### Step 5: Add variable insertion logic to `campaign-history.js`
- Add click handler on `.variable-toolbar` buttons that inserts `{{variable}}` at cursor position in the body textarea
- Also support inserting into the subject field when it's focused

### Step 6: Test, commit, update FIXES.md

## Files Modified
- `views/campaign/history.ejs` — CSRF token + variable toolbar in modal
- `views/admin/field-management.ejs` — CSRF token
- `routes/campaign.js` — pass `variables` to history view
- `public/js/campaign-history.js` — variable insertion handlers
- `FIXES.md` — mark 6th set items as done
