# 9th Set Fix Analysis

## Issues to Address

### 1. Filter persistence issue (Contacts page)
**Problem**: When filtering by empty options like 'has email', entries don't return when clicking 'all clients' until page refresh.
**Likely cause**: JavaScript filter state not properly resetting when switching back to 'all' filter.
**Files to check**: `/public/js/contacts.js`, `/routes/contacts.js`

### 2. User wipe/delete failure (Users page)
**Problem**: Admin cannot wipe data or delete Real Estate user - "Failed to wipe user data" error.
**Likely cause**: SQL foreign key constraints or transaction issues in wipe operation.
**Files to check**: `/routes/api.js` (wipe endpoint), `/routes/admin.js`

### 3. City Mappings button alignment (Import CRMLS page)
**Problem**: "City Mappings" button not centered under city field.
**Likely cause**: CSS flexbox/grid alignment issue.
**Files to check**: `/views/realestate/import-crmls.ejs`, `/public/css/styles.css`

### 4. Apply All Confirmed button issues (Phone matching)
**Problem**: Button not updating dynamically after matches AND still smaller than "Import Another VCard" button.
**Likely cause**: Missing event listener for match events + CSS height mismatch.
**Files to check**: `/public/js/matching.js`, `/views/realestate/phone-matching.ejs`

### 5. Skip button not dynamic (Phone matching - under review)
**Problem**: Skipped contacts don't move back to "no match found" list until refresh.
**Likely cause**: DOM manipulation missing after skip action.
**Files to check**: `/public/js/matching.js`

### 6. Real Estate dashboard stats confusion
**Problem**: "Found" and "Not Found" numbers unclear. Should show: "Properties Pending Lookup", "Clients to be Matched", "Confirmed Clients".
**Likely cause**: Wrong SQL queries or labels.
**Files to check**: `/routes/realestate.js`, `/views/realestate/dashboard.ejs`

### 7. Admin user select bar visibility issues
**Problem**: Should only show on appropriate pages, only show RE users on RE page, clear when switching contexts.
**Likely cause**: Nav partial logic not checking page context properly.
**Files to check**: `/views/partials/nav.ejs`, middleware

### 8. Digest Email Settings box spacing (Anniversaries page)
**Problem**: Random empty top space - should be balanced top/bottom or removed.
**Likely cause**: CSS padding/margin inconsistency.
**Files to check**: `/views/realestate/anniversaries.ejs`, CSS

### 9. Number badge spacing (Multiple pages)
**Problem**: Numbers next to titles like "Today (5)" need more space.
**Likely cause**: CSS margin on `.badge` or count spans.
**Files to check**: CSS, multiple view files

### 10. Fields tab not affecting displayed fields
**Problem**: Changing field visibility in Fields management doesn't affect what shows on clients page.
**Likely cause**: Field visibility not being checked in query or template rendering.
**Files to check**: `/routes/contacts.js`, `/views/contacts/list.ejs`, `/db/init.js`

---

## Implementation Plan

Will address fixes in logical order:
1. **Quick CSS fixes** (3, 8, 9) - styling only
2. **JavaScript dynamic updates** (1, 4, 5) - client-side state management
3. **Backend logic** (2, 6, 10) - database queries and data operations
4. **Conditional visibility** (7) - template logic

Each fix will be implemented, tested, and committed separately.
