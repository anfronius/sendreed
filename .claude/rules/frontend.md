# Frontend UI Rules
> See also: `security.md` (CSRF tokens, XSS prevention in templates), `express.md` (API endpoints the frontend calls)

## Technology
- EJS templates + vanilla JavaScript — no frameworks, no jQuery, no TypeScript
- CSS is hand-written — no preprocessors or CSS frameworks

## EJS Template Structure
- Every page includes `layout-header.ejs` at top and `layout-footer.ejs` at bottom
- Pass page title and scripts array to layout:
  ```ejs
  <%- include('../layout-header', { title: 'Page Name' }) %>
  <!-- page content -->
  <%- include('../layout-footer', { scripts: ['/js/page.js'] }) %>
  ```
- CSRF token is injected globally: `window.CSRF_TOKEN = '<%= csrfToken %>'`
- Use partials for reusable fragments (`partials/flash.ejs`, `partials/pagination.ejs`, `partials/nav.ejs`)
- Role-based visibility in templates: `<% if (user.role === 'admin') { %>`

## JavaScript Conventions
- Wrap everything in `DOMContentLoaded` with early-return guard:
  ```js
  document.addEventListener('DOMContentLoaded', function() {
    var el = document.getElementById('target');
    if (!el) return;
    // ...
  });
  ```
- Use `var` (not `let`/`const`) for broad browser compatibility
- Use `function` declarations, not arrow functions
- Use event delegation on parent containers, check target with `.closest()`
- Multi-step wizards use a local `state` object to track progress

## AJAX / Fetch Pattern
- Always include CSRF token header on mutations:
  ```js
  fetch('/api/endpoint', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': window.CSRF_TOKEN,
    },
    body: JSON.stringify(payload),
  })
  .then(function(r) { return r.json(); })
  .then(function(data) { if (data.success) { /* update UI */ } });
  ```
- Use `.then()` chains (not `async/await`) in browser JS for compatibility
- Handle errors gracefully — show user feedback, never silent failures

## Inline Editing
- Editable fields use `.editable` class on `<span>` elements
- Click converts span to `<input>`, save on blur or Enter, cancel on Escape
- On save: PUT to `/api/{resource}/{id}` with `{ field, value }`
- On error: restore original text and show visual feedback

## SSE (Server-Sent Events)
- Client creates `EventSource` for progress streams
- Parse `event.data` as JSON, update progress UI
- Close source when `data.done` is true
- Implement polling fallback on `onerror`

## Bulk Operations
- "Select all" checkbox toggles individual checkboxes
- Track selected count in real-time, update UI counters
- Confirm destructive bulk actions with `confirm()` dialog
- POST to `/api/{resource}/bulk-delete` with `{ ids: [...] }`

## CSS Conventions
- Class naming: hyphen-separated, BEM-like (`.btn-primary`, `.data-table`, `.flash-success`)
- Status badges: `.badge-status-{state}` (e.g., `.badge-status-sending`)
- Component prefixes: `.wizard-`, `.page-`, `.form-`
- Utility classes: `.btn-sm`, `.btn-full`, `.table-responsive`
- Color palette:
  - Primary: `#2563eb` | Secondary: `#475569` | Danger: `#dc2626`
  - Background: `#f5f5f5` | Success bg: `#dcfce7` | Error bg: `#fee2e2`
- Layout: flexbox and CSS grid, mobile-responsive
  - `.form-row`: `grid-template-columns: 1fr 1fr`
  - `.stats-grid`: `repeat(auto-fit, minmax(180px, 1fr))`

## Security in Templates
- Use `escapeHtml()` / `escapeAttr()` helpers when rendering user data
- Never use `<%-` (unescaped) for user-supplied content — only for includes and trusted HTML
- CSRF hidden input in every `<form>`: `<input type="hidden" name="_csrf" value="<%= csrfToken %>">`
