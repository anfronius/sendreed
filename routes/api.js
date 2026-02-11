const express = require('express');
const nodemailer = require('nodemailer');
const { requireRole } = require('../middleware/auth');
const { getDb } = require('../db/init');
const { decrypt } = require('../services/crypto');
const providers = require('../config/providers.json');

const router = express.Router();

// Test SMTP connection
router.post('/smtp-test', requireRole('admin'), async (req, res) => {
  try {
    const { smtp_provider, smtp_host, smtp_port, smtp_email, smtp_password, user_id } = req.body;

    const host = smtp_host || (providers[smtp_provider] && providers[smtp_provider].host);
    const port = parseInt(smtp_port) || (providers[smtp_provider] && providers[smtp_provider].port);
    const secure = providers[smtp_provider] ? providers[smtp_provider].secure : (port === 465);

    // Use provided password, or fall back to stored encrypted password
    let password = smtp_password;
    if (!password && user_id) {
      const db = getDb();
      const user = db.prepare('SELECT smtp_password_encrypted FROM users WHERE id = ?').get(parseInt(user_id));
      if (user && user.smtp_password_encrypted) {
        password = decrypt(user.smtp_password_encrypted);
      }
    }

    if (!host || !port || !smtp_email || !password) {
      return res.json({ success: false, error: 'Missing SMTP configuration fields.' });
    }

    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: smtp_email, pass: password },
      tls: { rejectUnauthorized: true },
    });

    await transport.verify();
    transport.close();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
