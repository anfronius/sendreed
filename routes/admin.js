const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/init');
const { requireRole, setFlash } = require('../middleware/auth');
const { encrypt } = require('../services/crypto');
const providers = require('../config/providers.json');

const router = express.Router();

router.use(requireRole('admin'));

// Redirect /admin to /admin/users
router.get('/', (req, res) => {
  res.redirect('/admin/users');
});

// Users list with per-user stats
router.get('/users', (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT u.id, u.email, u.name, u.role, u.smtp_provider, u.created_at,
        (SELECT COUNT(*) FROM contacts WHERE owner_id = u.id) as contact_count,
        (SELECT COUNT(*) FROM templates WHERE owner_id = u.id) as template_count,
        (SELECT COUNT(*) FROM campaigns WHERE owner_id = u.id) as campaign_count
      FROM users u ORDER BY u.created_at DESC
    `).all();
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

/**
 * Wipe all data for a user (contacts, templates, campaigns, campaign_recipients).
 * Does NOT delete the user account itself.
 */
function wipeUserData(db, userId) {
  // Delete campaign_recipients for user's campaigns
  db.prepare(
    'DELETE FROM campaign_recipients WHERE campaign_id IN (SELECT id FROM campaigns WHERE owner_id = ?)'
  ).run(userId);
  // Delete campaigns
  db.prepare('DELETE FROM campaigns WHERE owner_id = ?').run(userId);
  // Delete templates
  db.prepare('DELETE FROM templates WHERE owner_id = ?').run(userId);
  // Delete contacts
  db.prepare('DELETE FROM contacts WHERE owner_id = ?').run(userId);
}

// Wipe user data (keep account)
router.post('/users/:id/wipe', (req, res) => {
  try {
    const db = getDb();
    const targetId = parseInt(req.params.id);
    if (targetId === req.session.user.id) {
      setFlash(req, 'error', 'You cannot wipe your own data.');
      return res.redirect('/admin/users');
    }
    const wipe = db.transaction(() => {
      wipeUserData(db, targetId);
    });
    wipe();
    setFlash(req, 'success', 'All data wiped for user.');
    res.redirect('/admin/users');
  } catch (err) {
    console.error('Wipe user data error:', err);
    setFlash(req, 'error', 'Failed to wipe user data.');
    res.redirect('/admin/users');
  }
});

// Delete user (and all associated data)
router.post('/users/:id/delete', (req, res) => {
  try {
    const db = getDb();
    const targetId = parseInt(req.params.id);
    if (targetId === req.session.user.id) {
      setFlash(req, 'error', 'You cannot delete your own account.');
      return res.redirect('/admin/users');
    }
    const deleteAll = db.transaction(() => {
      wipeUserData(db, targetId);
      db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    });
    deleteAll();
    setFlash(req, 'success', 'User and all associated data deleted.');
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
