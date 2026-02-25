# Testing Rules

## Framework
- `node:test` (built-in) + `node:assert` — zero external test dependencies
- CommonJS in test files — matches the project
- Run all: `npm test` → `node --test tests/unit/*.test.js`
- Run one: `node --test tests/unit/{module}.test.js`

## Scope
- **Unit tests only** — pure functions in `services/` and `config/`
- **Never test**: route handlers, DB queries, EJS templates, email sending, cron jobs, middleware
- If a function calls `getDb()`, `req`, `res`, `fs`, or `nodemailer` — it's out of scope

## Testable Modules
| Module | Testable Exports |
|---|---|
| `services/matcher.js` | `levenshteinDistance`, `normalizeName`, `findMatches` |
| `services/vcard.js` | `parseString`, `normalizePhone` |
| `services/template.js` | `render`, `extractVariables`, `getAvailableVariables` |
| `services/crypto.js` | `encrypt`, `decrypt` (round-trip) |
| `services/sms.js` | `normalizePhone`, `generateDeepLink`, `buildBatchData` |
| `services/csv.js` | `normalizeHeader`, `suggestMapping`, `suggestCrmlsMapping` |
| `config/ca-cities.js` | `expandCity` |

## File Structure
```
tests/
  unit/
    matcher.test.js
    vcard.test.js
    template.test.js
    crypto.test.js
    sms.test.js
    csv.test.js
    cities.test.js
```

## Conventions
- One `describe()` block per exported function
- One `it()` block per behavior — descriptive name starting with "should"
- Test edge cases explicitly: null, undefined, empty string, empty array, boundary values
- No timers, no network, no disk I/O — every file completes in under 100ms
- For `crypto.test.js`: set `process.env.ENCRYPTION_KEY` before `require()`
