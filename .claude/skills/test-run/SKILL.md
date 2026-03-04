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
