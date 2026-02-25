var { getDb } = require('../db/init');

function flashMiddleware(req, res, next) {
  res.locals.flash = req.session.flash || {};
  delete req.session.flash;
  res.locals.user = req.session.user || null;

  // Admin acting-as context
  res.locals.actingUser = null;
  res.locals.allUsers = [];
  if (req.session.user && req.session.user.role === 'admin') {
    var db = getDb();
    res.locals.allUsers = db.prepare(
      "SELECT id, name, email, role FROM users WHERE role != 'admin' ORDER BY name"
    ).all();
    if (req.session.actingAsUserId) {
      var target = db.prepare(
        "SELECT id, name, email, role FROM users WHERE id = ? AND role != 'admin'"
      ).get(req.session.actingAsUserId);
      if (target) {
        res.locals.actingUser = target;
      } else {
        // Target user was deleted or became admin; clear the stale reference
        delete req.session.actingAsUserId;
      }
    }
  }

  next();
}

function setFlash(req, type, message) {
  if (!req.session.flash) req.session.flash = {};
  req.session.flash[type] = message;
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    setFlash(req, 'error', 'Please log in to continue.');
    return res.redirect('/auth/login');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      setFlash(req, 'error', 'Please log in to continue.');
      return res.redirect('/auth/login');
    }
    if (!roles.includes(req.session.user.role)) {
      setFlash(req, 'error', 'You do not have permission to access that page.');
      return res.redirect('/dashboard');
    }
    next();
  };
}

/**
 * Get the effective owner ID for data creation.
 * Non-admin users: their own ID.
 * Admin users: the acting-as user's ID, or null if not set.
 */
function getEffectiveOwnerId(req) {
  if (req.session.user.role !== 'admin') {
    return req.session.user.id;
  }
  return req.session.actingAsUserId || null;
}

/**
 * Get the effective user role for field/template context.
 * Non-admin users: their own role.
 * Admin users: the acting-as user's role, or null if not set.
 */
function getEffectiveRole(req, res) {
  if (req.session.user.role !== 'admin') {
    return req.session.user.role;
  }
  return res.locals.actingUser ? res.locals.actingUser.role : null;
}

module.exports = { flashMiddleware, setFlash, requireAuth, requireRole, getEffectiveOwnerId, getEffectiveRole };
