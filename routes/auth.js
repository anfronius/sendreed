const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/init');
const { setFlash } = require('../middleware/auth');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', { flash: res.locals.flash, csrfToken: res.locals.csrfToken });
});

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      setFlash(req, 'error', 'Email and password are required.');
      return res.redirect('/auth/login');
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      setFlash(req, 'error', 'Invalid email or password.');
      return res.redirect('/auth/login');
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    res.redirect('/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    setFlash(req, 'error', 'An error occurred. Please try again.');
    res.redirect('/auth/login');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
});

module.exports = router;
