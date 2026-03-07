# Eleventh Set of Fixes - COMPLETED

## Date: 2026-03-04
## Branch: fix/11th-set-of-fixes

## Summary
5 fixes implemented, 1 configuration issue documented, 1 issue requires user verification.

### Fixes Implemented

#### 1. Send Texts Page - Button Sizing (FIXED)
**File**: `public/css/style.css`
**Issue**: "Mark Sent" and "Copy Message" buttons appeared smaller than "Send Text" button
**Root Cause**: `.btn-sms-send` had `height: auto` override on line 978
**Fix**: Removed the height override and font-size override, kept only `.sms-card-actions` flex container with gap and align-items

#### 2. ENCRYPTION_KEY Error (CONFIGURATION ISSUE - NO CODE FIX)
**Issue**: "ENCRYPTION_KEY env var must be at least 64 hex characters (32 bytes for AES-256)"
**Analysis**: This is correct validation in `services/crypto.js` (lines 6-12)
**Resolution**: Documented in FIXES.md that user needs to set proper 64-hex-char ENCRYPTION_KEY in environment. The .env.example already provides clear guidance. Error message is accurate.

#### 3. Stacked Buttons Missing Space (FIXED)
**File**: `public/css/style.css` (line 1231-1233)
**Issue**: "View Texts" and "Delete" buttons stack with no space on narrow windows
**Fix**: Enhanced existing CSS rule to add `margin-bottom` to `.data-table td .btn-sm` and ensure last child has no margin

#### 4. Template Variables - "years" Issue (NEEDS USER VERIFICATION)
**Files**: `services/template.js`, `config/field-config.js`
**Issue**: User sees "years" variable even when "there is no years field"
**Investigation**:
- Template service filters variables by active fields (template.js lines 36-58)
- Database check shows purchase_date is enabled for realestate (visible=1) and disabled for nonprofit (visible=0)
- "years" variable is computed from purchase_date field
**Resolution**: Code is working correctly. User needs to verify:
  1. Which user role they're testing with (realestate should see "years", nonprofit should not)
  2. If they disabled purchase_date field in Fields management but are still testing as admin

#### 5. Send Texts Filter (IMPLEMENTED)
**File**: `views/campaign/sms-batch.ejs`
**Implementation**:
- Added filter bar with All/Pending/Sent buttons using `.btn-filter` class
- Implemented `applyFilter()` JavaScript function for dynamic filtering
- Filter updates instantly when clicking buttons
- Filter reapplies after marking a text as sent to maintain view consistency

#### 6. Back to Campaigns Button Style (FIXED)
**File**: `views/campaign/sms-batch.ejs` (line 48)
**Change**: Converted from `btn btn-secondary btn-large` to `btn btn-link` to match other sub-pages

## Files Modified
- `public/css/style.css` - Button sizing fixes
- `views/campaign/sms-batch.ejs` - Filter UI, back link style
- `FIXES.md` - Marked completed items and documented configuration issue

---

# Tenth Set of Fixes - COMPLETED

# Tenth Set of Fixes - Analysis

## Overview
10 fixes identified in FIXES.md for the tenth set. These focus on:
1. Template variable fields respecting Fields page settings
2. Admin SMTP save functionality
3. Send Texts page button consistency
4. Dashboard user list filtering
5. Real estate dashboard counter accuracy
6. Phone/email matching UX improvements
7. Realist lookup UI cleanup
8. City mappings modal improvements

## Fix Breakdown

### Fix 1: Message Body Inserts respect Fields page
**Issue**: Variable inserts for templates don't change based on active fields in Fields management
**Files**:
- `views/campaigns.ejs` - template modal
- `views/campaigns/create.ejs` - campaign builder
- `routes/admin.js` - fetch active fields
**Implementation**: Query enabled fields from `field_config` table and filter available variables

### Fix 2: Admin SMTP save error
**Issue**: Test succeeds but save fails with "Failed to save SMTP settings"
**Files**: `routes/admin.js` - SMTP save endpoint
**Investigation needed**: Check validation, encryption, database constraints

### Fix 3: Send Texts button sizing
**Issue**: 'Send Text' button larger than 'Mark Sent' and 'Copy Message'
**Files**: `views/campaigns/send-texts.ejs`
**Implementation**: Apply consistent button sizing CSS

### Fix 4: Send Texts return button style
**Issue**: Return button is a link instead of button like other subpages
**Files**: `views/campaigns/send-texts.ejs`
**Implementation**: Convert link to btn class button

### Fix 5: Campaign page button stacking
**Issue**: View Texts and Delete buttons stack without spacing on narrow windows
**Files**: `public/css/main.css` or inline styles in campaigns.ejs
**Implementation**: Add gap/margin on responsive breakpoint

### Fix 6: Remove admin from dashboard user list
**Issue**: Admin shows in Users Overview on dashboard
**Files**: `routes/dashboard.js`
**Implementation**: Filter out admin role from user stats query

### Fix 7: "Clients to be matched" counter
**Issue**: Counter doesn't reflect contacts in "No Match Found" section
**Files**: `routes/realestate.js` - dashboard stats
**Investigation**: Check query for contacts with addresses but no phone/email

### Fix 8: Phone/email matching - hide confirmed
**Issue**: Confirmed matches should disappear dynamically after Apply All
**Files**:
- `views/realestate/match-contacts.ejs`
- `public/js/match-contacts.js`
**Implementation**: Remove confirmed items from DOM after successful apply

### Fix 9: Remove realist lookup progress bar
**Issue**: Progress bar serves no purpose (always gray, Found: 0)
**Files**: `views/realestate/lookup.ejs`
**Implementation**: Remove progress bar HTML

### Fix 10: City mappings modal improvements
**Issue**:
- Should show "Mapping City Values" not "Unmapped City Values"
- Should list all mapped cities below unmapped ones
- Allow editing mapped cities
**Files**:
- `views/realestate/lookup.ejs` - modal
- `public/js/lookup.js` - modal logic
- `routes/realestate.js` - city mappings API
**Implementation**:
- Fetch all mappings, separate mapped/unmapped
- Display both lists
- Add edit functionality for mapped cities

## Implementation Order
1. Fix 6 (dashboard filter) - quick
2. Fix 9 (remove progress bar) - quick
3. Fix 3,4,5 (button styling) - quick
4. Fix 2 (SMTP investigation)
5. Fix 7 (counter logic)
6. Fix 1 (fields filtering)
7. Fix 8 (matching hide confirmed)
8. Fix 10 (city mappings modal)

## Testing Strategy
- Manual testing for each UI fix
- Database queries for counter fixes
- SMTP test for save functionality
- Responsive testing for button stacking

---

# 14th Set of Fixes - Analysis

## Overview
The 14th set contains 6 fixes focused on:
1. Auto-calculating years since purchase
2. Reordering Close Price before Close Date
3. Making vCard matching retroactive
4. Supporting multiple owners from Realist
5. Parsing buyer names from "Last, First M" format
6. Renaming import buttons
7. Fixing pagination updates with filters

## Fix 1: Years Since Purchase Auto-Calculation + Column Reorder

### Current State
- `purchase_date` field exists in contacts table (aliased as sale_date in CRMLS)
- No automatic calculation of years since purchase
- Display order: Close Date, then Close Price (lines 53-54 in realist-lookup.ejs)

### Required Changes
1. **Display order** - Swap columns in `/views/realestate/realist-lookup.ejs`:
   - Move Close Price before Close Date in header (lines 53-54)
   - Move corresponding data cells (lines 68-69)
2. **Auto-calculation** - Add computed `years_since_purchase` field:
   - Calculate from `purchase_date` when displaying contacts
   - This is a virtual/computed field, not stored in DB
   - Calculate as: `Math.floor((today - purchase_date) / (365.25 * 24 * 60 * 60 * 1000))`

### Files to Modify
- `/views/realestate/realist-lookup.ejs` - swap column order
- `/views/contacts.ejs` - add years_since_purchase display
- `/routes/contacts.js` - compute years for each contact before rendering
- `/services/template.js` - ensure `{{years_since_purchase}}` variable works

### Questions
- Should years_since_purchase show on the realist lookup page too, or only on contacts page?
- Should it be editable or always computed?

---

## Fix 2: Make vCard Matching Retroactive

### Current State
- vCard imports create `imported_contacts` records
- Phone matching creates `phone_matches` table entries
- Matching happens when visiting `/realestate/phone-matching` page
- If CRMLS imported first, then vCard, matches are found
- If vCard imported first, then CRMLS, need to verify matches are still found

### Analysis
Looking at the matcher logic, I need to verify:
1. Does `/realestate/phone-matching` query ALL imported_contacts regardless of import date?
2. Does it match against ALL contacts regardless of creation date?

### Files to Check
- `/routes/realestate.js` - phone-matching route logic
- `/services/matcher.js` - matching algorithm
- Need to verify SQL queries don't filter by date

### Investigation Needed
Read the phone-matching route and matcher service to understand current behavior.

---

## Fix 3: Multiple Owners Support

### Current State
- `realist_owner_name` field in `crmls_properties` table is TEXT (single value)
- Input is single text field in realist-lookup.ejs (line 71-75)

### Required Changes
This is a significant change requiring:
1. **Database**: Change to support multiple owners
   - Option A: Make `realist_owner_name` accept comma-separated values
   - Option B: Create new `property_owners` junction table
   - Option C: Use JSON field (less ideal for SQLite)
2. **UI**: Change input from text to allow multiple entries
   - Could use comma-separated input with validation
   - Or multiple input fields
3. **Contact Creation**: When finalizing lookup, create multiple contacts if multiple owners

### Recommendation
Use comma-separated values (Option A) as simplest:
- Accept input like "John Smith, Jane Doe"
- Split on comma when finalizing
- Create one contact per owner with same property details

### Files to Modify
- `/views/realestate/realist-lookup.ejs` - update input placeholder
- `/routes/api.js` - handle comma-separated names in finalize endpoint
- `/public/js/realist.js` - UI feedback for multiple names

---

## Fix 4: Parse Buyer Names from "Last, First M" Format

### Current State
- Names entered in realist lookup are free-form text
- No automatic parsing of format

### Required Changes
1. **Auto-parse on input**: When user types "Delap John M" in owner name field:
   - Detect pattern: `LastName FirstName [MiddleInitial]`
   - Parse to: first_name="John", last_name="Delap"
   - Drop middle initial
2. **Implementation**: Add parsing function in realist.js
   - Trigger on blur or on Finalize
   - Pattern: `^([A-Z][a-z]+)\s+([A-Z][a-z]+)(?:\s+[A-Z]\.?)?$`

### Files to Modify
- `/public/js/realist.js` - add name parsing logic
- `/routes/api.js` - parse names in finalize-lookup endpoint before creating contacts

### Edge Cases
- Names with hyphens: "Smith-Jones Mary"
- Single names: "Madonna"
- Multiple owners: "Delap John M, Smith Mary A"

---

## Fix 5: Rename Import Buttons

### Current State
- `/views/realestate/phone-matching.ejs` line 10: "Import Another vCard"
- `/views/realestate/dashboard.ejs` - need to check button text

### Required Changes
Simple text replacements:
1. Phone matching page: "Import Another vCard" → "Import Contacts List"
2. Real estate dashboard: "Import Contacts" → "Import Contacts List"

### Files to Modify
- `/views/realestate/phone-matching.ejs` line 10
- `/views/realestate/dashboard.ejs` (need to find exact location)
- `/views/realestate/import-vcard.ejs` (check if any labels need updating)

---

## Fix 6: Fix Pagination with Filters

### Current State
- Pagination at bottom of realist-lookup.ejs (lines 98-108)
- Shows current page and total pages
- Links include `status=<%= statusFilter %>` parameter
- Problem: When filter changes to show fewer results, pagination doesn't update dynamically

### Root Cause
- Pagination is server-rendered based on initial page load
- Filters now work client-side (per 13th set fixes)
- Client-side filtering doesn't update pagination controls

### Solution Options
1. **Hide pagination when filtering**: If filter !== 'all', hide pagination
2. **Client-side pagination**: Calculate visible rows and update pagination in JS
3. **Keep server pagination**: Make filters trigger page reload (reverting 13th set changes)

### Recommendation
Option 1 (simplest):
- Add class to pagination div: `<div class="pagination" data-filter-dependent>`
- In realist.js, hide pagination when filter changes from 'all'
- Show it again when returning to 'all'

### Files to Modify
- `/views/realestate/realist-lookup.ejs` - add data attribute to pagination
- `/public/js/realist.js` - hide/show pagination based on active filter

---

## Implementation Order

1. **Fix 5** (Rename buttons) - Simplest, no dependencies
2. **Fix 6** (Pagination) - Simple, builds on 13th set work
3. **Fix 1** (Column reorder + years calculation) - Moderate complexity
4. **Fix 4** (Name parsing) - Moderate, needed for Fix 3
5. **Fix 3** (Multiple owners) - Builds on Fix 4
6. **Fix 2** (Retroactive matching) - Need investigation first

## Testing Requirements

- Test years calculation with various purchase dates (recent, old, null)
- Test name parsing with edge cases (hyphenated, single word, multiple owners)
- Test multiple owner input and contact creation
- Test pagination visibility with different filters
- Test vCard import order: CRMLS→vCard and vCard→CRMLS
- Verify button text changes on all affected pages

## Estimated Effort
- Fix 5: 5 minutes
- Fix 6: 15 minutes
- Fix 1: 30 minutes
- Fix 4: 45 minutes
- Fix 3: 60 minutes
- Fix 2: 30-60 minutes (pending investigation)

Total: ~3-4 hours

---

# 14th Set - Last Issue (Pending Lookup Counter Bug)

## Date: 2026-03-06
## Branch: feat/13th-set-of-fixes

## Issue Summary
User reports inconsistent behavior when completing Realist Lookup for 180 properties:
1. Warning popup shows count of **addresses** being finalized (e.g., 50 addresses)
2. Actual contacts created is higher due to dual owners (e.g., 65 contacts for married couples)
3. After completing all lookups, dashboard still shows 6 properties "pending lookup"
4. User suspects duplication or deduplication error in import

## Root Causes Identified

### 1. Missing `raw_city` Column in Schema (CRITICAL)
**File**: `/home/reedbuntu/projects/sendreed/db/init.js` (line 104-117)
- The `crmls_properties` table schema does NOT include a `raw_city` column
- However, `services/csv.js` (line 170, 203-209) attempts to INSERT into `raw_city`
- This causes a SQL error on import: "table crmls_properties has no column named raw_city"
- The import likely succeeds partially before hitting this error

### 2. No Deduplication Logic on CRMLS Import (HIGH PRIORITY)
**File**: `/home/reedbuntu/projects/sendreed/services/csv.js` (line 159-238)
- The `importCrmlsProperties` function has NO duplicate checking
- If the same CSV is imported twice, or the same property exists in two CSVs, duplicates are inserted
- No UNIQUE constraint on `(property_address, owner_id)` in the schema
- This explains the "6 pending" after completing all: those are duplicates that were never looked up

### 3. Misleading Finalize Warning Message (MEDIUM PRIORITY)
**File**: `/home/reedbuntu/projects/sendreed/public/js/realist.js` (line 583-586)
- Warning shows: "Create [count] contact(s) from found properties?"
- The count is the number of **properties** (addresses), not contacts
- When properties have dual owners (e.g., "Smith Joe H & Mary K"), 2 contacts are created per property
- User sees: "Create 50 contacts?" but actually gets 65+ contacts

### 4. Orphaned Properties After Finalization (ROOT CAUSE)
**File**: `/home/reedbuntu/projects/sendreed/routes/realestate.js` (line 437)
- Properties are DELETEd from `crmls_properties` after contact creation
- If there are duplicates, only the ones that were "found" get deleted
- Duplicates that were never looked up remain as "pending"
- This is why user sees 6 remaining after completing all visible properties

## Fixes Required

### Fix 1: Add `raw_city` Column to Schema
**Priority**: Critical (blocks imports)
**Location**: `db/init.js`
**Action**:
```javascript
// Add after line 117 (after the main CREATE TABLE)
// Migration: Add raw_city column if it doesn't exist
db.exec(`
  ALTER TABLE crmls_properties ADD COLUMN raw_city TEXT
`).catch(() => {
  // Column already exists, ignore error
});
```

### Fix 2: Add Deduplication Logic to Import
**Priority**: High
**Location**: `services/csv.js` (line 181-233)
**Action**:
- Check if `(property_address, owner_id)` already exists before INSERT
- Add EXISTS check or UNIQUE constraint
- Report duplicate count to user
```javascript
const existsCheck = db.prepare(
  'SELECT id FROM crmls_properties WHERE property_address = ? AND owner_id = ?'
);

// In the loop:
const existing = existsCheck.get(prop.property_address, ownerId);
if (existing) {
  skipped++;
  continue;
}
```

### Fix 3: Improve Finalize Warning Message
**Priority**: Medium (UX improvement)
**Location**: `public/js/realist.js` (finalize button click)
**Backend**: `routes/realestate.js` (finalize endpoint)
**Action**:
- Backend should pre-count expected contacts by parsing all owner names with `parseRealistOwnerName()`
- Return `{ addressCount, contactCount }` in finalize response
- Frontend warning should say: "Create X contact(s) from Y address(es)?"

### Fix 4: Add Bulk Duplicate Cleanup Query (Admin Tool)
**Priority**: Low (one-time cleanup for existing data)
**Action**: Admin SQL query to find and remove duplicate properties:
```sql
DELETE FROM crmls_properties
WHERE id NOT IN (
  SELECT MIN(id) FROM crmls_properties
  GROUP BY property_address, owner_id
);
```

## Implementation Plan

1. **Fix 1 (Migration)**: Add `raw_city` column with ALTER TABLE guarded by try-catch
2. **Fix 2 (Deduplication)**: Add EXISTS check in `importCrmlsProperties` before each INSERT
3. **Fix 3 (Warning Message)**: Modify `/realestate/lookup/finalize` to count expected contacts
4. Update FIXES.md to mark this as resolved
5. Test with sample CSV import to verify deduplication works

## Testing Strategy

1. **Test duplicate prevention**:
   - Import same CSV twice
   - Should show "X duplicates skipped" message
   - Verify no duplicates in database

2. **Test warning message**:
   - Create 10 properties with mixed single/dual owners (e.g., 6 single, 4 dual = 14 contacts)
   - Finalize and verify warning shows "Create 14 contact(s) from 10 address(es)?"

3. **Test orphaned records**:
   - Complete lookup on all visible properties
   - Dashboard should show 0 pending (not 6)

4. **Test raw_city column**:
   - Import CSV with abbreviated city names
   - Verify import succeeds without SQL errors
   - Verify city mappings work correctly

## Files to Modify

1. `/home/reedbuntu/projects/sendreed/db/init.js` - Add raw_city column migration
2. `/home/reedbuntu/projects/sendreed/services/csv.js` - Add duplicate checking
3. `/home/reedbuntu/projects/sendreed/routes/realestate.js` - Count expected contacts in finalize
4. `/home/reedbuntu/projects/sendreed/public/js/realist.js` - Update warning message text
5. `/home/reedbuntu/projects/sendreed/FIXES.md` - Mark issue as resolved
