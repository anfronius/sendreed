# Service Layer Rules
> See also: `sqlite.md` (query patterns services use), `testing.md` (which service functions are unit-testable), `express.md` (how routes call services)

## Architecture
- Business logic lives in `services/` — routes are thin controllers
- Services are plain CommonJS modules exporting functions
- Services call `getDb()` directly — no ORM or abstraction layer
- Routes call services, services call the database

## Email Sending (`services/email.js`)
- Sequential sends with per-provider delay (2-3 seconds between messages)
- Daily limit tracking per user in memory: `Map<userId, { count, date }>`
- On limit hit: pause campaign with `resume_tomorrow` status
- Prevent concurrent campaigns from same user
- Progress reported via callback for SSE streaming:
  ```js
  await sendCampaign(campaignId, user, (progress) => { /* SSE write */ });
  ```
- Campaign states: `draft` → `reviewing` → `sending` → `sent` | `paused` | `resume_tomorrow`
- Recipient states: `pending` → `sent` | `failed` | `excluded`

## SMTP Configuration (`config/providers.json`)
- Provider presets define host, port, secure flag, daily limit, default delay
- Users can override host/port per account
- Transport created at send time with decrypted password — never cached

## CSV Processing (`services/csv.js`)
- Parse with PapaParse: `{ header: true, skipEmptyLines: true }`
- Two-step flow: upload → column mapping → import
- `COLUMN_ALIASES` map normalizes common header variations
- Header normalization: lowercase + strip non-alphanumeric
- Bulk insert via `db.transaction()` for atomicity
- Track import source: `phone_source` / `email_source` field

## vCard Parsing (`services/vcard.js`)
- RFC 2425 line unfolding before parsing
- Split on `BEGIN:VCARD`, parse each block independently
- Extract: FN, N, TEL, EMAIL, ORG properties
- Phone preference: MOBILE/CELL type first, then PREF parameter

## Name Matching (`services/matcher.js`)
- Four-pass algorithm (most strict → most relaxed):
  1. Exact normalized match (stripped suffixes, lowercased)
  2. Stripped middle names match
  3. Last name + first initial match
  4. Levenshtein distance within threshold
- Normalization strips suffixes (Jr., Sr., II, III, Esq, PhD, MD) and punctuation

## Template Rendering (`services/template.js`)
- Variable syntax: `{{variable_name}}`
- Regex: `/\{\{(\w+)\}\}/g`
- Role-specific variable sets — prevent cross-role variable access
- Special computed variables (e.g., `{{years}}` calculated from `purchase_date`)
- Missing variables resolve to empty string, never error

## SMS (`services/sms.js`)
- No API — generates `sms:` deep links for manual sending
- Phone normalization: strip non-digits, prepend `+1` for 10-digit US numbers
- Recipient state: `pending` → `generated` (not `sent`)

## Cron Jobs (`services/cron.js`)
- Schedule: `0 7 * * *` (7 AM Pacific daily)
- Anniversary detection: 7-day lookahead, deduplicated by contact + date
- Morning digest: email summary of upcoming anniversaries to user's own address
- Timezone: `America/Los_Angeles`

## Crypto (`services/crypto.js`)
- AES-256-CBC with random IV per encryption
- Storage format: `iv_hex:ciphertext_hex`
- Only used for SMTP passwords — never for user passwords (those use bcrypt)
