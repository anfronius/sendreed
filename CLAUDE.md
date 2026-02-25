# CLAUDE.md — SendReed Outreach Platform

## What It Is
  Unified email/SMS campaign platform serving two clients (nonprofit political outreach via Outlook SMTP, real estate agent via Yahoo SMTP). SMS uses `sms:` deep links (no API). Dockerized, runs on Render or self-hosted WSL2+Caddy.

## Tech Stack
  Node.js 20, Express, EJS + vanilla JS (no frameworks), SQLite via better-sqlite3 (WAL), bcryptjs, nodemailer, multer, papaparse, node-cron. **CommonJS modules throughout** (note: the global CLAUDE.md says "prefer ES modules" — this project overrides that; use `require`/`module.exports` everywhere).

## Architecture
  - `server.js` → routes (thin controllers) → services (business logic)
  - Auth: express-session + connect-sqlite3, role-based (`admin`/`nonprofit`/`realestate`), all data scoped by `owner_id`
  - SMTP credentials AES-256 encrypted at rest
  - Email sending: sequential with per-provider rate limits, SSE progress, `resume_tomorrow` on limit
  - Real estate pipeline: CRMLS CSV → Realist manual lookup → vCard 4-pass name matching → contact enrichment
  - Cron: daily anniversary check + morning digest (7AM Pacific)

## Key Patterns
  - Inline editing with auto-save on blur via `/api/*` endpoints
  - CSV imports use 2-step upload→column-mapping flow
  - Campaign wizard: 4-step client-side (channel→template→contacts→preview)
  - `{{variable}}` template syntax, role-specific variable sets
  - CSRF on all forms; `X-CSRF-Token` header for AJAX

## Current State
  All 7 build phases complete. FIXES.md tracks remaining work — second set is incomplete (cut off mid-sentence). Holiday UI was intentionally removed. No `scripts/backup.js` yet.

## Project Rules (`.claude/rules/`)
  Detailed coding standards live in `.claude/rules/`. **Read the relevant rule file before writing or reviewing code in that layer:**

  | Rule File | Governs |
  |---|---|
  | `sqlite.md` | Database naming, queries, transactions, ownership scoping, indexing |
  | `express.md` | Route organization, handler pattern, response formats, pagination |
  | `frontend.md` | EJS templates, vanilla JS conventions (`var`, `.then()`), CSS patterns |
  | `security.md` | Auth, CSRF, encryption, XSS/SQLi prevention, input validation |
  | `services.md` | Service layer architecture, email/CSV/vCard/matcher/template/SMS/cron |
  | `docker-deploy.md` | Docker build, environment variables, deployment targets |
  | `testing.md` | Test framework (`node:test`), scope, file structure, conventions |

## Agents (`.claude/agents/`)
  Specialized agent prompts for delegated tasks. Use these with the Task tool when the work matches:

  | Agent | Purpose | When to use |
  |---|---|---|
  | `code-review.md` | Review code against project rules, report by severity | After writing code, before committing; on PR review |
  | `test-writer.md` | Write unit tests for pure service functions | When adding/changing service logic |
  | `git-manager.md` | Branch, commit, and PR workflows | All git operations — user wants Claude to handle git |
  | `code-analyzer.md` | Read and summarize any code scope | Before making changes to unfamiliar code; when another agent needs context |

## Workflow Integration
  When performing a multi-step task:
  1. **Analyze** — use `code-analyzer` agent if the scope is unfamiliar
  2. **Plan** — save plans to `./docs/plans/` per global preferences
  3. **Implement** — follow the relevant rule files for the layers being touched
  4. **Test** — run `npm test`; use `test-writer` agent if new tests are needed
  5. **Review** — use `code-review` agent to check against rules before committing
  6. **Commit** — use `git-manager` agent conventions (feature branch, conventional commits)
