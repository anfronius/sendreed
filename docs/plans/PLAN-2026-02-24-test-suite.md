# PLAN-2026-02-24-test-suite.md

## Goal

Determine whether a test suite is necessary for SendReed and, if so, define exactly what it should cover, how it should be structured, and how to implement it — without over-engineering a solo/small-team internal tool.

---

## Verdict: Yes, a targeted unit test suite is warranted

### Why

The project has **no tests at all** (confirmed in `CLAUDE.md`). That alone is manageable for stable code — but SendReed has several service modules containing non-trivial pure logic that:

1. Process real contact data in bulk (CSV, vCard) — bugs silently corrupt records
2. Use multi-pass fuzzy algorithms (`matcher.js`) that are easy to regress on edge cases
3. Handle security-critical operations (`crypto.js`) where a subtle bug loses all SMTP access
4. Compute derived values (`template.js` `{{years}}`) that go directly into outgoing emails
5. Are actively being extended — FIXES.md still has incomplete items

Testing routes, database queries, or EJS templates would be expensive and low-value. The sweet spot is **pure-function unit tests** for the service layer only.

### What NOT to test

| Layer | Reason to skip |
|---|---|
| Express route handlers | Require full HTTP + session + DB mocking — disproportionate effort |
| EJS templates | Require headless browser or DOM parser — not worth it |
| Database (init.js, queries) | `better-sqlite3` is battle-tested; schema correctness verified at runtime |
| Email sending (email.js) | Requires SMTP mocking; behavior validated manually |
| Cron jobs (cron.js) | Time-dependent, external SMTP dependency |
| Auth/CSRF middleware | Simple guard logic; tested implicitly when running the app |

---

## Current State

- **No test framework, no test scripts, no `tests/` directory**
- `package.json` has no `devDependencies` and no `"test"` script
- Node.js 20 is the runtime — includes a production-ready built-in test runner (`node:test`)
- All service modules use CommonJS (`require`/`module.exports`)
- Target modules are all **pure functions** with no Express or DB dependencies:

| File | Testable exports |
|---|---|
| `services/matcher.js` | `levenshteinDistance`, `normalizeName`, `findMatches` |
| `services/vcard.js` | `parseString`, `normalizePhone` |
| `services/template.js` | `render`, `extractVariables`, `getAvailableVariables` |
| `services/crypto.js` | `encrypt` + `decrypt` round-trip |
| `services/sms.js` | `normalizePhone`, `generateDeepLink`, `buildBatchData` |
| `services/csv.js` | `normalizeHeader`, `suggestMapping`, `suggestCrmlsMapping` |
| `config/ca-cities.js` | `expandCity` |

---

## Steps

### 1. Choose and configure the test framework

**Use Node.js built-in `node:test` + `node:assert`** — zero new dependencies, fully supported in Node 20, stable API.

**File: `package.json`**
Add a `"test"` script:
```json
"scripts": {
  "start": "node server.js",
  "dev": "node --watch server.js",
  "test": "node --test tests/unit/*.test.js"
}
```

No `devDependencies` needed. No install step.

---

### 2. Create the test directory structure

```
tests/
  unit/
    matcher.test.js
    vcard.test.js
    template.test.js
    crypto.test.js
    sms.test.js
    csv.test.js
```

Create `tests/unit/` — no other directories needed for now.

---

### 3. Write `tests/unit/matcher.test.js`

Highest priority — the four-pass Levenshtein algorithm has the most combinatorial edge cases and is used in the critical vCard enrichment pipeline.

Cover:
- `levenshteinDistance`: identical, empty strings, single insertion/deletion/substitution, multi-char distance
- `normalizeName`: suffix stripping (Jr., III, PhD), punctuation, whitespace collapse, null input
- `findMatches` pass 1 (exact): case differences, accent-free match
- `findMatches` pass 2 (normalized): middle name stripping
- `findMatches` pass 3 (initial): last name + first initial
- `findMatches` pass 4 (fuzzy): distance 1, 2, 3; boundary — distance 4 should NOT match
- `findMatches`: no matches when list is empty; deduplication (same contact not matched twice)

---

### 4. Write `tests/unit/vcard.test.js`

Second priority — vCard parsing handles real iPhone export data with many format variations.

Cover:
- `normalizePhone`: 10-digit, 11-digit with `1`, `+1` prefix, `tel:` URI prefix, too-short numbers (returns null), non-digit chars stripped
- `parseString`: minimal valid vCard (FN only), N field (last;first;middle format), multiple TEL entries — mobile preferred over landline, PREF phone selection, EMAIL with `@` validation, missing END:VCARD error handling, folded long lines (RFC 2425 continuation), deriving first/last from FN when N missing

---

### 5. Write `tests/unit/template.test.js`

Cover:
- `render`: basic variable substitution, unknown variable resolves to empty string, null/undefined contact field resolves to empty string, `{{years}}` computed correctly from `purchase_date`, empty template string returns empty, no variables in template (passthrough)
- `extractVariables`: finds all `{{var}}` tokens, deduplicates, returns empty array for no matches
- `getAvailableVariables`: returns correct set for each role, falls back to admin set for unknown role

---

### 6. Write `tests/unit/crypto.test.js`

Cover:
- `encrypt` + `decrypt` round-trip: original text recovered exactly
- `encrypt(null)` returns null, `decrypt(null)` returns null
- `encrypt` output format is `iv_hex:ciphertext_hex` (two colon-separated parts)
- Two `encrypt` calls on same text produce **different** ciphertext (random IV)
- Requires `ENCRYPTION_KEY` env var — set it in the test file: `process.env.ENCRYPTION_KEY = '0'.repeat(32)`

---

### 7. Write `tests/unit/sms.test.js`

Cover:
- `normalizePhone`: 10-digit → `+1XXXXXXXXXX`, 11-digit starting with 1 → `+1XXXXXXXXXX`, non-digit chars stripped, null/empty input → null, international non-US → null
- `generateDeepLink`: valid phone returns `sms:+1...&body=...`, body is URL-encoded, invalid phone returns null
- `buildBatchData`: filters out contacts with no valid phone, maps name/body fields correctly, invalid phone contacts excluded from result

---

### 8. Write `tests/unit/csv.test.js`

Cover:
- `normalizeHeader`: lowercases, strips special chars, collapses to alphanumeric only
- `suggestMapping`: recognizes known aliases (`First Name` → `first_name`, `Email Address` → `email`, etc.), unrecognized headers not included in suggestions, case-insensitive matching
- `suggestCrmlsMapping`: recognizes CRMLS-specific aliases (`Close Date` → `sale_date`, `Close Price` → `sale_price`, etc.)

> Note: `parseFile` and `importContacts` are NOT tested here — they require the filesystem and DB respectively.

---

### 9. Write `tests/unit/cities.test.js` (optional but cheap)

Cover `expandCity` from `config/ca-cities.js`:
- Known abbreviation returns full city name (`'LA'` → `'Los Angeles'`)
- Unknown abbreviation returns input unchanged (passthrough)
- Case sensitivity behavior

---

### 10. Add a `.claude/rules/testing.md` rule file

Document the test conventions so future additions are consistent:
- Test framework: `node:test` + `node:assert`
- Scope: unit tests for pure service functions only
- Pattern: `tests/unit/{module}.test.js`
- Run: `npm test`

---

## Testing (Verification)

After each test file is written:

```bash
# Run all tests
npm test

# Run a single file during development
node --test tests/unit/matcher.test.js
```

All tests should pass green. The test run output via `node:test` uses TAP format and shows pass/fail per `it()` block.

**Expected baseline**: ~50–70 individual test cases across 6–7 files, running in < 1 second with no network or disk I/O.

---

## Risks

| Risk | Mitigation |
|---|---|
| `crypto.test.js` requires `ENCRYPTION_KEY` env var | Set it inline at top of test file with a fixed dummy key |
| `csv.test.js` `suggestMapping` tests may be brittle if aliases change | Tests should explicitly import `COLUMN_ALIASES` from the module, not hardcode expected output |
| Over-testing temptation — adding DB/route tests | Scope rule: only test pure functions; anything needing `getDb()` or `req/res` is out of scope |
| Node's `node:test` glob may need `--experimental-vm-modules` flag | Not needed for CommonJS; only an issue with ESM |
| `vcard.js` `normalizePhone` and `sms.js` `normalizePhone` are two different functions with different behavior | Tests must be kept clearly separate and not confused |
