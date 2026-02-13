const crypto = require('crypto');

function csrfMiddleware(req, res, next) {
  // Generate token if not present
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  // Skip validation for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Defer validation for multipart/form-data (body not yet parsed by multer)
  if (req.is('multipart/form-data')) {
    return next();
  }

  const token = req.body._csrf || req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).send('Invalid CSRF token');
  }

  next();
}

// Call this after multer has parsed the multipart body
function verifyCsrf(req, res, next) {
  const token = req.body._csrf || req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).send('Invalid CSRF token');
  }
  next();
}

module.exports = { csrfMiddleware, verifyCsrf };
