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
