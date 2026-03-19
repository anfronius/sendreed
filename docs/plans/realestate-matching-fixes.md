# Real Estate Contact Matching System Fixes

**Date:** 2026-03-19  
**Status:** Draft  
**Priority:** High  
**Author:** Claude Code Analysis

## Executive Summary

Analysis of the SendReed database (sendreedcopy.db) and matching codebase has identified **four critical issues** with the real estate contact matching system:

1. **Duplicate Imported Contacts** - User imported same vCard file 3x, creating 3-12x duplicates
2. **Poor Matching Algorithm Performance** - Missing obvious exact matches, generating false positives
3. **Inflated Confirmation Counts** - Confirming 4 matches shows 20+ applied due to duplicates
4. **Inconsistent Match Count Display** - Dashboard shows 2 matched vs 18 on main page

All issues are interconnected and stem from:
- No deduplication during vCard import (fixed in recent commit but not retroactive)
- Matching algorithm treating first_name field as atomic (missing middle initial handling)
- Multiple phone_matches entries per contact due to duplicate imported contacts
- Confusion between "matched contacts" (with vcard data) vs "pending matches" (in review)

---

## Database Analysis Results

### User Environment (user_id: 2 - troyreedsellshomes@yahoo.com)

**Contact Imports:**
- Import #4 (2026-03-07 22:54:51): "All Contacts.vcf" - 2,418 contacts
- Import #3 (2026-03-07 22:53:52): "All iCloud.vcf" - 1,584 contacts  
- Import #2 (2026-03-07 22:53:15): "All iCloud.vcf" - 1,584 contacts (**DUPLICATE**)

**Total:** 5,586 imported contacts, but ~3,168 are duplicates (56% duplication rate)

**Duplicate Examples:**
- "Agent - Elle Thompson" (phone 8185909970): **12 copies**
- "Client - Henry" (phone 5622395697): **12 copies**
- "Client - Ana" (phone 9097750753): **9 copies**
- 17+ other contacts with 3-6 duplicates each

**Existing Contacts:**
- Total contacts in DB: **218**
- CRMLS properties: 9 (all in "pending" realist_lookup_status, 0 found)
- Phone matches table: **42 entries** (all unconfirmed)
  - Distinct contacts with matches: **21**
  - Average matches per contact: **2** (due to duplicate imported contacts)
- Unmatched contacts: **197**

**Name Format Mismatches:**
- Contacts have middle initials in first_name: "Michael V", "Ryan J", "Alejandro R S"
- Imported contacts often have prefixes: "Client - Ana", "Agent - John Aguirre", "LD - Joanna"
- Many imported contacts have no last_name parsed (VCF parsing issues)

### Specific Match Quality Issues

**Example 1: Missed Match (Michael V Aguirre)**
- Contact in DB: first_name="Michael V", last_name="Aguirre"
- Imported options with "Aguirre" last name: 7 entries (none matched)
- Reason: First name "Michael V" doesn't match "Agent - John", "LD - Joanna", or "'Karina Aguirre '"

**Example 2: False Positives**
- Contact: first_name="Julio F", last_name="Gomez" → Matched to imported "Justin Gomez" (40% confidence)
- Contact: first_name="Susan", last_name="Gomez" → Also matched to "Justin Gomez" (40% confidence)
- Contact: first_name="Mark M", last_name="Leod" → Matched to "Mark Woods" (40% confidence)

**Example 3: Correct but Duplicated Matches**
- Contact #182: "Michael Gallegos" has 2 phone_matches entries (both pointing to same imported "Michael Gallegos")
- All 21 contacts with matches have 2 entries each → confirming 4 matches applies 8+ duplicates

---

## Root Cause Analysis

### Issue #1: Duplicate Imported Contacts

**Cause:**  
- User uploaded "All iCloud.vcf" twice (22:53:15 and 22:53:52) within 37 seconds
- Recent deduplication code (lines 636-657 in routes/realestate.js) was added AFTER these imports
- No retroactive cleanup was performed

**Impact:**
- 3,168+ duplicate imported_contacts entries
- Each existing contact matched to 2-12 duplicate imported contacts
- phone_matches table has 42 entries for 21 distinct contacts
- User sees "3 of same contact everywhere" when reviewing matches

**Evidence:**
```sql
-- Sample duplicate: "Client - Henry" appears 12 times
SELECT full_name, phone, COUNT(*) FROM imported_contacts 
WHERE import_id IN (2,3,4) 
GROUP BY full_name, phone HAVING COUNT(*) > 1
```

---

### Issue #2: Matching Algorithm Failures

**Cause:**  
The matcher.js algorithm has THREE blind spots:

#### 2a. Middle Initial Handling
- Contacts store middle initials in first_name: "Michael V", "Ryan J", "Alejandro R S"
- Imported contacts often lack last_name: first_name="Justin Gomez", last_name=null
- Normalizer strips suffixes but doesn't handle initials intelligently

**Example:**
- Contact: "Ryan J Garcia"
- Imported: first_name="Ruven Garcia", last_name=null
- Normalized: "ryan j garcia" vs "ruven garcia"
- Result: 40% fuzzy match (Levenshtein distance=3) — should be no match

#### 2b. Prefix/Label Handling
- Many imported contacts have category prefixes: "Client - ", "Agent - ", "LD - "
- These are stored in first_name or full_name
- Normalizer doesn't strip these → inflates edit distance

**Example:**
- Contact: "Chien V Pham"
- Imported: "Client - Anh Pham"
- Normalized: "chien v pham" vs "client anh pham"
- Result: 70% match (stripped middle names) — WRONG PERSON

#### 2c. VCard Parsing Issues
- Many contacts have full names unparsed: first_name="Justin Gomez", last_name=null
- When VCF lacks structured N: field, fallback splits FN: by whitespace
- Last word becomes last_name, rest becomes first_name
- Middle names absorbed into first_name → breaks matching

**Evidence:**
```javascript
// vcard.js lines 136-143: Fallback parsing
if (contact.full_name && !contact.first_name && !contact.last_name) {
  const parts = contact.full_name.trim().split(/\s+/);
  if (parts.length > 1) {
    contact.last_name = parts.pop();
    contact.first_name = parts.join(' ');  // ← All remaining words!
  }
}
```

**Example:**  
VCF entry: `FN:Justin Gomez`  
Parsed: first_name="Justin", last_name="Gomez" ✓  
But: `FN:Client - Oscar`  
Parsed: first_name="Client -", last_name="Oscar" ✗

---

### Issue #3: Inflated Confirmation Counts

**Cause:**  
- User confirms 4 matches in UI
- Each match has 2-3 duplicate imported contacts in phone_matches table
- `/matching/apply` endpoint processes ALL confirmed matches without deduplication
- Result: 4 UI confirmations → 8-12 DB updates

**Code Path:**
1. User clicks "Confirm" on 4 matches → sets confirmed_at timestamp
2. User clicks "Apply All Confirmed"
3. POST /realestate/matching/apply runs:
```sql
SELECT pm.id, pm.contact_id, pm.imported_contact_id, ...
FROM phone_matches pm
WHERE confirmed_at IS NOT NULL OR confidence_score >= 70
```
4. Returns 20+ rows for 4 distinct contacts (due to duplicates)
5. Updates same contact multiple times with same phone/email

**Impact:**
- Confusing UX: "Applied 20 matches" when user expected 4
- Potential data integrity issues if multiple imported contacts have different phone/email values
- Wasted processing (same contact updated 3x with identical data)

---

### Issue #4: Inconsistent Match Count Display

**Cause:**  
Two different definitions of "matched":

**Dashboard Count (shows 2):**
```sql
-- /realestate/matching page (line 952)
SELECT COUNT(*) FROM contacts
WHERE phone IS NOT NULL AND email IS NOT NULL
  AND (phone_source = 'vcard' OR email_source = 'vcard')
```
= Contacts that have BOTH phone AND email from a vcard source

**Main Page Count (shows 18):**
```sql
-- /realestate dashboard (line 162)
SELECT COUNT(DISTINCT c.id) FROM contacts c
JOIN phone_matches pm ON pm.contact_id = c.id
WHERE pm.confirmed_at IS NOT NULL
  AND (c.phone_source = 'vcard' OR c.email_source = 'vcard')
```
= Contacts with confirmed matches that have EITHER phone OR email from vcard

**Why the discrepancy:**
- Dashboard requires BOTH phone AND email
- Main page requires EITHER phone OR email + confirmed match
- User has 18 contacts with confirmed matches, but only 2 have both phone + email

**Additional Issue:**  
The main page query joins phone_matches but doesn't deduplicate by contact_id properly, potentially inflating count due to duplicate matches.

---

## Proposed Fixes

### Fix #1: Retroactive Deduplication of Imported Contacts

**Approach:**  
Run a one-time cleanup script to remove duplicate imported_contacts and fix phone_matches.

**Implementation:**
```javascript
// New endpoint: POST /realestate/import-vcard/dedup (already exists in recent commit!)
// Enhancement needed: More aggressive deduplication

const duplicates = db.prepare(`
  SELECT full_name, phone, email, MIN(id) as keep_id, 
         GROUP_CONCAT(id) as all_ids, COUNT(*) as dup_count
  FROM imported_contacts
  WHERE import_id IN (SELECT id FROM contact_imports WHERE imported_by = ?)
  GROUP BY 
    LOWER(TRIM(full_name)), 
    COALESCE(phone, ''), 
    COALESCE(email, '')
  HAVING COUNT(*) > 1
`).all(userId);

for (const dup of duplicates) {
  const idsToDelete = dup.all_ids.split(',').filter(id => id != dup.keep_id);
  
  // Update phone_matches to point to kept record
  db.prepare(`
    UPDATE phone_matches 
    SET imported_contact_id = ? 
    WHERE imported_contact_id IN (${idsToDelete.map(() => '?').join(',')})
  `).run(dup.keep_id, ...idsToDelete);
  
  // Delete duplicates
  db.prepare(`
    DELETE FROM imported_contacts 
    WHERE id IN (${idsToDelete.map(() => '?').join(',')})
  `).run(...idsToDelete);
}

// Remove duplicate phone_matches for same contact
db.prepare(`
  DELETE FROM phone_matches
  WHERE id NOT IN (
    SELECT MIN(id) FROM phone_matches
    GROUP BY contact_id, imported_contact_id
  )
`).run();
```

**Expected Outcome:**
- Reduce 5,586 imported contacts to ~2,418 (remove ~3,168 duplicates)
- Reduce 42 phone_matches to ~21 (one per distinct contact)
- User stops seeing "3 of same contact everywhere"

**Risks:**
- If duplicate imports have different phone/email values, we might lose data
- Mitigation: Log any conflicts before deletion, prefer records with more complete data

---

### Fix #2: Improve Matching Algorithm

**Approach:**  
Enhance matcher.js to handle middle initials, prefixes, and VCF parsing issues.

**Implementation Steps:**

#### Step 2a: Strip Category Prefixes
```javascript
// Add to normalizeName() function
const CATEGORY_PREFIXES = /^(client|agent|ld|lender|referral|electrician|plumber|cousin|friend|better|loan depot|estate planning|wa[mr])\s*[-:]\s*/gi;

function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(CATEGORY_PREFIXES, '')  // ← NEW: Remove "Client - ", "Agent - ", etc.
    .replace(SUFFIXES, '')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```

#### Step 2b: Intelligently Handle Middle Initials
```javascript
// New helper function
function normalizeForMatching(first, last) {
  // Build full name, normalize, then strip middle initials
  const full = [first, last].filter(Boolean).join(' ');
  const normalized = normalizeName(full);
  
  // Strip single-letter tokens (middle initials)
  const parts = normalized.split(/\s+/);
  const filtered = parts.filter(p => p.length > 1);  // Remove single letters
  
  return filtered.join(' ');
}

// Use in findMatches():
const importedCleaned = normalizeForMatching(importedContact.first_name, importedContact.last_name);
const contactCleaned = normalizeForMatching(contact.first_name, contact.last_name);

// Pass 1: Exact match on cleaned names
if (importedCleaned && contactCleaned && importedCleaned === contactCleaned) {
  matches.push({ contact_id: contact.id, confidence: 100, match_type: 'exact' });
  continue;
}
```

#### Step 2c: Add Last Name + Fuzzy First Name Pass
```javascript
// New Pass 3.5: Last name exact + first name fuzzy (between current Pass 3 and 4)
const contactLastNorm = normalizeName(contact.last_name || '');
const importedLastNorm = normalizeName(importedContact.last_name || '');

if (contactLastNorm && importedLastNorm && contactLastNorm === importedLastNorm) {
  // Last names match exactly, check if first names are similar
  const contactFirstNorm = normalizeName(contact.first_name || '');
  const importedFirstNorm = normalizeName(importedContact.first_name || '');
  
  if (contactFirstNorm && importedFirstNorm) {
    const dist = levenshteinDistance(contactFirstNorm, importedFirstNorm);
    if (dist <= 2 && dist > 0) {  // Similar but not exact
      matches.push({ contact_id: contact.id, confidence: 60, match_type: 'fuzzy_first' });
      continue;
    }
  }
}
```

**Expected Outcome:**
- "Michael V Aguirre" no longer matches "Client - Ana Pham"
- "Ryan J Garcia" no longer matches "Ruven Garcia"
- Reduce false positive rate from ~50% to <10%
- Increase true positive rate for contacts with middle initials

**Risks:**
- More aggressive normalization might miss legitimate matches
- Mitigation: Preserve existing 4-pass structure, add new passes incrementally

---

### Fix #3: Deduplicate Matches on Confirmation

**Approach:**  
When user confirms matches or clicks "Apply All", deduplicate by contact_id before processing.

**Implementation:**

#### Option A: Prevent Duplicates at Insertion (Proactive)
```javascript
// In routes/realestate.js POST /import-vcard/upload, line 703:
const insertMatch = db.prepare(
  `INSERT INTO phone_matches (contact_id, imported_contact_id, match_type, confidence_score) 
   VALUES (?, ?, ?, ?)
   ON CONFLICT(contact_id, imported_contact_id) DO NOTHING`  // ← Requires UNIQUE constraint
);
```

**Schema Change Required:**
```sql
CREATE UNIQUE INDEX idx_phone_matches_unique 
ON phone_matches(contact_id, imported_contact_id);
```

#### Option B: Deduplicate on Apply (Reactive)
```javascript
// In routes/realestate.js POST /matching/apply, line 993:
const matches = db.prepare(`
  SELECT 
    MIN(pm.id) as id,  -- Keep first match
    pm.contact_id, 
    pm.imported_contact_id,
    ic.phone as imported_phone, 
    ic.email as imported_email
  FROM phone_matches pm
  JOIN imported_contacts ic ON pm.imported_contact_id = ic.id
  JOIN contact_imports ci ON ic.import_id = ci.id
  JOIN contacts c ON pm.contact_id = c.id
  WHERE ci.imported_by = ?
    AND (pm.confirmed_at IS NOT NULL OR pm.confidence_score >= 70)
  GROUP BY pm.contact_id  -- ← NEW: Ensure one match per contact
  ORDER BY pm.id
`).all(userId);
```

**Recommendation:** Use **Option A** (prevent duplicates) + **Fix #1** (clean existing data)

**Expected Outcome:**
- Confirming 4 matches applies exactly 4 updates
- User sees accurate counts in success messages
- No duplicate matches created in future imports

---

### Fix #4: Align Match Count Definitions

**Approach:**  
Use consistent definition across dashboard and main page.

**Implementation:**

#### Option A: Change Dashboard to Match Main Page
```javascript
// In routes/realestate.js GET /matching, line 952:
const matchedCount = db.prepare(`
  SELECT COUNT(DISTINCT c.id) as c FROM contacts c
  WHERE owner_id = ?
    AND ((phone IS NOT NULL AND phone != '') OR (email IS NOT NULL AND email != ''))
    AND (phone_source = 'vcard' OR email_source = 'vcard')
`).get(userId).c;
```
= Contacts with EITHER phone OR email from vcard (matches main page logic)

#### Option B: Change Main Page to Match Dashboard
```javascript
// In routes/realestate.js GET /realestate (dashboard), line 162:
const confirmedClients = db.prepare(`
  SELECT COUNT(DISTINCT c.id) as count
  FROM contacts c
  WHERE c.owner_id = ?
    AND c.phone IS NOT NULL AND c.phone != ''
    AND c.email IS NOT NULL AND c.email != ''
    AND (c.phone_source = 'vcard' OR c.email_source = 'vcard')
`).get(userId);
```
= Contacts with BOTH phone AND email from vcard

**Recommendation:** Use **Option A** — EITHER phone OR email is more useful for real estate agents

**Additional Fix:**  
Remove JOIN on phone_matches from main page query (line 162) if using Option A, since it's redundant and potentially inflates count:

```javascript
// BEFORE:
const confirmedClients = db.prepare(`
  SELECT COUNT(DISTINCT c.id) as count
  FROM contacts c
  JOIN phone_matches pm ON pm.contact_id = c.id  -- ← Remove this
  WHERE pm.confirmed_at IS NOT NULL
    AND (c.phone_source = 'vcard' OR c.email_source = 'vcard')
    AND c.owner_id = ?
`).get(userId);

// AFTER:
const confirmedClients = db.prepare(`
  SELECT COUNT(DISTINCT c.id) as count
  FROM contacts c
  WHERE c.owner_id = ?
    AND ((c.phone IS NOT NULL AND c.phone != '') OR (c.email IS NOT NULL AND c.email != ''))
    AND (c.phone_source = 'vcard' OR c.email_source = 'vcard')
`).get(userId);
```

**Expected Outcome:**
- Dashboard "Matched" count matches main page "Confirmed Clients" count
- User has consistent understanding of matching progress
- Counts update correctly when matches are applied

---

## Testing Plan

### Test 1: Verify Deduplication
1. Run dedup endpoint on production DB copy
2. Verify imported_contacts count drops from 5,586 to ~2,418
3. Verify phone_matches count drops from 42 to 21
4. Check that no matches were lost (all contacts still have at least one match)
5. Spot-check 10 random contacts to ensure correct imported contact was kept

### Test 2: Verify Improved Matching
1. Create test dataset with middle initials: "Michael V Aguirre", "Ryan J Garcia"
2. Create test vCard imports with prefixes: "Client - Michael Aguirre", "Agent - Ryan Garcia"
3. Run matching algorithm
4. Verify no false positives (different first names shouldn't match)
5. Verify true positives (same person with different formatting matches at 70%+ confidence)

### Test 3: Verify Confirmation Count Accuracy
1. Identify 5 distinct contacts with confirmed matches
2. Note their current phone/email values
3. Click "Apply All Confirmed"
4. Verify exactly 5 updates occur (check log message)
5. Verify each contact updated exactly once
6. Verify phone/email values match expected imported data

### Test 4: Verify Count Consistency
1. Apply all matches for a test user
2. Check "Matched" count on /realestate/matching page
3. Check "Confirmed Clients" count on /realestate main page
4. Verify counts match
5. Add one more vCard match and apply
6. Verify both counts increment by 1

### Test 5: End-to-End User Flow
1. Import new vCard file with 100 contacts
2. Verify no duplicates created (check import summary)
3. Review auto-matched contacts
4. Confirm 10 low-confidence matches
5. Skip 5 incorrect matches
6. Manually assign 3 unmatched contacts
7. Apply all confirmed
8. Verify counts update correctly
9. Verify no duplicate phone_matches created

---

## Implementation Phases

### Phase 1: Data Cleanup (Immediate - Day 1)
- [ ] Create backup of production database
- [ ] Enhance /import-vcard/dedup endpoint with aggressive deduplication
- [ ] Run dedup on production for affected user
- [ ] Add UNIQUE index on phone_matches(contact_id, imported_contact_id)
- [ ] Verify cleanup with spot checks
- **Estimated Time:** 3-4 hours
- **Risk Level:** Medium (data deletion, but have backup)

### Phase 2: Matching Algorithm Fixes (Day 2-3)
- [ ] Add category prefix stripping to normalizeName()
- [ ] Add normalizeForMatching() helper with middle initial handling
- [ ] Refactor findMatches() to use new normalization
- [ ] Add Pass 3.5 (last name exact + fuzzy first name)
- [ ] Write unit tests for new matching logic
- [ ] Test on sample dataset (20 known good/bad matches)
- **Estimated Time:** 8-10 hours
- **Risk Level:** Low (matcher.js is unit-testable, can validate before deploy)

### Phase 3: Count Consistency Fixes (Day 4)
- [ ] Update matchedCount query on /matching page
- [ ] Update confirmedClients query on /realestate page
- [ ] Test both pages show same count
- [ ] Update frontend to reflect accurate counts
- **Estimated Time:** 2-3 hours
- **Risk Level:** Low (display logic only)

### Phase 4: Prevent Future Duplicates (Day 4-5)
- [ ] Add ON CONFLICT to phone_matches insertion
- [ ] Add deduplication to /matching/apply endpoint
- [ ] Test with multiple vCard imports (simulate user uploading same file 3x)
- [ ] Verify no duplicates created
- **Estimated Time:** 3-4 hours
- **Risk Level:** Low (INSERT query changes, but UNIQUE index prevents bad data)

### Phase 5: Testing & Validation (Day 5-6)
- [ ] Run all 5 test plans
- [ ] Fix any issues found
- [ ] User acceptance testing with affected user
- [ ] Monitor production for 48 hours after deploy
- **Estimated Time:** 6-8 hours
- **Risk Level:** Low (validation only)

---

## Migration Script

```javascript
// db/migrations/001_fix_phone_matches.js
const { getDb } = require('../db/init');

function runMigration() {
  const db = getDb();
  
  console.log('Starting phone_matches deduplication...');
  
  // Step 1: Find all users with imported contacts
  const users = db.prepare(`
    SELECT DISTINCT imported_by as user_id 
    FROM contact_imports
  `).all();
  
  for (const user of users) {
    console.log(`Processing user ${user.user_id}...`);
    
    // Step 2: Deduplicate imported_contacts
    const duplicates = db.prepare(`
      SELECT 
        LOWER(TRIM(full_name)) as name_key,
        COALESCE(phone, '') as phone_key,
        COALESCE(email, '') as email_key,
        MIN(id) as keep_id,
        GROUP_CONCAT(id) as all_ids,
        COUNT(*) as dup_count
      FROM imported_contacts
      WHERE import_id IN (
        SELECT id FROM contact_imports WHERE imported_by = ?
      )
      GROUP BY name_key, phone_key, email_key
      HAVING COUNT(*) > 1
    `).all(user.user_id);
    
    let totalDupsRemoved = 0;
    
    for (const dup of duplicates) {
      const allIds = dup.all_ids.split(',').map(id => parseInt(id));
      const idsToDelete = allIds.filter(id => id !== dup.keep_id);
      
      if (idsToDelete.length === 0) continue;
      
      console.log(`  Deduplicating "${dup.name_key}" - keeping id ${dup.keep_id}, removing ${idsToDelete.length} duplicate(s)`);
      
      const placeholders = idsToDelete.map(() => '?').join(',');
      
      // Update phone_matches to point to kept record
      const updateStmt = db.prepare(`
        UPDATE phone_matches 
        SET imported_contact_id = ? 
        WHERE imported_contact_id IN (${placeholders})
      `);
      updateStmt.run(dup.keep_id, ...idsToDelete);
      
      // Delete duplicate imported contacts
      const deleteStmt = db.prepare(`
        DELETE FROM imported_contacts 
        WHERE id IN (${placeholders})
      `);
      deleteStmt.run(...idsToDelete);
      
      totalDupsRemoved += idsToDelete.length;
    }
    
    console.log(`  Removed ${totalDupsRemoved} duplicate imported contacts`);
    
    // Step 3: Deduplicate phone_matches for this user
    const beforeCount = db.prepare(`
      SELECT COUNT(*) as c FROM phone_matches pm
      JOIN contacts c ON pm.contact_id = c.id
      WHERE c.owner_id = ?
    `).get(user.user_id).c;
    
    db.prepare(`
      DELETE FROM phone_matches
      WHERE id NOT IN (
        SELECT MIN(pm.id) 
        FROM phone_matches pm
        JOIN contacts c ON pm.contact_id = c.id
        WHERE c.owner_id = ?
        GROUP BY pm.contact_id, pm.imported_contact_id
      )
    `).run(user.user_id);
    
    const afterCount = db.prepare(`
      SELECT COUNT(*) as c FROM phone_matches pm
      JOIN contacts c ON pm.contact_id = c.id
      WHERE c.owner_id = ?
    `).get(user.user_id).c;
    
    console.log(`  Removed ${beforeCount - afterCount} duplicate phone_matches`);
  }
  
  // Step 4: Add UNIQUE index
  try {
    db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_matches_unique 
      ON phone_matches(contact_id, imported_contact_id)
    `).run();
    console.log('Created UNIQUE index on phone_matches');
  } catch (err) {
    if (!err.message.includes('already exists')) {
      console.error('Failed to create index:', err.message);
    }
  }
  
  console.log('Migration complete!');
}

module.exports = { runMigration };

// Run if called directly
if (require.main === module) {
  runMigration();
}
```

**Usage:**
```bash
node db/migrations/001_fix_phone_matches.js
```

---

## Monitoring & Rollback

### Monitoring Metrics
- [ ] Count of imported_contacts before/after dedup
- [ ] Count of phone_matches before/after dedup
- [ ] False positive rate (manual review of 50 random matches)
- [ ] User satisfaction (qualitative feedback after fixes)

### Rollback Plan
If issues arise:

1. **Database Rollback:** Restore from backup taken in Phase 1
2. **Code Rollback:** 
   - Revert matcher.js changes via git
   - Revert route changes via git
   - Restart server
3. **Partial Rollback:**
   - Keep data cleanup (Phase 1)
   - Revert algorithm changes (Phase 2)
   - Allows user to continue working while we debug algorithm

### Success Criteria
- [ ] Zero duplicate imported contacts remain
- [ ] Each contact has max 1 phone_match entry
- [ ] False positive match rate < 10%
- [ ] Dashboard and main page show same "matched" count
- [ ] User confirms matching system works correctly

---

## Open Questions

1. **VCard Parsing:** Should we re-parse all imported vCards with improved parser, or just apply to future imports?
   - **Recommendation:** Future imports only (less risk, existing data already reviewed)

2. **Match Confidence Thresholds:** Current auto-confirm threshold is 70%. Should we raise it to 80% after algorithm improvements?
   - **Recommendation:** Keep at 70% initially, monitor false positive rate, adjust if needed

3. **Manual Match Workflow:** Should we allow users to create multiple manual matches per contact (e.g., one for phone, one for email)?
   - **Recommendation:** No - current "one match per contact" model is simpler and prevents confusion

4. **Import Limits:** Should we prevent users from importing the same vCard file multiple times?
   - **Recommendation:** Yes - add filename + hash check, warn user if uploading duplicate file

5. **Orphaned Matches:** What should happen to phone_matches when an imported_contact is deleted?
   - **Current:** CASCADE delete (foreign key constraint)
   - **Recommendation:** Keep current behavior, but log deletions for audit

---

## Files to Modify

### Core Changes
1. **services/matcher.js** (Phases 2)
   - Add category prefix stripping
   - Add middle initial handling
   - Add last name + fuzzy first name pass

2. **routes/realestate.js** (Phases 1, 3, 4)
   - Enhance deduplication endpoint
   - Update matchedCount query (matching page)
   - Add ON CONFLICT to phone_matches insertion
   - Deduplicate in /matching/apply endpoint

3. **routes/api.js** (Phase 4)
   - Update /api/match/:contactId/manual to prevent duplicates

4. **db/init.js** (Phase 1)
   - Add UNIQUE index migration

### Testing
5. **tests/unit/matcher.test.js** (Phase 2)
   - Add tests for category prefix stripping
   - Add tests for middle initial handling
   - Add tests for new matching passes

### Documentation
6. **docs/architecture.md** (Phase 5)
   - Document matching algorithm improvements
   - Document deduplication strategy

7. **CHANGELOG.md** (Phase 5)
   - Add entry for matching system fixes

---

## Estimated Total Time

- **Phase 1 (Cleanup):** 3-4 hours
- **Phase 2 (Algorithm):** 8-10 hours  
- **Phase 3 (Count Consistency):** 2-3 hours
- **Phase 4 (Prevent Duplicates):** 3-4 hours
- **Phase 5 (Testing):** 6-8 hours

**Total:** 22-29 hours (~3-4 days of focused work)

---

## Next Steps

1. **User Confirmation:**
   - Share this plan with user
   - Confirm priority (all fixes or subset?)
   - Confirm acceptable downtime window for Phase 1 (data cleanup)

2. **Backup Production DB:**
   - Download current sendreed.db
   - Store in secure location
   - Verify backup is readable

3. **Implement Phase 1:**
   - Run migration script on production DB copy
   - Validate results
   - Get user approval before applying to production

4. **Proceed with Phases 2-5:**
   - Follow implementation plan sequentially
   - Test each phase before proceeding
   - Deploy incrementally with rollback plan ready

---

**END OF PLAN**
