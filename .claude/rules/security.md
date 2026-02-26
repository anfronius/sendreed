# Security Rules
> See also: `sqlite.md` (prepared statements), `frontend.md` (CSRF in forms, XSS in templates), `express.md` (middleware application)

## Authentication
- Passwords hashed with `bcryptjs` (10 salt rounds) — never store plaintext
- Session via `express-session` + `connect-sqlite3` store
- Session cookies: `httpOnly: true`, `sameSite: 'strict'`, `secure` in production
- Max session age: 24 hours
- Minimal session payload: `{ id, email, name, role }` — no sensitive data

## Authorization
- `requireAuth` middleware on all authenticated routes
- `requireRole(...roles)` for role-restricted sections
- Three roles: `admin`, `nonprofit`, `realestate`
- Every data query must verify `owner_id` matches `req.session.user.id` (unless admin)
- Never trust client-supplied IDs without ownership validation

## CSRF Protection
- Token generated per session: `crypto.randomBytes(32).toString('hex')`
- Validated on all POST/PUT/DELETE requests
- Token sources: `req.body._csrf` (forms) or `X-CSRF-Token` header (AJAX)
- Multipart forms: CSRF checked after multer parses the body
- Token exposed to client via `res.locals.csrfToken` and `window.CSRF_TOKEN`

## Encryption at Rest
- SMTP passwords encrypted with AES-256-CBC before storage
- Format: `iv_hex:ciphertext_hex`
- Key from `ENCRYPTION_KEY` env var (32 hex characters = 16 bytes)
- Decrypted only at transport creation time — never logged or exposed

## SQL Injection Prevention
- **Always** use prepared statements with `?` placeholders
- Never interpolate user input into SQL strings
- Parameterize all WHERE, INSERT, UPDATE values

## XSS Prevention
- EJS `<%= %>` auto-escapes by default — use it for all user data
- `<%- %>` (unescaped) only for trusted includes and pre-escaped HTML
- `escapeHtml()` / `escapeAttr()` helpers for dynamic JS-rendered content
- Sanitize input on the way in with `trimBody` middleware

## Input Validation
- `trimBody` middleware trims all string fields in `req.body`
- Validate expected types: `parseInt()` for IDs, type checks for strings
- File uploads: enforce MIME type and extension checks in multer `fileFilter`
- File size limits: 5MB default via multer `limits`

## Environment Secrets
- Never commit `.env` files or credentials to git
- Required env vars: `SESSION_SECRET`, `ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- Default fallbacks only in development (`'dev-secret-change-me'`)
