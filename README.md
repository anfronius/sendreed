# SendReed

Unified outreach platform for email and SMS campaigns serving two clients through a single interface:

- **Nonprofit Political Outreach** — templated emails/texts to politicians via Outlook SMTP
- **California Real Estate Agent** — holiday greetings and purchase anniversary messages via Yahoo SMTP

SMS uses `sms:` deep links (zero API cost). Emails are sent sequentially with provider-specific rate limiting.

## Prerequisites

- Node.js 20+
- Docker (for production deployment)

## Quick Start (Local Development)

```bash
# Install dependencies
npm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env — set SESSION_SECRET, ENCRYPTION_KEY, ADMIN_EMAIL, ADMIN_PASSWORD

# Start dev server (auto-restarts on file changes)
npm run dev
```

The app runs at `http://localhost:3000`. On first start, the admin account is created from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in your `.env`.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | `production` or `development` | No (defaults to development) |
| `PORT` | Server port | No (defaults to 3000) |
| `DATA_DIR` | SQLite database directory | No (defaults to project root) |
| `BASE_URL` | Public URL for absolute links | Production only |
| `SESSION_SECRET` | Random 64-char string for session signing | Yes |
| `ENCRYPTION_KEY` | 64 hex chars (32 bytes) for AES-256 SMTP credential encryption | Yes |
| `ADMIN_EMAIL` | Admin account email (created on first run) | Yes |
| `ADMIN_PASSWORD` | Admin account password (created on first run) | Yes |

Generate secrets:

```bash
# SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Docker

```bash
# Build and run with Docker Compose (includes Caddy for HTTPS)
docker compose up -d

# Or build the image directly
docker build -t sendreed .
docker run -p 3000:3000 --env-file .env -v sendreed_data:/data sendreed
```

See [DEPLOY.md](DEPLOY.md) for full deployment instructions (Render + self-hosted WSL2).

## Project Structure

```
├── server.js              # Express entry point
├── db/init.js             # SQLite schema initialization
├── config/
│   ├── smtp.js            # SMTP transport factory
│   └── providers.json     # Provider presets (Outlook, M365, Yahoo)
├── middleware/             # Auth, CSRF, validation
├── routes/                # Express route handlers
├── services/              # Business logic (email, SMS, CSV, vCard, cron)
├── views/                 # EJS templates
├── public/                # Static CSS and JS
├── scripts/               # Utility scripts (seed holidays)
├── Dockerfile             # Multi-stage Docker build
├── docker-compose.yml     # Caddy + app for self-hosted
└── Caddyfile              # Reverse proxy config
```

## User Roles

| Role | Access |
|------|--------|
| `admin` | Full access + user management + SMTP config |
| `nonprofit` | Own contacts, templates, campaigns |
| `realestate` | Own contacts, templates, campaigns + CRMLS import, Realist lookup, vCard matching, holidays, anniversaries |

## SMTP Setup

1. Log in as admin
2. Go to Admin > Users > click SMTP for a user
3. Select provider (Outlook.com, Microsoft 365, or Yahoo Mail)
4. Enter the account email and App Password (not the regular password)
5. Click Test Connection to verify

**App Passwords**: Both Outlook and Yahoo require app-specific passwords when 2FA is enabled. Generate these in your email provider's security settings.

## Seed Holidays

```bash
node scripts/seed-holidays.js
```

Seeds US holidays (New Year's, Valentine's, Easter, July 4th, Labor Day, Halloween, Thanksgiving, Christmas) for the current and next year. Can also be triggered from the Real Estate > Holidays UI.
