# CLAUDE.md — SendReed Outreach Platform

## What It Is
  Unified email/SMS campaign platform serving two clients (nonprofit political outreach
   via Outlook SMTP, real estate agent via Yahoo SMTP). SMS uses `sms:` deep links (no
  API). Dockerized, runs on Render or self-hosted WSL2+Caddy.

## Tech Stack
  Node.js 20, Express, EJS + vanilla JS (no frameworks), SQLite via better-sqlite3
  (WAL), bcryptjs, nodemailer, multer, papaparse, node-cron. CommonJS modules.

## Architecture
  - `server.js` → routes (thin controllers) → services (business logic)
  - Auth: express-session + connect-sqlite3, role-based
  (`admin`/`nonprofit`/`realestate`), all data scoped by `owner_id`
  - SMTP credentials AES-256 encrypted at rest
  - Email sending: sequential with per-provider rate limits, SSE progress,
  `resume_tomorrow` on limit
  - Real estate pipeline: CRMLS CSV → Realist manual lookup → vCard 4-pass name
  matching → contact enrichment
  - Cron: daily anniversary check + morning digest (7AM Pacific)

## Key Patterns
  - Inline editing with auto-save on blur via `/api/*` endpoints
  - CSV imports use 2-step upload→column-mapping flow
  - Campaign wizard: 4-step client-side (channel→template→contacts→preview)
  - `{{variable}}` template syntax, role-specific variable sets
  - CSRF on all forms; `X-CSRF-Token` header for AJAX

## Current State
  All 7 build phases complete. FIXES.md tracks remaining work — second set is
  incomplete (cut off mid-sentence). No test suite exists. Holiday UI was intentionally
   removed. No `scripts/backup.js` yet.