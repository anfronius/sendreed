const express = require('express');
const { getDb } = require('../db/init');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';

    const contactCount = isAdmin
      ? db.prepare('SELECT COUNT(*) as c FROM contacts').get().c
      : db.prepare('SELECT COUNT(*) as c FROM contacts WHERE owner_id = ?').get(userId).c;

    const templateCount = isAdmin
      ? db.prepare('SELECT COUNT(*) as c FROM templates').get().c
      : db.prepare('SELECT COUNT(*) as c FROM templates WHERE owner_id = ?').get(userId).c;

    const campaignCount = isAdmin
      ? db.prepare('SELECT COUNT(*) as c FROM campaigns').get().c
      : db.prepare('SELECT COUNT(*) as c FROM campaigns WHERE owner_id = ?').get(userId).c;

    res.render('dashboard', { title: 'Dashboard', contactCount, templateCount, campaignCount });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).render('error', { status: 500, message: 'Failed to load dashboard.' });
  }
});

module.exports = router;
