# CLAUDE.md — Outreach Service Platform

## Project Overview

A unified outreach platform serving two clients through a single campaign interface. Both clients can send emails and text messages to their contact lists using customizable templates with per-recipient variables. The app is containerized with Docker and runs on either Render (cloud) or a self-hosted Windows 11 Pro laptop via WSL2 (Ubuntu 22.04) with Caddy for HTTPS.

### Clients

- **Client A — Nonprofit Political Outreach**: Sends templated emails/texts to politicians (up to 500 per campaign). Uses Outlook for email. Phone numbers come from CSV or manual entry.
- **Client B — California Real Estate Agent**: Sends holiday greetings and home purchase anniversary messages to past clients (up to 200). Uses Yahoo Mail for email. iPhone number for texts via SMS deep links. Data pipeline: CRMLS property import → Realist manual owner lookup → vCard phone matching → email capture.

### Key Design Principles

- **Unified but flexible**: Same campaign interface, different variables and data sources per client
- **Both channels everywhere**: Every client can use email AND SMS
- **Infrastructure-agnostic**: One Docker image runs on Render or WSL2 with only env var differences
- **Minimal cost**: Under $7.25/mo on Render, ~$3–5/mo self-hosted. No paid SMS API.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 LTS |
| Framework | Express.js |
| Database | SQLite via `better-sqlite3` (WAL mode enabled) |
| Auth | `express-session` + `bcrypt` (session-based login, SQLite session store) |
| Email — Nonprofit | Nodemailer via Outlook SMTP (supports Outlook.com and Microsoft 365) |
| Email — Real Estate | Nodemailer via Yahoo SMTP (free Yahoo Mail + App Password) |
| SMS (both) | `sms:` URI deep links — opens native Messages app, zero API cost |
| Scheduling | `node-cron` (daily anniversary/holiday checks) |
| CSV Parsing | `papaparse` |
| vCard Parsing | `vcf-parse` or custom VCF 3.0/4.0 parser |
| Frontend | EJS templates + vanilla JS (no framework) |
| Containerization | Docker (identical image for both targets) |
| Reverse Proxy | Caddy (self-hosted only; Render handles SSL natively) |
| Cloud Hosting | Render Web Service (Starter $7/mo) |
| Self-Hosting | Win 11 Pro → WSL2 Ubuntu 22.04 → Docker → Caddy → DDNS via Archer BE3600 |

### Core Dependencies

```json
{
  "dependencies": {
    "express": "^4.x",
    "better-sqlite3": "^11.x",
    "express-session": "^1.x",
    "bcrypt": "^5.x",
    "ejs": "^3.x",
    "papaparse": "^5.x",
    "nodemailer": "^6.x",
    "node-cron": "^3.x",
    "connect-sqlite3": "^0.x"
  }
}
```

---

## Project Structure

```
outreach-platform/
├── CLAUDE.md
├── Dockerfile
├── docker-compose.yml          # Self-hosted: Caddy + app
├── Caddyfile                   # Self-hosted: DDNS domain → reverse_proxy app:3000
├── .env.example
├── package.json
├── server.js                   # Express app entry point
├── db/
│   └── init.js                 # SQLite schema initialization
├── config/
│   ├── smtp.js                 # Provider-specific SMTP factory (Outlook.com, M365, Yahoo)
│   └── providers.json          # SMTP host/port/tls presets per provider
├── middleware/
│   ├── auth.js                 # Session auth + role-based route guards
│   ├── csrf.js                 # CSRF protection
│   └── validate.js             # Input sanitization
├── routes/
│   ├── auth.js                 # /auth — login, logout, sessions
│   ├── admin.js                # /admin — operator dashboard
│   ├── dashboard.js            # /dashboard — role-aware client home
│   ├── campaign.js             # /campaign — unified create/preview/send
│   ├── contacts.js             # /contacts — list, edit, import
│   ├── realestate.js           # /realestate — Realist lookup, anniversaries, holidays
│   └── api.js                  # /api — AJAX endpoints
├── services/
│   ├── email.js                # Nodemailer dispatch engine (sequential, rate-limited, SSE progress)
│   ├── sms.js                  # SMS deep link generator + batch page builder
│   ├── template.js             # {{variable}} parser and renderer
│   ├── csv.js                  # CSV upload + column mapping
│   ├── vcard.js                # vCard parser + contact extraction
│   ├── matcher.js              # Four-pass name matching (exact → normalized → initial → fuzzy)
│   ├── cron.js                 # Daily anniversary + holiday checker
│   └── crypto.js               # Encrypt/decrypt SMTP credentials at rest
├── views/
│   ├── layout.ejs              # Base layout with role-adaptive nav
│   ├── login.ejs
│   ├── admin/
│   │   ├── dashboard.ejs
│   │   ├── users.ejs
│   │   └── smtp-config.ejs
│   ├── campaign/
│   │   ├── create.ejs          # Unified: channel → template → contacts → preview → send
│   │   ├── preview.ejs
│   │   ├── progress.ejs        # Real-time SSE progress for email sends
│   │   ├── sms-batch.ejs       # Mobile-optimized SMS deep link list
│   │   └── history.ejs
│   ├── contacts/
│   │   ├── list.ejs            # Editable table with inline phone/email entry
│   │   ├── import-csv.ejs      # Column mapping UI
│   │   └── import-vcard.ejs
│   ├── realestate/
│   │   ├── realist-lookup.ejs  # Copy-paste address → enter owner name workflow
│   │   ├── phone-matching.ejs  # Three-section review: confirmed/review/unmatched
│   │   ├── anniversaries.ejs   # Daily digest: today/this week/completed
│   │   └── holidays.ejs        # Calendar + custom dates
│   └── partials/
│       ├── nav.ejs
│       ├── flash.ejs
│       └── pagination.ejs
├── public/
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── campaign.js         # Campaign creation client-side logic
│       ├── contacts.js         # Inline editing, auto-save
│       ├── realist.js          # Clipboard API, keyboard shortcuts, auto-save
│       ├── matching.js         # Review UI interactions
│       └── progress.js         # SSE listener for email send progress
└── scripts/
    ├── seed-holidays.js        # Seed preset US holidays
    └── backup.js               # Database backup to R2 or local
```

---

## Database Schema

All tables in a single SQLite database. WAL mode enabled for better concurrent read performance.

```sql
-- Users & Auth
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'nonprofit', 'realestate')),
  name TEXT NOT NULL,
  smtp_provider TEXT,           -- 'outlook_free', 'microsoft365', 'yahoo_free'
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_email TEXT,
  smtp_password_encrypted TEXT, -- AES-256 encrypted
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Unified Contacts (both clients store here, scoped by owner_id)
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  organization TEXT,            -- nonprofit: politician's org
  title TEXT,                   -- nonprofit: Senator, Rep, etc.
  district TEXT,                -- nonprofit
  city TEXT,
  state TEXT,
  zip TEXT,
  property_address TEXT,        -- realestate
  purchase_date DATE,           -- realestate
  purchase_price REAL,          -- realestate
  phone_source TEXT CHECK (phone_source IN ('csv', 'vcard', 'manual')),
  email_source TEXT CHECK (email_source IN ('csv', 'vcard', 'manual')),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Templates (scoped per client)
CREATE TABLE templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  subject_template TEXT,        -- email only
  body_template TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Campaigns
CREATE TABLE campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  template_id INTEGER NOT NULL REFERENCES templates(id),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewing', 'sending', 'sent', 'paused', 'resume_tomorrow')),
  total_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME
);

CREATE TABLE campaign_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'excluded', 'generated')),
  rendered_subject TEXT,
  rendered_body TEXT,
  error_message TEXT,
  sent_at DATETIME
);

-- Real Estate: CRMLS import + Realist lookup
CREATE TABLE crmls_properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_address TEXT NOT NULL,
  city TEXT,
  state TEXT,
  zip TEXT,
  sale_date DATE,
  sale_price REAL,
  csv_upload_id INTEGER REFERENCES csv_uploads(id),
  realist_owner_name TEXT,
  realist_lookup_status TEXT DEFAULT 'pending' CHECK (realist_lookup_status IN ('pending', 'found', 'not_found')),
  looked_up_at DATETIME
);

-- Real Estate: Holidays
CREATE TABLE holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  is_preset BOOLEAN DEFAULT 0,
  owner_id INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Real Estate: Anniversary tracking
CREATE TABLE anniversary_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  anniversary_date DATE NOT NULL,
  years INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped')),
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Import tracking
CREATE TABLE csv_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  upload_type TEXT NOT NULL CHECK (upload_type IN ('politicians', 'crmls')),
  row_count INTEGER,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE contact_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  import_type TEXT DEFAULT 'vcard',
  contact_count INTEGER,
  imported_by INTEGER REFERENCES users(id),
  imported_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE imported_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL REFERENCES contact_imports(id),
  full_name TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  raw_data TEXT
);

CREATE TABLE phone_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  imported_contact_id INTEGER NOT NULL REFERENCES imported_contacts(id),
  match_type TEXT CHECK (match_type IN ('auto', 'manual')),
  confidence_score INTEGER,
  confirmed_by INTEGER REFERENCES users(id),
  confirmed_at DATETIME
);
```

### Indexes

```sql
CREATE INDEX idx_contacts_owner ON contacts(owner_id);
CREATE INDEX idx_contacts_purchase_date ON contacts(purchase_date);
CREATE INDEX idx_campaigns_owner ON campaigns(owner_id);
CREATE INDEX idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX idx_crmls_status ON crmls_properties(realist_lookup_status);
CREATE INDEX idx_holidays_date ON holidays(date);
CREATE INDEX idx_anniversary_status ON anniversary_log(status, anniversary_date);
```

---

## SMTP Configuration

The SMTP config screen auto-fills settings based on provider selection. Credentials are AES-256 encrypted at rest.

| Setting | Outlook.com (Free) | Microsoft 365 | Yahoo Mail (Free) |
|---------|-------------------|---------------|-------------------|
| Host | smtp-mail.outlook.com | smtp.office365.com | smtp.mail.yahoo.com |
| Port | 587 (STARTTLS) | 587 (STARTTLS) | 465 (SSL) |
| Auth | Email + App Password | Email + App Password | Email + App Password |
| Daily Limit | 300/day | 10,000/day | ~100–500/day |
| Default Delay | 2 sec between sends | 2 sec | 3 sec |

The `config/smtp.js` module exports a factory function:

```js
function createTransport(user) {
  // Decrypt stored credentials
  // Build Nodemailer transport based on user.smtp_provider
  // Return configured transport
}
```

Rate limiting: track daily send count per user in memory (reset at midnight). Warn at 80% of limit. Refuse to exceed. Auto-split large campaigns with status `resume_tomorrow`.

---

## Unified Campaign Interface

### Flow

1. **Choose channel**: Email or Text → filters eligible templates and contacts
2. **Select template**: Shows client's templates for chosen channel. Can create inline.
3. **Select contacts**: Checkboxes. Contacts missing required field (email for email, phone for SMS) are flagged and unselectable. "Select All (eligible)" button.
4. **Preview**: Paginated rendered messages. Can exclude individual recipients.
5. **Send/Generate**:
   - **Email**: Sequential SMTP dispatch with configurable delay. Real-time progress via Server-Sent Events (SSE). Per-recipient status logging.
   - **SMS**: Generate `sms:` deep links. Mobile-optimized batch page. Each entry: contact name, phone, message preview, large "Send Text" button (deep link), "Copy Message" fallback.

### Template Variables

**Nonprofit**: `{{first_name}}`, `{{last_name}}`, `{{title}}`, `{{district}}`, `{{city}}`, `{{state}}`, `{{organization}}`, `{{email}}`, `{{phone}}`

**Real Estate**: `{{first_name}}`, `{{last_name}}`, `{{property_address}}`, `{{city}}`, `{{state}}`, `{{purchase_date}}`, `{{purchase_price}}`, `{{years}}` (computed anniversary), `{{email}}`, `{{phone}}`

Template syntax: `{{variable_name}}` — double curly braces. The `services/template.js` renderer replaces all occurrences with contact field values.

### SMS Deep Link Format

```
sms:+1XXXXXXXXXX&body=URL-encoded-message-text
```

Works on iOS Safari. The batch page must be mobile-optimized for iPhone.

---

## Real Estate Data Pipeline

Four sequential stages. Each must complete before the next.

### Stage 1: CRMLS Import
- Upload CSV → column mapping UI → insert into `crmls_properties` with status `pending`

### Stage 2: Realist Owner Lookup (Semi-Manual)
- Table of pending properties sorted by city/zip
- One-click "Copy Address" button (Clipboard API)
- Inline owner name input, auto-saves on blur/Enter
- "Not Found" button per row
- Progress bar + status filters (pending/found/not_found)
- Keyboard shortcuts: Tab → copies next address → focuses next name field
- Multi-session: progress saved automatically
- "Finalize Lookup" → creates contact records (phone/email null)

### Stage 3: vCard Phone + Email Matching
- Upload `.vcf` file → parse names, phones (prefer mobile), emails
- Four-pass auto-matching against contact owner names:
  1. **Exact** (case-insensitive) → confidence 100
  2. **Normalized** (strip middle names, suffixes Jr/Sr/III) → confidence 90
  3. **Last name + first initial** → confidence 70
  4. **Fuzzy** (Levenshtein distance) → confidence 40–60
- Review dashboard: Confirmed (green) / Needs Review (yellow) / Unmatched (red)
- On confirm: write phone to `contacts.phone`, email to `contacts.email` where available

### Stage 4: Manual Email Entry
- Editable contact table for missing emails (same pattern as nonprofit phone entry)
- Inline editing, auto-save on blur, filter for "missing email"

---

## Cron Jobs

Daily at configurable time (default 7:00 AM Pacific):

1. **Anniversary check**: Query `contacts` where `purchase_date` anniversary falls within lookahead window (default 7 days). Insert into `anniversary_log`.
2. **Holiday check**: Query `holidays` where date falls within notification window (day-of or day-before). Flag on dashboard.

Implemented in `services/cron.js` using `node-cron`.

---

## Authentication & Roles

Three roles: `admin`, `nonprofit`, `realestate`.

| Route Group | admin | nonprofit | realestate |
|-------------|-------|-----------|------------|
| /admin | ✅ | ❌ | ❌ |
| /campaign | ✅ | ✅ (own) | ✅ (own) |
| /contacts | ✅ | ✅ (own) | ✅ (own) |
| /realestate | ✅ | ❌ | ✅ |
| /api | ✅ | ✅ (scoped) | ✅ (scoped) |

All data is scoped by `owner_id`. Clients only see their own contacts, templates, and campaigns. Admin sees everything.

Middleware: `auth.js` checks session, `requireRole('admin')`, `requireRole('nonprofit', 'realestate')`, etc.

Sessions: `express-session` with `connect-sqlite3` store. Cookies: `httpOnly: true`, `secure: true` (production), `sameSite: 'strict'`.

---

## Docker Configuration

### Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "server.js"]
```

### docker-compose.yml (Self-Hosted)

```yaml
services:
  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - app
    restart: unless-stopped

  app:
    build: .
    expose:
      - "3000"
    volumes:
      - app_data:/data
    env_file:
      - .env
    environment:
      - DATA_DIR=/data
      - NODE_ENV=production
    restart: unless-stopped

volumes:
  caddy_data:
  caddy_config:
  app_data:
```

### Caddyfile

```
your-ddns-domain.ddns.net {
  reverse_proxy app:3000
}
```

### Environment Variables

```env
NODE_ENV=production
PORT=3000
DATA_DIR=/data                          # SQLite db location (Docker volume)
BASE_URL=https://your-domain.com        # Used for absolute URLs
SESSION_SECRET=<random-64-char-string>
ENCRYPTION_KEY=<random-32-char-hex>     # AES-256 key for SMTP credential encryption
```

---

## Deployment

### Render
- Service type: Web Service (Docker)
- Plan: Starter ($7/mo)
- Persistent disk: 1GB at `/data`
- Env vars set in Render dashboard
- Health check: `/health` endpoint
- Auto-deploy on git push

### Self-Hosted (WSL2)
- WSL2 Ubuntu 22.04 with Docker installed
- Router: Port forward 80+443 on Archer BE3600, DDNS configured
- WSL2 networking: `netsh interface portproxy` from Windows host to WSL2 IP (updated on boot via Windows scheduled task since WSL2 IP can change)
- Start: `docker compose up -d`
- Laptop: disable lid-close sleep, enable BIOS auto-restart, consider UPS

### Switching targets
Same Docker image, different env vars. Migrate by copying the SQLite `.db` file between Docker volumes and updating `BASE_URL`.

---

## Build Phases

### Phase 1 — Foundation & Docker (Days 1–4)
1. Initialize Node.js project, install all dependencies
2. Create Dockerfile and docker-compose.yml + Caddyfile
3. Create SQLite init script with all tables and indexes
4. Build auth: login page, session middleware, role-based guards
5. Build admin panel: user CRUD, SMTP config per client (provider dropdown, auto-fill host/port, App Password input, connection test button)
6. Build base EJS layout with role-adaptive navigation
7. Deploy to both Render and WSL2, verify HTTPS on both

### Phase 2 — Unified Campaign Engine & Templates (Days 5–9)
1. Generic CSV upload endpoint with column-mapping UI
2. Unified contacts table with owner_id scoping
3. Template CRUD: channel selector, variable toolbar, live preview
4. Create Campaign flow: channel → template → contacts → preview → send/generate
5. Email dispatch engine: Nodemailer transport factory, sequential send with delay, SSE progress, per-recipient logging, daily rate tracking
6. SMS generation engine: render templates, URL-encode, generate `sms:` deep links, build mobile-optimized batch page
7. Campaign history view with retry for failed emails
8. Preview-and-approve mode + send-all mode

### Phase 3 — Nonprofit Contact Pipeline (Days 10–12)
1. CSV upload for politicians with column mapping
2. Auto-populate phone from CSV when present
3. Editable contacts table for manual phone entry (inline edit, auto-save, filter missing)
4. Configure and test Outlook SMTP (both Outlook.com and M365)
5. End-to-end test: CSV → email campaign → SMS campaign

### Phase 4 — CRMLS Import & Realist Lookup (Days 13–17)
1. CSV upload for CRMLS property data
2. Realist lookup dashboard: table, copy button, inline name input, auto-save
3. Status indicators, progress bar, filters
4. Keyboard shortcut flow (Tab → copy → focus)
5. "Finalize Lookup" → create contact records

### Phase 5 — vCard Import & Phone/Email Matching (Days 18–22)
1. vCard upload + parser
2. Four-pass auto-matching algorithm with confidence scores
3. Three-section review dashboard (confirmed/review/unmatched)
4. Review UI: candidate dropdown, search-as-you-type, manual entry
5. Auto-populate emails from matched vCard contacts
6. Editable table for manual email entry
7. Configure and test Yahoo SMTP

### Phase 6 — Holiday & Anniversary Systems (Days 23–27)
1. Seed preset US holidays
2. Holiday management UI: calendar, custom dates
3. Holiday notification via cron → "Create Campaign" button
4. Anniversary cron job + digest view (Today/This Week/Completed)
5. Quick-action buttons: Send Text, Send Email, Skip
6. Dashboard notification badges
7. Optional morning email digest

### Phase 7 — Polish, Security & Docs (Days 28–32)
1. Security: encrypt credentials, secure cookies, CSRF, sanitize inputs
2. Mobile responsiveness (iPhone Safari for SMS batch page)
3. Error handling: malformed CSVs, corrupt vCards, SMTP failures
4. Docker optimization: multi-stage build, health check
5. Provider-specific email delivery testing
6. Backup: admin DB download + optional R2 automated backup
7. WSL2 startup script + netsh portproxy documentation
8. Operational documentation

---

## Coding Conventions

- **No frontend framework**: EJS templates + vanilla JS only. No React, Vue, etc.
- **No TypeScript**: Plain JavaScript (ES modules or CommonJS — be consistent, prefer CommonJS for Node.js compatibility with better-sqlite3)
- **Minimal dependencies**: Don't add packages for things that are simple to implement (e.g., Levenshtein distance, vCard parsing)
- **Inline editing pattern**: Used in multiple places (Realist lookup, nonprofit phone entry, real estate email entry). Build as a reusable EJS partial + JS module.
- **Auto-save on blur**: All inline edit fields save immediately via fetch() to an API endpoint. No "Save All" buttons.
- **Error handling**: Every route has try/catch. Errors flash to the user via session flash messages. SMTP errors are logged per-recipient.
- **Security**: Never store plaintext SMTP passwords. Always `httpOnly` + `secure` cookies in production. Sanitize all user input. CSRF tokens on all forms.
- **Database**: Use prepared statements everywhere. Never interpolate user input into SQL strings.
- **File organization**: Routes are thin controllers. Business logic lives in `services/`. Database queries can live in routes for simple cases or in a `db/queries.js` for complex ones.

---

## Important Implementation Notes

### SMS Deep Links
- Format: `sms:+1XXXXXXXXXX&body=URL-encoded-text`
- Must URL-encode the message body with `encodeURIComponent()`
- Test on iOS Safari — some older iOS versions use `sms:+1XXXXXXXXXX;body=` (semicolon instead of ampersand)
- Always provide a "Copy Message" fallback button using the Clipboard API

### Email Rate Limiting
- Track daily send counts per user in memory (Map object, reset at midnight via cron)
- Outlook.com: 300/day. Microsoft 365: 10,000/day. Yahoo free: assume 100/day (conservative).
- Warn at 80% of limit. Refuse to exceed. Set campaign status to `resume_tomorrow`.
- Configurable delay between sends: 2 sec for Outlook, 3 sec for Yahoo.

### vCard Matching Algorithm
- Pass 1 — Exact: `ownerName.toLowerCase() === contact.fullName.toLowerCase()` → confidence 100
- Pass 2 — Normalized: strip middle names, suffixes (Jr, Sr, III, IV), extra spaces → confidence 90
- Pass 3 — Last name + first initial: match last name exact + first char of first name → confidence 70
- Pass 4 — Fuzzy: Levenshtein distance ≤ 3 on normalized names → confidence 40–60 based on distance
- When multiple phone numbers exist for a contact, prefer the one labeled "mobile" or "cell"
- When multiple candidates match, present all to user sorted by confidence

### Realist Lookup UX
- Clipboard API: `navigator.clipboard.writeText(address)` — requires HTTPS (which we have on both targets)
- Keyboard flow: Tab from name field should trigger copy of the NEXT address and focus the next name field. This requires custom JS, not default tab behavior.
- Auto-save: `fetch('/api/realist-lookup', { method: 'POST', body: { propertyId, ownerName } })` on blur/Enter

### Preset US Holidays
Seed these for the current year and next year:
- New Year's Day (Jan 1)
- Valentine's Day (Feb 14)
- Easter (calculate — moveable)
- Independence Day (Jul 4)
- Labor Day (first Mon in Sep — calculate)
- Halloween (Oct 31)
- Thanksgiving (fourth Thu in Nov — calculate)
- Christmas (Dec 25)

---

## Testing Checklist

Before marking any phase complete:

- [ ] Test on both deployment targets (Render + WSL2)
- [ ] Test email sending with the actual provider (Outlook/Yahoo)
- [ ] Test SMS deep links on iPhone Safari
- [ ] Test with malformed/empty CSV input
- [ ] Test auth: wrong password, expired session, role escalation attempt
- [ ] Test mobile responsiveness on the SMS batch page
- [ ] Verify HTTPS works on self-hosted target
- [ ] Check that daily send count resets properly
- [ ] Verify cron jobs fire at the configured time