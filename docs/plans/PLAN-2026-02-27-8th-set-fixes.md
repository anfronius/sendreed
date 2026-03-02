**Status: Completed — 2026-02-27**

# 8th Set of Fixes — Action Plan

## Overview
11 items from the 8th set in FIXES.md plus Fix 4 deferred from the 4th set. Grouped by complexity.

---

## Fix 1: Button Height Unification (CSS + Templates)
**Goal:** Three button tiers: large (page actions), small (row actions), filter tabs (unchanged).

**Changes:**
- `public/css/style.css` — Define clear tiers; ensure `.btn` = large, `.btn-sm` = small
- `views/contacts/list.ejs` — Delete Selected button: remove `btn-sm` so it matches Import CSV
- `views/realestate/realist-lookup.ejs` — Not Found/Delete buttons: remove `btn-sm`
- `views/admin/users.ejs` — Wipe Data/Delete: remove `btn-sm` to match SMTP button height
- `views/campaign/history.ejs` — "View Texts" uses `btn-sm` already; ensure Delete beside it also uses `btn-sm` (both should be small row-action buttons)
- `views/realestate/phone-matching.ejs` — Ensure Apply All Confirmed and Import Another vCard are both large (no `btn-sm`)

---

## Fix 2: Contacts Filter Improvements
**Goal:** Add "Has Phone"/"Has Email" options, remove Filter button, auto-apply on change.

**Changes:**
- `views/contacts/list.ejs` — Add `<option value="has-phone">Has Phone</option>` and `<option value="has-email">Has Email</option>`; remove the Filter submit button
- `public/js/contacts.js` — Add `change` event listener on filter dropdown + sort dropdown + search input (debounced) that auto-submits the form
- `routes/contacts.js` — Handle new filter values `has-phone` and `has-email` in the query builder

---

## Fix 3: Realist Lookup Dynamic Updates
**Goal:** Finalize button count updates dynamically; finalized properties disappear from lookup; Not Found button updates counts dynamically.

**Changes:**
- `public/js/realist.js` — In `updateProgress()`, also update or show/hide the Finalize button and its count
- `views/realestate/realist-lookup.ejs` — Give Finalize button an ID and always render it (hidden when count=0), so JS can show/hide it
- `routes/realestate.js` (finalize route) — After creating contacts, mark finalized properties with a new status (`finalized`) or delete them from `crmls_properties`
- Convert Finalize from form POST to AJAX so the page doesn't refresh and finalized rows disappear from the list

---

## Fix 4: Reverse Not Found
**Goal:** Allow undoing "Not Found" status; Not Found button dynamically updates counters.

**Changes:**
- `routes/api.js` — Add `PUT /api/realist-lookup/:id/undo-not-found` endpoint that sets status back to `pending`
- `views/realestate/realist-lookup.ejs` — Show "Undo" button on not_found rows (replacing disabled state)
- `public/js/realist.js` — Wire Undo button with AJAX, call `updateProgress()` on success; ensure Not Found button already calls `updateProgress()` (it does per analysis)

---

## Fix 5: Phone Matching Dynamic Apply Button
**Goal:** Apply All Confirmed count updates as individual matches are confirmed; button stays same size as Import Another vCard.

**Changes:**
- `public/js/matching.js` — In the confirm handler success callback, increment the Apply button's `data-count` and update its text
- `views/realestate/phone-matching.ejs` — Always render Apply button (even if initial count is 0, hidden), give it an ID for JS targeting

---

## Fix 6: Campaigns View Texts Button Size
**Goal:** View Texts button same height as Delete button beside it.

**Changes:**
- `views/campaign/history.ejs` — Both already use `btn-sm`. Check if form wrapper around Retry causes height mismatch. If so, add `style="display:contents"` to the form. Ensure the `<a>` tag "View Texts" matches the `<button>` Delete visually.

---

## Fix 7: SMTP ProtonMail Save Fix
**Goal:** Admin can save ProtonMail SMTP credentials without error.

**Investigation:**
- The test connection succeeds but save fails — suggests `encrypt()` is throwing
- Check `ENCRYPTION_KEY` handling in `services/crypto.js` — the `getKey()` function slices to 32 hex chars (16 bytes) but uses `aes-256-cbc` which needs 32 bytes
- Add ProtonMail to client-side provider auto-fill in `public/js/admin.js`
- Add better error logging in the save route to surface the actual error message

**Changes:**
- `routes/admin.js` — Add `console.error` with the actual error in the catch block
- `public/js/admin.js` — Add ProtonMail to provider auto-fill map
- `services/crypto.js` — Investigate and fix key length if needed (may need to use 64 hex chars)
- `config/providers.json` — Ensure ProtonMail preset exists (it was added in an earlier set)

---

## Fix 8: SMS In-Progress Status + Daily Email Limit (Deferred Fix 4)
**Goal:** SMS campaigns show "in_progress" until all texts sent. Email campaigns can have per-campaign daily limit.

**Changes:**
- `db/init.js` — Add `'in_progress'` to campaigns status CHECK; add `daily_limit INTEGER` column
- `routes/campaign.js` — Set SMS campaign to `'in_progress'` instead of `'sent'`
- `views/campaign/sms-batch.ejs` — Add click handler on SMS deep links that calls AJAX to mark recipient as `sent`; when all done, auto-mark campaign `sent`
- `routes/api.js` — Add `PUT /api/campaign-recipient/:id/sent` endpoint
- `views/campaign/review.ejs` — Add optional "Max emails per day" input for email campaigns
- `services/email.js` — Respect per-campaign `daily_limit`
- `public/css/style.css` — Add `.badge-status-in_progress` badge style
- `views/campaign/history.ejs` — Show `in_progress` status badge

---

## Execution Order
1. **Fix 1** — Button height unification (CSS + templates, quick)
2. **Fix 6** — View Texts button (small CSS, related to Fix 1)
3. **Fix 2** — Contacts filter improvements (small feature)
4. **Fix 5** — Phone matching dynamic apply (JS)
5. **Fix 3** — Realist lookup dynamic updates (medium JS + backend)
6. **Fix 4** — Reverse Not Found (small feature + dynamic)
7. **Fix 7** — SMTP ProtonMail save (investigation + fix)
8. **Fix 8** — SMS in-progress + daily email limit (schema + multi-file)

## Verification
- Run `npm test` after each fix
- Commit after each fix with conventional commit format
- Mark items in FIXES.md as complete
