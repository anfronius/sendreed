const express = require('express');
const { getDb } = require('../db/init');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';

    let contactCount, templateCount, campaignCount;
    let userStats = [];

    if (isAdmin) {
      // Per-user stats for admin dashboard
      userStats = db.prepare(`
        SELECT u.id, u.name, u.role,
          (SELECT COUNT(*) FROM contacts WHERE owner_id = u.id) as contacts,
          (SELECT COUNT(*) FROM templates WHERE owner_id = u.id) as templates,
          (SELECT COUNT(*) FROM campaigns WHERE owner_id = u.id) as campaigns
        FROM users u ORDER BY u.name
      `).all();
      contactCount = userStats.reduce((sum, u) => sum + u.contacts, 0);
      templateCount = userStats.reduce((sum, u) => sum + u.templates, 0);
      campaignCount = userStats.reduce((sum, u) => sum + u.campaigns, 0);
    } else {
      contactCount = db.prepare('SELECT COUNT(*) as c FROM contacts WHERE owner_id = ?').get(userId).c;
      templateCount = db.prepare('SELECT COUNT(*) as c FROM templates WHERE owner_id = ?').get(userId).c;
      campaignCount = db.prepare('SELECT COUNT(*) as c FROM campaigns WHERE owner_id = ?').get(userId).c;
    }

    // Anniversary count for realestate/admin users
    let anniversaryCount = 0;
    const role = req.session.user.role;
    if (role === 'realestate' || role === 'admin') {
      anniversaryCount = db.prepare(
        "SELECT COUNT(*) as c FROM anniversary_log WHERE status = 'pending' AND anniversary_date BETWEEN date('now') AND date('now', '+7 days')"
      ).get().c;
    }

    res.render('dashboard', { title: 'Dashboard', contactCount, templateCount, campaignCount, anniversaryCount, userStats });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).render('error', { status: 500, message: 'Failed to load dashboard.' });
  }
});

module.exports = router;
