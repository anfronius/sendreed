# SendReed Project-Level Claude Code Pipeline Report

**Date:** 2026-02-27
**Scope:** Project-level `.claude/` configuration for SendReed, interconnectivity with global `~/.claude/`, and tech-stack-specific recommendations
**Prior Reports:** `~/.claude/claude-pipeline-correction.md` (strategic guide), `~/.claude/plans/staged-whistling-kahn.md` (global implementation)

---

## Executive Summary

The global `~/.claude/` upgrade established a foundation of 8 skills, 2 agents, 3 rules, comprehensive hooks, and environment variable optimizations. SendReed's project-level `.claude/` has 7 rule files, 4 agents, and permission overrides — but **no skills, no hooks, and several interconnection gaps** between the two layers. This report identifies those gaps and provides implementation-ready specifications for a fully integrated SendReed pipeline, including CommonJS/Express/EJS/SQLite-specific patterns.

---

## Current State Analysis

### What's Working Well

| Component | Status | Notes |
|-----------|--------|-------|
| 7 project rule files | Excellent | Thorough, cross-referenced, cover all layers |
| 4 project agents | Good | Match the CLAUDE.md workflow table |
| CLAUDE.md | Good | ~95 lines, references rules and agents properly |
| Global hooks | Active | Sensitive file protection, dangerous command blocking, lint, audit log |
| Global skills | Active | All 8 skills functional (`/commit`, `/branch`, `/plan`, `/review`, `/fixes`, `/work`, `/doc-updater`, `/plan-executor`) |
| MCP servers | Active | GitHub + Context7 + Sequential Thinking available |

### Gaps and Inefficiencies

#### 1. No project-level skills
SendReed has no `.claude/skills/` directory. The global `/fixes` skill reads FIXES.md generically, but doesn't know about SendReed's 9-set fix tracking format, the `npm test` command with `node:test`, or the CommonJS requirement. A project-level `/fixes` override would be more effective.

#### 2. Global/project rule conflicts not flagged proactively
The global `code-style.md` says "Use ES module imports (import/export), not CommonJS (require)." SendReed's CLAUDE.md explicitly overrides this: "CommonJS modules throughout." But CLAUDE.md loads once; the global rule loads on every file edit. This creates a silent tension — Claude must remember the override across compactions.

#### 3. Project agents don't reference global agents
The project `code-review.md` agent duplicates the global `code-reviewer.md` agent with project-specific additions. There's no delegation pattern — if you invoke the global `/review` skill, it uses the global agent (which doesn't know about Express patterns, SQLite ownership scoping, or EJS XSS rules). If you invoke the project agent directly via Task tool, it works but misses the skill's `context: fork` isolation.

#### 4. No project-level hooks
The global `post-edit-lint.sh` runs ESLint on `.js` files, which is correct for SendReed. But there's no project-level hook for:
- Running `npm test` after task completion (the global config deliberately excluded TaskCompleted because it's project-specific)
- Validating that `owner_id` scoping exists in new SQL queries
- Checking that `var` (not `let`/`const`) is used in `public/js/` files

#### 5. settings.json permissions are minimal
The project `settings.json` allows basic commands but misses `Bash(sqlite3:*)` for direct DB inspection, `Bash(curl:*)` for API testing, and lacks any hooks override.

#### 6. Test suite doesn't exist yet
`testing.md` defines comprehensive conventions, the `test-writer.md` agent is ready, and a test plan exists at `docs/plans/PLAN-2026-02-24-test-suite.md` — but the `tests/` directory hasn't been created. This means the `/work` skill's "run test suite" step and the proposed TaskCompleted hook have nothing to run.

---

## Interconnection Architecture

### Current Flow (Global → Project)

```
~/.claude/CLAUDE.md
  ↓ loaded first, sets global defaults
  ↓ "Use ES modules" ← CONFLICT with project
  ↓
project/CLAUDE.md
  ↓ loaded second, overrides with "CommonJS throughout"
  ↓ references .claude/rules/ and .claude/agents/
  ↓
~/.claude/rules/ (3 files)
  ↓ code-style.md ← CONFLICT (ESM vs CommonJS)
  ↓ git-workflow.md ← compatible
  ↓ security.md ← compatible, extended by project
  ↓
project/.claude/rules/ (7 files)
  ↓ security.md ← extends global with CSRF, encryption, bcrypt specifics
  ↓ express.md, frontend.md, services.md, sqlite.md, testing.md, docker-deploy.md
  ↓ ← project-only, no global equivalents
  ↓
~/.claude/agents/ (2 agents)
  ↓ code-reviewer → Sonnet, generic review
  ↓ researcher → Haiku, generic exploration
  ↓
project/.claude/agents/ (4 agents)
  ↓ code-review → project-specific, references all 7 rules
  ↓ code-analyzer → project-specific, traces data flow
  ↓ git-manager → project-specific, runs tests
  ↓ test-writer → project-specific, node:test + CommonJS
  ↓
~/.claude/skills/ (8 skills)
  ↓ All active, but none aware of SendReed specifics
  ↓ /fixes reads FIXES.md but doesn't know the set-based format
  ↓ /review delegates to global agent, misses project rules
  ↓
project/.claude/skills/ ← MISSING (no project-level skills)
  ↓
~/.claude/settings.json (hooks)
  ↓ PreToolUse: sensitive file protection, dangerous commands, main branch guard
  ↓ PostToolUse: lint, audit log
  ↓ Stop: notification
  ↓ SessionStart: session log
  ↓ TaskCompleted ← MISSING (excluded as project-specific)
  ↓
project/.claude/settings.json (permissions only, no hooks)
```

### Target Flow (After Implementation)

```
~/.claude/CLAUDE.md (unchanged)
  ↓
project/CLAUDE.md (minor update: add skills reference)
  ↓
~/.claude/rules/
  ↓ code-style.md ← ADD path-scoping to exclude this project's files
  ↓
project/.claude/rules/ (unchanged, already excellent)
  ↓ ADD: commonjs.md (path-scoped to *.js, reinforces var/require patterns)
  ↓
project/.claude/agents/
  ↓ ENHANCE: code-review.md → add skills field, reference project rules explicitly
  ↓ ENHANCE: test-writer.md → add CommonJS/node:test patterns
  ↓
project/.claude/skills/ ← NEW
  ↓ fixes/SKILL.md → SendReed-specific FIXES.md workflow
  ↓ db-migrate/SKILL.md → SQLite schema change helper
  ↓ test-run/SKILL.md → node:test runner with coverage patterns
  ↓
project/.claude/settings.json
  ↓ ADD: TaskCompleted hook (npm test)
  ↓ ADD: expanded permissions
  ↓ ADD: project-specific PreToolUse hooks
```

---

## Implementation Specifications

### 1. Project-Level Skills

#### 1.1 `project/.claude/skills/fixes/SKILL.md` — SendReed Fix Workflow

Overrides the global `/fixes` with project-specific knowledge.

```markdown
---
name: fixes
description: Read FIXES.md and fix issues using SendReed conventions (CommonJS, Express, EJS, SQLite).
context: fork
agent: general-purpose
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
argument-hint: "[set number or specific fix description]"
---

# SendReed Fix Workflow

## Context
- FIXES.md: !`cat FIXES.md 2>/dev/null || echo "No FIXES.md found"`
- Git status: !`git status --short`
- Current branch: !`git branch --show-current`

## SendReed Architecture
- CommonJS modules: use `require()` / `module.exports` — never ES imports
- Frontend JS: use `var`, `.then()` chains, `function` declarations — no let/const/arrow/async
- Routes are thin controllers in `routes/` → business logic in `services/`
- Database: better-sqlite3 (synchronous), `getDb()` from `db/init.js`
- Templates: EJS with `<%= %>` for escaping, `<%- %>` only for includes
- All user data scoped by `owner_id` unless admin

## FIXES.md Format
- Organized in numbered "sets" (e.g., "## 9th Set of Fixes")
- Each fix has a description and sometimes sub-items
- Sets marked with "DONE" are completed
- Current work is the highest-numbered incomplete set

## Process
1. Parse FIXES.md to find incomplete sets
2. If $ARGUMENTS specifies a set number, focus on that set
3. For each fix in the target set:
   a. Read .claude/rules/ relevant to the fix (express.md for routes, frontend.md for UI, sqlite.md for DB, etc.)
   b. Search codebase for affected files using Grep/Glob
   c. Write analysis to `docs/fix-analysis.md` before implementing
   d. Implement with minimal changes following project conventions
   e. Run `npm test` to verify (if tests exist)
   f. Create conventional commit: `fix(<scope>): <description>`
4. Update FIXES.md to mark completed items

## Rules
- NEVER use `let`, `const`, or arrow functions in public/js/ files
- NEVER use `import`/`export` — this is a CommonJS project
- Always verify `owner_id` scoping in any SQL query changes
- Include CSRF token in any new AJAX endpoint: `'X-CSRF-Token': window.CSRF_TOKEN`
- Return summary: "[N] fixes completed from set [M]. See docs/fix-analysis.md"
```

#### 1.2 `project/.claude/skills/db-migrate/SKILL.md` — SQLite Schema Helper

```markdown
---
name: db-migrate
description: Add columns, indexes, or tables to SendReed's SQLite database safely. Use when modifying database schema.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Edit, Bash
argument-hint: "[description of schema change needed]"
---

# SQLite Schema Migration

## Context
- Current schema: !`head -200 db/init.js`
- Current branch: !`git branch --show-current`

## SendReed DB Conventions (from .claude/rules/sqlite.md)
- Engine: better-sqlite3 (synchronous API)
- WAL mode + foreign keys enabled on init
- Tables: plural snake_case (`contacts`, `campaign_recipients`)
- Columns: snake_case (`first_name`, `owner_id`)
- Foreign keys: `{table_singular}_id` pattern
- IDs: `INTEGER PRIMARY KEY AUTOINCREMENT`
- Timestamps: `created_at`, `updated_at` with `DATETIME DEFAULT CURRENT_TIMESTAMP`
- Every user-facing table MUST have `owner_id INTEGER REFERENCES users(id)`
- Index every `owner_id` column: `idx_{table}_{column}`

## Process
1. Understand the schema change needed: $ARGUMENTS
2. Read `db/init.js` to understand current schema
3. For new columns: use `ALTER TABLE` guarded by column existence check:
   ```js
   const cols = db.pragma('table_info(table_name)').map(c => c.name);
   if (!cols.includes('new_column')) {
     db.exec('ALTER TABLE table_name ADD COLUMN new_column TYPE DEFAULT value');
   }
   ```
4. For new tables: add `CREATE TABLE IF NOT EXISTS` block in init.js
5. For new indexes: add `CREATE INDEX IF NOT EXISTS idx_table_column ON table(column)`
6. If adding a user-facing table, MUST include `owner_id` + index
7. Run `node -e "require('./db/init')"` to verify schema applies without error
8. Commit: `feat(db): add {description}`

## Rules
- NEVER drop columns or tables without explicit user approval
- NEVER modify existing column types (SQLite doesn't support ALTER COLUMN)
- Always use IF NOT EXISTS / IF NOT INCLUDES guards for idempotency
- Add both the schema change AND any queries that use the new columns
```

#### 1.3 `project/.claude/skills/test-run/SKILL.md` — Node Test Runner

```markdown
---
name: test-run
description: Run SendReed's test suite and report results. Use when testing, verifying changes, or checking test status.
disable-model-invocation: true
allowed-tools: Bash, Read
argument-hint: "[optional: specific test file or module name]"
---

# Test Runner

## Context
- Test files: !`ls tests/unit/*.test.js 2>/dev/null || echo "No test files found"`
- Current branch: !`git branch --show-current`

## Commands
- Full suite: `npm test` (runs `node --test tests/unit/*.test.js`)
- Single module: `node --test tests/unit/$ARGUMENTS.test.js`
- With verbose output: `node --test --test-reporter spec tests/unit/*.test.js`

## Testable Modules (from .claude/rules/testing.md)
| Module | Functions |
|--------|-----------|
| services/matcher.js | levenshteinDistance, normalizeName, findMatches |
| services/vcard.js | parseString, normalizePhone |
| services/template.js | render, extractVariables, getAvailableVariables |
| services/crypto.js | encrypt, decrypt (needs ENCRYPTION_KEY env) |
| services/sms.js | normalizePhone, generateDeepLink, buildBatchData |
| services/csv.js | normalizeHeader, suggestMapping, suggestCrmlsMapping |
| config/ca-cities.js | expandCity |

## Process
1. If $ARGUMENTS specified, run that specific test file
2. If no arguments, run the full suite
3. Parse output for pass/fail counts
4. If failures found, read the failing test to understand the assertion
5. Report: "[pass] passed, [fail] failed. [details of any failures]"

## Rules
- NEVER modify test files to make tests pass
- Set `ENCRYPTION_KEY` env var before running crypto tests
- Tests must complete in under 100ms per file — no I/O, no network
- Use CommonJS in test files: `const { test, describe, it } = require('node:test')`
```

### 2. Project-Level Rule Addition

#### 2.1 `project/.claude/rules/commonjs.md` — Path-Scoped CommonJS Enforcement

```markdown
---
paths:
  - "**/*.js"
---

# CommonJS Module Rules (SendReed Override)

This project uses CommonJS exclusively. The global rule preferring ES modules does NOT apply here.

- Use `require()` for imports, `module.exports` for exports
- Never use `import`/`export` syntax
- In browser JS (public/js/): use `var` (not let/const), `function` declarations (not arrows), `.then()` chains (not async/await)
- In server JS (services/, routes/, middleware/, db/): `var` or `const` acceptable, but `require`/`module.exports` mandatory
```

### 3. Project settings.json Upgrade

Replace the current minimal `settings.json` with:

```json
{
  "permissions": {
    "allow": [
      "Bash(node:*)",
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(docker compose:*)",
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git branch:*)",
      "Bash(git checkout:*)",
      "Bash(git checkout -b:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git push:*)",
      "Bash(git stash:*)",
      "Bash(git fetch:*)",
      "Bash(git pull:*)",
      "Bash(git merge:*)",
      "Bash(git rebase:*)",
      "Bash(gh pr:*)",
      "Bash(gh issue:*)",
      "Bash(sqlite3:*)",
      "Bash(curl:*)",
      "Bash(ls:*)",
      "Bash(mkdir:*)",
      "Bash(cat:*)",
      "Bash(wc:*)",
      "Read",
      "Grep",
      "Glob"
    ]
  },
  "hooks": {
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "if [ -d tests/unit ] && ls tests/unit/*.test.js 1>/dev/null 2>&1; then npm test 2>&1 | tail -30; if [ ${PIPESTATUS[0]} -ne 0 ]; then echo 'Tests are failing. Fix the implementation before continuing.' >&2; exit 2; fi; fi; exit 0",
            "timeout": 60
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "INPUT=$(cat); FILE=$(echo \"$INPUT\" | jq -r '.tool_input.file_path // \"\"'); if echo \"$FILE\" | grep -qE '^.*\\.env'; then echo 'BLOCKED: Cannot modify .env files in this project.' >&2; exit 2; fi; if echo \"$FILE\" | grep -qE 'db/.*\\.sqlite'; then echo 'BLOCKED: Cannot directly modify SQLite database files.' >&2; exit 2; fi; exit 0",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**Key additions over current:**
- `TaskCompleted` hook runs `npm test` when test files exist — auto-catches regressions
- `PreToolUse` blocks direct `.env` and `.sqlite` file modifications at project level
- Expanded permissions: `sqlite3` for DB inspection, `curl` for API testing, `gh issue` for issue tracking, more git operations, `ls`/`mkdir`/`cat`/`wc` for general use

### 4. Agent Enhancements

#### 4.1 Enhanced `code-review.md`

Add project-specific checklist items to the existing agent:

```markdown
---
name: code-review
description: Review SendReed code against all project rules. Reports issues by severity with file:line citations.
tools: Read, Grep, Glob
model: sonnet
---

You are a senior code reviewer for SendReed, a Node.js/Express/EJS/SQLite outreach platform.

## Project Context
- CommonJS throughout: `require()` / `module.exports` — NEVER ES imports
- Frontend JS uses `var`, `.then()`, `function` — NEVER let/const/arrow/async
- SQLite via better-sqlite3 (synchronous API)
- Role-based multi-tenancy: admin, nonprofit, realestate
- AES-256 encryption for SMTP passwords

## Review Process
1. Run `git diff HEAD~1` to identify changed files
2. For each changed file, check against the relevant rule file in `.claude/rules/`:
   - Routes → express.md + security.md
   - Services → services.md + sqlite.md
   - Views → frontend.md + security.md (XSS)
   - Public JS → frontend.md (var, .then(), function)
   - DB changes → sqlite.md (naming, ownership, indexes)
   - All files → security.md (CSRF, SQLi, XSS)

## SendReed-Specific Checks
- [ ] Every SQL query uses `?` placeholders (never string interpolation)
- [ ] Every user-facing query filters by `owner_id` (unless admin bypass)
- [ ] Admin bypass uses: `const where = isAdmin ? '1=1' : 'owner_id = ?'`
- [ ] CSRF token included in all POST/PUT/DELETE handlers
- [ ] Multer middleware placed before CSRF validation on multipart routes
- [ ] EJS uses `<%= %>` for user data, `<%- %>` only for includes
- [ ] Frontend fetch calls include `'X-CSRF-Token': window.CSRF_TOKEN`
- [ ] `try-catch` wraps every route handler
- [ ] Flash messages use `setFlash(req, type, message)` pattern
- [ ] New columns follow snake_case naming with proper indexes

## Severity Levels
- **CRITICAL**: Security vulnerability, data leak, missing ownership check, SQL injection
- **WARNING**: Missing error handling, logic bug, convention violation with functional impact
- **STYLE**: Naming convention, formatting, documentation gap

## Output
Write to `docs/reviews/review-latest.md` with sections for each severity level.
Return ONLY: "Review complete. [N] issues ([critical]/[warnings]/[suggestions]). See docs/reviews/review-latest.md"
```

#### 4.2 Enhanced `test-writer.md`

Add explicit CommonJS/node:test patterns:

```markdown
---
name: test-writer
description: Write unit tests for SendReed service functions using node:test and CommonJS.
tools: Read, Grep, Glob, Write, Bash
model: sonnet
---

You are a test engineer for SendReed. Write thorough, maintainable tests using `node:test`.

## Framework
- `node:test` (built-in) + `node:assert` — zero external deps
- CommonJS: `const { describe, it } = require('node:test');`
- `const assert = require('node:assert/strict');`

## Test File Template
```js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { functionName } = require('../../services/module');

describe('functionName', function() {
  it('should handle normal input', function() {
    var result = functionName('input');
    assert.strictEqual(result, 'expected');
  });

  it('should handle edge case: empty string', function() {
    var result = functionName('');
    assert.strictEqual(result, '');
  });

  it('should handle edge case: null input', function() {
    assert.throws(function() { functionName(null); }, TypeError);
  });
});
```

## Scope — ONLY test pure functions
| Module | Testable Exports |
|--------|-----------------|
| services/matcher.js | levenshteinDistance, normalizeName, findMatches |
| services/vcard.js | parseString, normalizePhone |
| services/template.js | render, extractVariables, getAvailableVariables |
| services/crypto.js | encrypt, decrypt (set ENCRYPTION_KEY first) |
| services/sms.js | normalizePhone, generateDeepLink, buildBatchData |
| services/csv.js | normalizeHeader, suggestMapping, suggestCrmlsMapping |
| config/ca-cities.js | expandCity |

## NEVER test: route handlers, DB queries, EJS templates, email sending, cron jobs, middleware

## Process
1. Read the source file to identify all exported functions
2. Write tests in `tests/unit/{module}.test.js`
3. Cover: normal cases, edge cases (null, undefined, empty, boundary values)
4. Run: `node --test tests/unit/{module}.test.js`
5. Fix any test bugs (never fix implementation to match tests)
6. Return: "Tests written: [count] tests in [file]. [pass/fail]. Coverage: [areas]"

## Rules
- Use `var` in test files for consistency with project convention
- For crypto tests: `process.env.ENCRYPTION_KEY = 'a'.repeat(32);` before require
- Every test must complete in under 100ms — no I/O, no network, no timers
- One `describe` per exported function, one `it` per behavior
```

### 5. CLAUDE.md Update

Add a skills section to the existing CLAUDE.md (append after the Agents table):

```markdown
## Skills (`.claude/skills/`)
  Project-level skills override global skills of the same name:

  | Skill | Purpose | Invocation |
  |-------|---------|------------|
  | `fixes` | Fix FIXES.md issues using SendReed conventions | `/fixes [set number]` |
  | `db-migrate` | Safe SQLite schema changes | `/db-migrate [description]` |
  | `test-run` | Run node:test suite | `/test-run [module]` |
```

---

## Tech Stack-Specific Recommendations

### CommonJS (Project Override of Global ESM)

**Problem:** The global `~/.claude/rules/code-style.md` says "Use ES module imports, not CommonJS." Every file edit in SendReed triggers this rule. Claude must constantly remember the project override.

**Solution:** The path-scoped `commonjs.md` rule (Section 2.1 above) explicitly overrides this for all `.js` files in the project. Path-scoped rules load only when matching files are being edited, making the override precise and token-efficient.

**Additional safeguard:** The enhanced `code-review.md` agent explicitly lists "CommonJS throughout" in its project context section, so review passes won't flag `require()` as a violation.

### Express.js Patterns

**Current coverage:** `express.md` rule file is comprehensive (handler pattern, pagination, admin conditional queries, flash messages, SSE).

**Gaps identified:**
- No mention of `express.static` configuration (exists in `server.js`)
- No guidance on middleware ordering (important: multer before CSRF on multipart routes is documented, but the general middleware chain isn't)
- Rate limiting for SMTP send endpoints isn't documented in rules (it's in `services/email.js` but not codified)

**Recommendation:** These are minor — the existing rule file is strong. Add a one-line note about multer ordering if it comes up in reviews frequently.

### EJS Templates

**Current coverage:** `frontend.md` covers template structure, CSRF injection, role-based visibility, and XSS prevention.

**Key pattern for Claude to enforce:**
- `<%= %>` for ALL user data (auto-escapes)
- `<%- %>` ONLY for `include()` calls and pre-escaped HTML
- `escapeHtml()` / `escapeAttr()` for JS-rendered content in `public/js/` files

**MCP integration:** Context7 has Express and EJS documentation. When editing templates, prompt Claude with "use context7" to pull current EJS syntax if needed. However, EJS is stable and rarely changes, so this is lower priority than using Context7 for nodemailer or better-sqlite3 updates.

### SQLite / better-sqlite3

**Current coverage:** `sqlite.md` rule file is thorough (WAL mode, prepared statements, ownership scoping, pagination, transactions).

**Key patterns:**
- Synchronous API: `.get()`, `.all()`, `.run()` — never async
- `db.transaction()` for bulk operations
- `db.pragma('table_info(table_name)')` for safe schema introspection
- Column existence checks before ALTER TABLE

**MCP integration:** Context7 has better-sqlite3 documentation. Useful for:
- Confirming API changes between versions (currently on ^11.0.0)
- Looking up pragma options for performance tuning
- Checking transaction isolation behavior

**The `/db-migrate` skill** (Section 1.2) codifies all SQLite conventions from the rule file into an actionable workflow, reducing the chance of schema mistakes.

### Nodemailer

**Current coverage:** `services.md` covers email sending patterns, daily limits, campaign states, and SMTP transport creation.

**MCP integration:** Context7 has nodemailer documentation. Useful for:
- OAuth2 transport configuration (if moving away from password-based SMTP)
- Attachment handling patterns
- Connection pooling options (currently creates transport per-send)

### PapaParse

**Current coverage:** `services.md` documents CSV parsing options (`header: true`, `skipEmptyLines: true`) and the two-step import flow.

**No additional tooling needed.** PapaParse's API is stable and the project's usage is straightforward.

### node-cron

**Current coverage:** `services.md` documents the cron schedule (`0 7 * * *`), timezone (`America/Los_Angeles`), and job responsibilities.

**No additional tooling needed.** Configuration is simple and well-documented.

---

## MCP Server Usage for SendReed

### Context7 — Priority Lookups for This Project

| Library | When to Use | Query Pattern |
|---------|-------------|---------------|
| better-sqlite3 | Schema changes, pragma options, API updates | `"better-sqlite3 [specific API]"` |
| nodemailer | Transport config, OAuth, attachments | `"nodemailer [feature]"` |
| Express.js | Middleware patterns, router API | `"express [pattern]"` |
| multer | File upload configuration | `"multer [option]"` |
| node-cron | Schedule syntax, timezone handling | `"node-cron [pattern]"` |

### Sequential Thinking — Use Cases for SendReed

- **Debugging campaign sending issues** (multi-step: check campaign state → check recipient states → check SMTP config → check rate limits → check email service logic)
- **Planning CRMLS pipeline changes** (4-stage process: CSV import → Realist lookup → vCard matching → contact enrichment)
- **Schema migration planning** (dependencies between tables, index strategy, backwards compatibility)

### GitHub MCP

- PR creation for fix sets
- Issue tracking if you move FIXES.md items to GitHub Issues
- Code search across the repo for pattern analysis

---

## Token Efficiency Specific to SendReed

### Context Budget

SendReed's `.claude/` configuration loads:
- CLAUDE.md: ~95 lines (~3,800 chars)
- 7 rule files: ~600 lines total (~24,000 chars) — but path-scoped rules load on demand
- 4 agent descriptions: ~80 chars each (~320 chars) — full prompts load only on invocation
- 3 project skill descriptions: ~120 chars each (~360 chars) — full SKILL.md loads only on invocation
- Global CLAUDE.md: ~45 lines (~1,800 chars)
- Global rules: ~600 chars (3 small files)
- Global skill descriptions: ~800 chars (8 × ~100 chars)
- MCP tool definitions: ~8,000 chars (GitHub + Context7 + Sequential Thinking)

**Estimated base context: ~40,000 chars (~10,000 tokens)** — well within the 5% recommended budget.

### Session Patterns for SendReed Work

| Task Type | Recommended Approach | Token Impact |
|-----------|---------------------|--------------|
| Single fix from FIXES.md | Direct implementation in main context | Low |
| Full fix set (5+ fixes) | `/fixes` skill with `context: fork` | Medium (isolated) |
| Schema migration | `/db-migrate` skill → implement → test | Low |
| Code review after changes | `/review` skill with `context: fork` | Medium (isolated) |
| New feature planning | `/plan` skill with `context: fork` | Medium (isolated) |
| Test writing | Delegate to test-writer agent via Task tool | Medium (isolated) |
| CRMLS pipeline changes | `/work` with plan mode first | High (complex) |

### Compaction Priorities for SendReed

When compacting, preserve:
- Current fix set progress (which fixes done, which remaining)
- File paths modified in this session
- Any SQL schema changes made
- Test results from last run
- Campaign state if debugging email sending

Discard:
- Exploration of rule files (they'll reload)
- Full file contents already committed
- Failed approaches to fixes
- Agent research output (saved to files)

---

## Execution Order

| Step | Action | Dependencies | Priority |
|------|--------|-------------|----------|
| 1 | Create `project/.claude/skills/` directory | None | High |
| 2 | Create `skills/fixes/SKILL.md` | Step 1 | High |
| 3 | Create `skills/db-migrate/SKILL.md` | Step 1 | Medium |
| 4 | Create `skills/test-run/SKILL.md` | Step 1 | Medium |
| 5 | Create `rules/commonjs.md` (path-scoped) | None | High |
| 6 | Update `agents/code-review.md` with enhanced version | None | Medium |
| 7 | Update `agents/test-writer.md` with enhanced version | None | Medium |
| 8 | Replace `settings.json` with expanded version | None | High |
| 9 | Update `CLAUDE.md` with skills table | Steps 2-4 | Low |
| 10 | Create `tests/unit/` directory structure | None | Medium |
| 11 | **Verify**: Test `/fixes`, `/db-migrate`, `/test-run` in new session | Steps 1-9 | Required |

---

## Verification Plan

After implementation, verify in a new Claude Code session:

1. **Skills loaded**: Run `/help` or check skills list — should show `fixes`, `db-migrate`, `test-run` as project-level
2. **CommonJS rule active**: Edit a `.js` file, then ask Claude about module conventions — should say CommonJS
3. **TaskCompleted hook**: Make a code change, complete a task — should auto-run `npm test` (if tests exist)
4. **Settings merged**: The project `settings.json` hooks should layer on top of global hooks (both apply)
5. **Agent enhanced**: Invoke code-review agent — should check SendReed-specific items (ownership scoping, CSRF, CommonJS)
6. **Skill override**: Run `/fixes` — should use the project-level version (mentions "set-based format")
7. **DB migrate**: Run `/db-migrate add status column to campaigns` — should follow SQLite conventions from rules

---

## Summary of Changes

| Category | Files Created | Files Modified | Files Removed |
|----------|--------------|----------------|---------------|
| Skills | 3 (fixes, db-migrate, test-run) | 0 | 0 |
| Rules | 1 (commonjs.md) | 0 | 0 |
| Agents | 0 | 2 (code-review, test-writer) | 0 |
| Settings | 0 | 1 (settings.json) | 0 |
| CLAUDE.md | 0 | 1 (add skills table) | 0 |
| Tests | 1 (tests/unit/ directory) | 0 | 0 |
| **Total** | **5** | **4** | **0** |

This implementation adds project-level skills that override global defaults with SendReed-specific knowledge, closes the TaskCompleted hook gap, reinforces CommonJS conventions via path-scoping, and enhances agents with explicit project context. All changes are additive — no existing functionality is removed or broken.
