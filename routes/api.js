const express = require('express');
const nodemailer = require('nodemailer');
const { requireAuth, requireRole, getEffectiveOwnerId } = require('../middleware/auth');
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
    const isAdmin = req.session.user.role === 'admin';
    const effectiveId = getEffectiveOwnerId(req);
    const channel = req.query.channel;
    const search = req.query.search || '';

    let where, params;
    if (isAdmin && effectiveId) {
      where = 'owner_id = ?';
      params = [effectiveId];
    } else if (isAdmin) {
      where = '1=1';
      params = [];
    } else {
      where = 'owner_id = ?';
      params = [effectiveId];
    }

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
    const ownerId = getEffectiveOwnerId(req);
    if (!ownerId) {
      return res.status(400).json({ error: 'Admin must select a user to act on behalf of.' });
    }
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
    ).run(ownerId, ...values);

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

// POST /api/contacts/bulk-delete — delete multiple contacts
router.post('/contacts/bulk-delete', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No contact IDs provided.' });
    }

    const deleteMany = db.transaction(() => {
      let deleted = 0;
      for (const id of ids) {
        const contactId = parseInt(id);
        if (isNaN(contactId)) continue;
        const contact = db.prepare('SELECT owner_id FROM contacts WHERE id = ?').get(contactId);
        if (!contact || (!isAdmin && contact.owner_id !== userId)) continue;
        db.prepare('DELETE FROM contacts WHERE id = ?').run(contactId);
        deleted++;
      }
      return deleted;
    });

    const deleted = deleteMany();
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== TEMPLATES API ==========

// GET /api/templates — JSON templates (filterable by channel)
router.get('/templates', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const isAdmin = req.session.user.role === 'admin';
    const effectiveId = getEffectiveOwnerId(req);
    const channel = req.query.channel;

    let where, params;
    if (isAdmin && effectiveId) {
      where = 'owner_id = ?';
      params = [effectiveId];
    } else if (isAdmin) {
      where = '1=1';
      params = [];
    } else {
      where = 'owner_id = ?';
      params = [effectiveId];
    }

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
    const ownerId = getEffectiveOwnerId(req);
    if (!ownerId) {
      return res.status(400).json({ error: 'Admin must select a user to act on behalf of.' });
    }
    const { name, channel, subject_template, body_template } = req.body;

    if (!name || !channel || !body_template) {
      return res.status(400).json({ error: 'Name, channel, and body are required.' });
    }
    if (!['email', 'sms'].includes(channel)) {
      return res.status(400).json({ error: 'Invalid channel.' });
    }

    const result = db.prepare(
      'INSERT INTO templates (owner_id, name, channel, subject_template, body_template) VALUES (?, ?, ?, ?, ?)'
    ).run(ownerId, name, channel, subject_template || null, body_template);

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

// ========== REALIST LOOKUP API ==========

// PUT /api/realist-lookup/:id — save owner name (auto-save)
router.put('/realist-lookup/:id', requireRole('realestate', 'admin'), (req, res) => {
  try {
    const db = getDb();
    const propId = parseInt(req.params.id);
    const { owner_name } = req.body;

    if (!owner_name || !owner_name.trim()) {
      return res.status(400).json({ error: 'Owner name is required.' });
    }

    const prop = db.prepare('SELECT * FROM crmls_properties WHERE id = ?').get(propId);
    if (!prop) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    db.prepare(
      `UPDATE crmls_properties
       SET realist_owner_name = ?, realist_lookup_status = 'found', looked_up_at = datetime('now')
       WHERE id = ?`
    ).run(owner_name.trim(), propId);

    const counts = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN realist_lookup_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN realist_lookup_status = 'found' THEN 1 ELSE 0 END) as found,
        SUM(CASE WHEN realist_lookup_status = 'not_found' THEN 1 ELSE 0 END) as not_found
      FROM crmls_properties
    `).get();

    res.json({ success: true, counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/realist-lookup/:id/not-found — mark property as not found
router.post('/realist-lookup/:id/not-found', requireRole('realestate', 'admin'), (req, res) => {
  try {
    const db = getDb();
    const propId = parseInt(req.params.id);

    const prop = db.prepare('SELECT * FROM crmls_properties WHERE id = ?').get(propId);
    if (!prop) {
      return res.status(404).json({ error: 'Property not found.' });
    }

    db.prepare(
      `UPDATE crmls_properties
       SET realist_lookup_status = 'not_found', realist_owner_name = NULL, looked_up_at = datetime('now')
       WHERE id = ?`
    ).run(propId);

    const counts = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN realist_lookup_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN realist_lookup_status = 'found' THEN 1 ELSE 0 END) as found,
        SUM(CASE WHEN realist_lookup_status = 'not_found' THEN 1 ELSE 0 END) as not_found
      FROM crmls_properties
    `).get();

    res.json({ success: true, counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/realist-lookup/bulk-not-found — mark multiple properties as not found
router.post('/realist-lookup/bulk-not-found', requireRole('realestate', 'admin'), (req, res) => {
  try {
    const db = getDb();
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No property IDs provided.' });
    }

    const updateStmt = db.prepare(
      "UPDATE crmls_properties SET realist_lookup_status = 'not_found', realist_owner_name = NULL, looked_up_at = datetime('now') WHERE id = ?"
    );
    const bulkUpdate = db.transaction(() => {
      for (const id of ids) {
        updateStmt.run(parseInt(id));
      }
    });
    bulkUpdate();

    const counts = db.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN realist_lookup_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN realist_lookup_status = 'found' THEN 1 ELSE 0 END) as found,
        SUM(CASE WHEN realist_lookup_status = 'not_found' THEN 1 ELSE 0 END) as not_found
      FROM crmls_properties
    `).get();

    res.json({ success: true, counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/realist-lookup/bulk-delete — delete multiple properties
router.post('/realist-lookup/bulk-delete', requireRole('realestate', 'admin'), (req, res) => {
  try {
    const db = getDb();
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No property IDs provided.' });
    }

    const deleteStmt = db.prepare('DELETE FROM crmls_properties WHERE id = ?');
    const bulkDelete = db.transaction(() => {
      for (const id of ids) {
        deleteStmt.run(parseInt(id));
      }
    });
    bulkDelete();

    const counts = db.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN realist_lookup_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN realist_lookup_status = 'found' THEN 1 ELSE 0 END) as found,
        SUM(CASE WHEN realist_lookup_status = 'not_found' THEN 1 ELSE 0 END) as not_found
      FROM crmls_properties
    `).get();

    res.json({ success: true, counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== CITY MAPPINGS API ==========

// GET /api/city-mappings/unmapped — distinct unmapped city values with sample address (admin only)
router.get('/city-mappings/unmapped', requireRole('admin'), function(req, res) {
  try {
    var db = getDb();
    var rows = db.prepare(`
      SELECT cp.raw_city,
             MIN(cp.property_address) AS sample_address,
             COUNT(*) AS count
      FROM crmls_properties cp
      WHERE cp.raw_city IS NOT NULL
        AND cp.raw_city NOT IN (SELECT raw_city FROM city_mappings)
      GROUP BY cp.raw_city
      ORDER BY count DESC
    `).all();
    res.json({ success: true, unmapped: rows });
  } catch (err) {
    console.error('Unmapped cities error:', err);
    res.status(500).json({ error: 'Failed to load unmapped cities.' });
  }
});

// POST /api/city-mappings — save a mapping and bulk-update matching properties (admin only)
router.post('/city-mappings', requireRole('admin'), function(req, res) {
  try {
    var raw_city = (req.body.raw_city || '').trim();
    var mapped_city = (req.body.mapped_city || '').trim();
    if (!raw_city || !mapped_city) {
      return res.status(400).json({ error: 'raw_city and mapped_city are required.' });
    }
    var db = getDb();
    // Upsert the mapping
    db.prepare(
      'INSERT INTO city_mappings (raw_city, mapped_city, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ' +
      'ON CONFLICT(raw_city) DO UPDATE SET mapped_city = excluded.mapped_city, updated_at = CURRENT_TIMESTAMP'
    ).run(raw_city, mapped_city);
    // Bulk-update all matching properties
    var result = db.prepare(
      'UPDATE crmls_properties SET city = ? WHERE raw_city = ?'
    ).run(mapped_city, raw_city);
    res.json({ success: true, updated: result.changes });
  } catch (err) {
    console.error('City mapping save error:', err);
    res.status(500).json({ error: 'Failed to save city mapping.' });
  }
});

// ========== PHONE/EMAIL MATCHING API ==========

// POST /api/match/:id/confirm — confirm a match
router.post('/match/:id/confirm', requireRole('realestate', 'admin'), (req, res) => {
  try {
    const db = getDb();
    const matchId = parseInt(req.params.id);
    const userId = req.session.user.id;

    const match = db.prepare('SELECT * FROM phone_matches WHERE id = ?').get(matchId);
    if (!match) {
      return res.status(404).json({ error: 'Match not found.' });
    }

    db.prepare(
      "UPDATE phone_matches SET confirmed_at = datetime('now'), confirmed_by = ? WHERE id = ?"
    ).run(userId, matchId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/match/:id/skip — delete a match (skip it)
router.post('/match/:id/skip', requireRole('realestate', 'admin'), (req, res) => {
  try {
    const db = getDb();
    const matchId = parseInt(req.params.id);

    const match = db.prepare('SELECT * FROM phone_matches WHERE id = ?').get(matchId);
    if (!match) {
      return res.status(404).json({ error: 'Match not found.' });
    }

    db.prepare('DELETE FROM phone_matches WHERE id = ?').run(matchId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/match/:importedId/manual — manually assign imported contact to a contact
router.post('/match/:importedId/manual', requireRole('realestate', 'admin'), (req, res) => {
  try {
    const db = getDb();
    const importedId = parseInt(req.params.importedId);
    const { contact_id } = req.body;
    const userId = req.session.user.id;

    if (!contact_id) {
      return res.status(400).json({ error: 'contact_id is required.' });
    }

    const imported = db.prepare('SELECT * FROM imported_contacts WHERE id = ?').get(importedId);
    if (!imported) {
      return res.status(404).json({ error: 'Imported contact not found.' });
    }

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(parseInt(contact_id));
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found.' });
    }

    // Remove any existing match for this imported contact
    db.prepare('DELETE FROM phone_matches WHERE imported_contact_id = ?').run(importedId);

    // Insert manual match as confirmed
    db.prepare(
      "INSERT INTO phone_matches (contact_id, imported_contact_id, match_type, confidence_score, confirmed_by, confirmed_at) VALUES (?, ?, 'manual', 100, ?, datetime('now'))"
    ).run(parseInt(contact_id), importedId, userId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ANNIVERSARY API ==========

// POST /api/anniversary/:id/skip — mark as skipped
router.post('/anniversary/:id/skip', requireRole('realestate', 'admin'), (req, res) => {
  try {
    const db = getDb();
    const logId = parseInt(req.params.id);

    const entry = db.prepare('SELECT * FROM anniversary_log WHERE id = ?').get(logId);
    if (!entry) {
      return res.status(404).json({ error: 'Anniversary entry not found.' });
    }

    db.prepare("UPDATE anniversary_log SET status = 'skipped' WHERE id = ?").run(logId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/anniversary/:id/sent — mark as sent
router.post('/anniversary/:id/sent', requireRole('realestate', 'admin'), (req, res) => {
  try {
    const db = getDb();
    const logId = parseInt(req.params.id);

    const entry = db.prepare('SELECT * FROM anniversary_log WHERE id = ?').get(logId);
    if (!entry) {
      return res.status(404).json({ error: 'Anniversary entry not found.' });
    }

    db.prepare("UPDATE anniversary_log SET status = 'sent' WHERE id = ?").run(logId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
