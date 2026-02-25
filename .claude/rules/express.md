# Express Routing Rules
> See also: `security.md` (CSRF, auth middleware), `sqlite.md` (query patterns used in handlers), `services.md` (business logic routes delegate to)

## Module System
- CommonJS throughout: `require()` / `module.exports` — no ES modules

## Route Organization
- One router file per domain in `routes/` (e.g., `auth.js`, `contacts.js`, `campaigns.js`, `admin.js`)
- Mounted in `server.js`: `app.use('/contacts', require('./routes/contacts'))`
- Each router creates its own `express.Router()` instance

## Middleware Application
- Auth middleware applied at router level: `router.use(requireAuth)`
- Role restrictions at router level for entire sections: `router.use(requireRole('admin'))`
- Route-specific middleware stacked in handler array when needed
- Multer applied per-route: `router.post('/import', upload.single('csvfile'), handler)`
- CSRF verified after multer on multipart forms (multer must parse body first)

## Route Handler Pattern
- Every handler wrapped in try-catch:
  ```js
  router.get('/', (req, res) => {
    try {
      const data = db.prepare('...').all(params);
      res.render('template', { data, user: req.session.user });
    } catch (err) {
      console.error('Context:', err);
      res.status(500).render('error', { status: 500, message: 'User-friendly message.' });
    }
  });
  ```
- Parse params safely: `parseInt(req.params.id)`, `req.query.page || 1`
- Validate ownership before returning/modifying any resource

## Response Patterns
- **Page render**: `res.render('views/template', { locals })`
- **JSON API**: `res.json({ success: true, data })` or `res.status(400).json({ error: 'message' })`
- **Form submit**: flash message + redirect:
  ```js
  setFlash(req, 'success', 'Contact saved.');
  res.redirect('/contacts');
  ```
- **SSE stream**: `res.writeHead(200, { 'Content-Type': 'text/event-stream' })` then `res.write()`
- **Error page**: `res.status(code).render('error', { status: code, message })`

## API Endpoint Conventions
- RESTful verbs: GET (list/read), POST (create), PUT (update), DELETE (remove)
- URL pattern: `/api/{resource}` and `/api/{resource}/:id`
- Bulk actions: `POST /api/{resource}/bulk-delete` with `{ ids: [...] }`
- Single-field updates: `PUT /api/{resource}/:id` with `{ field, value }`
- Always return JSON with `success` boolean or `error` string

## Pagination (Server-Side)
```js
const page = Math.max(1, parseInt(req.query.page) || 1);
const perPage = 25;
const offset = (page - 1) * perPage;
const total = db.prepare('SELECT COUNT(*) as c FROM ...').get(params).c;
const totalPages = Math.max(1, Math.ceil(total / perPage));
const items = db.prepare('... LIMIT ? OFFSET ?').all(...params, perPage, offset);
res.render('template', { items, currentPage: page, totalPages, totalCount: total });
```

## Admin Conditional Queries
- Admins see all data; regular users see only their own:
  ```js
  const isAdmin = req.session.user.role === 'admin';
  let where = isAdmin ? '1=1' : 'owner_id = ?';
  let params = isAdmin ? [] : [userId];
  ```
- Admin can filter by user: append `owner_id = ?` when `req.query.user_id` is set

## File Uploads
- Use multer with size limits (`5 * 1024 * 1024`) and file type filters
- Clean up temp files after processing: `fs.unlinkSync(filePath)`
- Store intermediate parsing results in `req.session` for multi-step flows

## Session Data
- User object: `req.session.user = { id, email, name, role }` — minimal fields only
- Flash messages via `setFlash(req, type, message)` — consumed on next request
- Temporary import state stored in `req.session.{feature}Import`

## Flash Messages
```js
// Set
setFlash(req, 'success', 'Action completed.');
setFlash(req, 'error', 'Something went wrong.');

// Consumed automatically by middleware → res.locals.flash
```
