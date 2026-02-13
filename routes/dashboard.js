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

    // Anniversary and holiday counts for realestate/admin users
    let anniversaryCount = 0;
    let holidayCount = 0;
    const role = req.session.user.role;
    if (role === 'realestate' || role === 'admin') {
      anniversaryCount = db.prepare(
        "SELECT COUNT(*) as c FROM anniversary_log WHERE status = 'pending' AND anniversary_date BETWEEN date('now') AND date('now', '+7 days')"
      ).get().c;
      holidayCount = db.prepare(
        "SELECT COUNT(*) as c FROM holidays WHERE date BETWEEN date('now') AND date('now', '+7 days')"
      ).get().c;
    }

    res.render('dashboard', { title: 'Dashboard', contactCount, templateCount, campaignCount, anniversaryCount, holidayCount });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).render('error', { status: 500, message: 'Failed to load dashboard.' });
  }
});

module.exports = router;
