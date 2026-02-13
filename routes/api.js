const express = require('express');
const nodemailer = require('nodemailer');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getDb } = require('../db/init');
const { decrypt } = require('../services/crypto');
const providers = require('../config/providers.json');
const templateService = require('../services/template');
const { getDailyCount, getDailyLimit } = require('../services/email');

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

// ========== CONTACTS API ==========

const CONTACT_EDITABLE_FIELDS = [
  'first_name', 'last_name', 'email', 'phone', 'organization', 'title',
  'district', 'city', 'state', 'zip', 'property_address', 'purchase_date',
  'purchase_price', 'notes',
];

// GET /api/contacts — JSON contacts (filterable by channel)
router.get('/contacts', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const channel = req.query.channel;
    const search = req.query.search || '';

    let where = isAdmin ? '1=1' : 'owner_id = ?';
    const params = isAdmin ? [] : [userId];

    if (channel === 'email') {
      where += " AND email IS NOT NULL AND email != ''";
    } else if (channel === 'sms') {
      where += " AND phone IS NOT NULL AND phone != ''";
    }

    if (search) {
      where += " AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const contacts = db.prepare(
      `SELECT * FROM contacts WHERE ${where} ORDER BY last_name, first_name`
    ).all(...params);

    res.json({ contacts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contacts — create single contact
router.post('/contacts', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const data = {};
    for (const field of CONTACT_EDITABLE_FIELDS) {
      if (req.body[field] !== undefined) {
        data[field] = req.body[field] || null;
      }
    }

    const fields = Object.keys(data);
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map(f => data[f]);

    const result = db.prepare(
      `INSERT INTO contacts (owner_id, ${fields.join(', ')}) VALUES (?, ${placeholders})`
    ).run(userId, ...values);

    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/contacts/:id — inline field edit
router.put('/contacts/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const contactId = parseInt(req.params.id);
    const { field, value } = req.body;

    if (!CONTACT_EDITABLE_FIELDS.includes(field)) {
      return res.status(400).json({ error: 'Invalid field.' });
    }

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
    if (!contact || (!isAdmin && contact.owner_id !== userId)) {
      return res.status(404).json({ error: 'Contact not found.' });
    }

    // Set source to 'manual' when editing phone or email
    if (field === 'phone') {
      db.prepare('UPDATE contacts SET phone = ?, phone_source = ? WHERE id = ?').run(value || null, 'manual', contactId);
    } else if (field === 'email') {
      db.prepare('UPDATE contacts SET email = ?, email_source = ? WHERE id = ?').run(value || null, 'manual', contactId);
    } else {
      db.prepare(`UPDATE contacts SET ${field} = ? WHERE id = ?`).run(value || null, contactId);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/contacts/:id
router.delete('/contacts/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const contactId = parseInt(req.params.id);

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
    if (!contact || (!isAdmin && contact.owner_id !== userId)) {
      return res.status(404).json({ error: 'Contact not found.' });
    }

    db.prepare('DELETE FROM contacts WHERE id = ?').run(contactId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== TEMPLATES API ==========

// GET /api/templates — JSON templates (filterable by channel)
router.get('/templates', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const channel = req.query.channel;

    let where = isAdmin ? '1=1' : 'owner_id = ?';
    const params = isAdmin ? [] : [userId];

    if (channel) {
      where += ' AND channel = ?';
      params.push(channel);
    }

    const templates = db.prepare(
      `SELECT * FROM templates WHERE ${where} ORDER BY name`
    ).all(...params);

    res.json({ templates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates — create template
router.post('/templates', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const { name, channel, subject_template, body_template } = req.body;

    if (!name || !channel || !body_template) {
      return res.status(400).json({ error: 'Name, channel, and body are required.' });
    }
    if (!['email', 'sms'].includes(channel)) {
      return res.status(400).json({ error: 'Invalid channel.' });
    }

    const result = db.prepare(
      'INSERT INTO templates (owner_id, name, channel, subject_template, body_template) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, name, channel, subject_template || null, body_template);

    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/templates/:id — update template
router.put('/templates/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const templateId = parseInt(req.params.id);

    const tmpl = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId);
    if (!tmpl || (!isAdmin && tmpl.owner_id !== userId)) {
      return res.status(404).json({ error: 'Template not found.' });
    }

    const { name, subject_template, body_template } = req.body;
    db.prepare(
      'UPDATE templates SET name = ?, subject_template = ?, body_template = ? WHERE id = ?'
    ).run(name || tmpl.name, subject_template !== undefined ? subject_template : tmpl.subject_template, body_template || tmpl.body_template, templateId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/templates/:id
router.delete('/templates/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const templateId = parseInt(req.params.id);

    const tmpl = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId);
    if (!tmpl || (!isAdmin && tmpl.owner_id !== userId)) {
      return res.status(404).json({ error: 'Template not found.' });
    }

    db.prepare('DELETE FROM templates WHERE id = ?').run(templateId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates/preview — render template with sample data
router.post('/templates/preview', requireAuth, (req, res) => {
  try {
    const { template_text, subject_text, sample_contact } = req.body;
    const contact = sample_contact || {};
    const renderedBody = templateService.render(template_text || '', contact);
    const renderedSubject = subject_text ? templateService.render(subject_text, contact) : null;
    res.json({ renderedBody, renderedSubject });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== CAMPAIGN API ==========

// POST /api/campaign/:id/exclude — exclude recipient during review
router.post('/campaign/:id/exclude', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const campaignId = parseInt(req.params.id);
    const { recipient_id } = req.body;

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign || (!isAdmin && campaign.owner_id !== userId)) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    db.prepare(
      "UPDATE campaign_recipients SET status = 'excluded' WHERE id = ? AND campaign_id = ?"
    ).run(parseInt(recipient_id), campaignId);

    db.prepare(
      'UPDATE campaigns SET total_count = total_count - 1 WHERE id = ?'
    ).run(campaignId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaign/:id/include — re-include excluded recipient
router.post('/campaign/:id/include', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const campaignId = parseInt(req.params.id);
    const { recipient_id } = req.body;

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign || (!isAdmin && campaign.owner_id !== userId)) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    db.prepare(
      "UPDATE campaign_recipients SET status = 'pending' WHERE id = ? AND campaign_id = ?"
    ).run(parseInt(recipient_id), campaignId);

    db.prepare(
      'UPDATE campaigns SET total_count = total_count + 1 WHERE id = ?'
    ).run(campaignId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaign/:id/status — poll campaign status
router.get('/campaign/:id/status', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const campaignId = parseInt(req.params.id);

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign || (!isAdmin && campaign.owner_id !== userId)) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    res.json({
      status: campaign.status,
      sent_count: campaign.sent_count,
      failed_count: campaign.failed_count,
      total_count: campaign.total_count,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
