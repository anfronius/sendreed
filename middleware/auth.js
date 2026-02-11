function flashMiddleware(req, res, next) {
  res.locals.flash = req.session.flash || {};
  delete req.session.flash;
  res.locals.user = req.session.user || null;
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

module.exports = { flashMiddleware, setFlash, requireAuth, requireRole };
