const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/init');
const { requireRole, setFlash } = require('../middleware/auth');
const { encrypt } = require('../services/crypto');
const providers = require('../config/providers.json');

const router = express.Router();

router.use(requireRole('admin'));

// Admin dashboard
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const contactCount = db.prepare('SELECT COUNT(*) as c FROM contacts').get().c;
    const campaignCount = db.prepare('SELECT COUNT(*) as c FROM campaigns').get().c;
    res.render('admin/dashboard', { title: 'Admin', userCount, contactCount, campaignCount });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).render('error', { status: 500, message: 'Failed to load admin dashboard.' });
  }
});

// Users list
router.get('/users', (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare('SELECT id, email, name, role, smtp_provider, created_at FROM users ORDER BY created_at DESC').all();
    res.render('admin/users', { title: 'Users', users });
  } catch (err) {
    console.error('Users list error:', err);
    res.status(500).render('error', { status: 500, message: 'Failed to load users.' });
  }
});

// Create user
router.post('/users', (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      setFlash(req, 'error', 'All fields are required.');
      return res.redirect('/admin/users');
    }
    if (!['admin', 'nonprofit', 'realestate'].includes(role)) {
      setFlash(req, 'error', 'Invalid role.');
      return res.redirect('/admin/users');
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      setFlash(req, 'error', 'A user with that email already exists.');
      return res.redirect('/admin/users');
    }

    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name, email, hash, role);

    setFlash(req, 'success', 'User created successfully.');
    res.redirect('/admin/users');
  } catch (err) {
    console.error('Create user error:', err);
    setFlash(req, 'error', 'Failed to create user.');
    res.redirect('/admin/users');
  }
});

// Delete user
router.post('/users/:id/delete', (req, res) => {
  try {
    const db = getDb();
    const targetId = parseInt(req.params.id);
    if (targetId === req.session.user.id) {
      setFlash(req, 'error', 'You cannot delete your own account.');
      return res.redirect('/admin/users');
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    setFlash(req, 'success', 'User deleted.');
    res.redirect('/admin/users');
  } catch (err) {
    console.error('Delete user error:', err);
    setFlash(req, 'error', 'Failed to delete user.');
    res.redirect('/admin/users');
  }
});

// SMTP config page
router.get('/users/:id/smtp', (req, res) => {
  try {
    const db = getDb();
    const targetUser = db.prepare('SELECT id, email, name, role, smtp_provider, smtp_host, smtp_port, smtp_email, smtp_password_encrypted FROM users WHERE id = ?').get(parseInt(req.params.id));
    if (!targetUser) {
      setFlash(req, 'error', 'User not found.');
      return res.redirect('/admin/users');
    }
    res.render('admin/smtp-config', { title: 'SMTP Config', targetUser, providers });
  } catch (err) {
    console.error('SMTP config error:', err);
    res.status(500).render('error', { status: 500, message: 'Failed to load SMTP config.' });
  }
});

// Save SMTP config
router.post('/users/:id/smtp', (req, res) => {
  try {
    const db = getDb();
    const targetId = parseInt(req.params.id);
    const { smtp_provider, smtp_host, smtp_port, smtp_email, smtp_password } = req.body;

    const updates = {
      smtp_provider: smtp_provider || null,
      smtp_host: smtp_host || null,
      smtp_port: smtp_port ? parseInt(smtp_port) : null,
      smtp_email: smtp_email || null,
    };

    // Only update password if provided (non-empty)
    if (smtp_password) {
      updates.smtp_password_encrypted = encrypt(smtp_password);
      db.prepare(
        'UPDATE users SET smtp_provider = ?, smtp_host = ?, smtp_port = ?, smtp_email = ?, smtp_password_encrypted = ? WHERE id = ?'
      ).run(updates.smtp_provider, updates.smtp_host, updates.smtp_port, updates.smtp_email, updates.smtp_password_encrypted, targetId);
    } else {
      db.prepare(
        'UPDATE users SET smtp_provider = ?, smtp_host = ?, smtp_port = ?, smtp_email = ? WHERE id = ?'
      ).run(updates.smtp_provider, updates.smtp_host, updates.smtp_port, updates.smtp_email, targetId);
    }

    setFlash(req, 'success', 'SMTP settings saved.');
    res.redirect('/admin/users/' + targetId + '/smtp');
  } catch (err) {
    console.error('Save SMTP error:', err);
    setFlash(req, 'error', 'Failed to save SMTP settings.');
    res.redirect('/admin/users/' + req.params.id + '/smtp');
  }
});

module.exports = router;
