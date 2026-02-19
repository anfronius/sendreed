const express = require('express');
const { requireAuth, setFlash } = require('../middleware/auth');
const { getDb } = require('../db/init');
const template = require('../services/template');
const { sendCampaign } = require('../services/email');
const sms = require('../services/sms');

const router = express.Router();
router.use(requireAuth);

// GET /campaign — history
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = 25;
    const offset = (page - 1) * perPage;
    const selectedUserId = isAdmin && req.query.user_id ? parseInt(req.query.user_id) : null;

    let where, params;
    if (isAdmin && selectedUserId) {
      where = 'c.owner_id = ?';
      params = [selectedUserId];
    } else if (isAdmin) {
      where = '1=1';
      params = [];
    } else {
      where = 'c.owner_id = ?';
      params = [userId];
    }

    const totalCount = db.prepare(
      `SELECT COUNT(*) as cnt FROM campaigns c WHERE ${where}`
    ).get(...params).cnt;
    const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

    const campaigns = db.prepare(
      `SELECT c.*, t.name as template_name FROM campaigns c
       LEFT JOIN templates t ON c.template_id = t.id
       WHERE ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, perPage, offset);

    // Get templates for the templates list section
    let templateWhere, templateParams;
    if (isAdmin && selectedUserId) {
      templateWhere = 'owner_id = ?';
      templateParams = [selectedUserId];
    } else if (isAdmin) {
      templateWhere = '1=1';
      templateParams = [];
    } else {
      templateWhere = 'owner_id = ?';
      templateParams = [userId];
    }
    const templates = db.prepare(
      `SELECT * FROM templates WHERE ${templateWhere} ORDER BY name`
    ).all(...templateParams);

    // Get users for admin dropdown
    let users = [];
    if (isAdmin) {
      users = db.prepare('SELECT id, name, role FROM users ORDER BY name').all();
    }

    res.render('campaign/history', {
      title: 'Campaigns',
      campaigns,
      templates,
      currentPage: page,
      totalPages,
      totalCount,
      baseUrl: '/campaign',
      users,
      selectedUserId,
    });
  } catch (err) {
    console.error('Campaign history error:', err);
    res.status(500).render('error', { status: 500, message: 'Failed to load campaigns.' });
  }
});

// GET /campaign/create — wizard page
router.get('/create', (req, res) => {
  try {
    const variables = template.getAvailableVariables(req.session.user.role);
    res.render('campaign/create', {
      title: 'New Campaign',
      variables,
    });
  } catch (err) {
    console.error('Campaign create page error:', err);
    res.status(500).render('error', { status: 500, message: 'Failed to load campaign creator.' });
  }
});

// POST /campaign/create — create campaign + recipients, redirect to review
router.post('/create', (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const { channel, template_id, contact_ids } = req.body;

    if (!channel || !template_id) {
      setFlash(req, 'error', 'Please select a channel and template.');
      return res.redirect('/campaign/create');
    }

    // Parse contact IDs from comma-separated or array
    let contactIdList = [];
    if (typeof contact_ids === 'string') {
      contactIdList = contact_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    } else if (Array.isArray(contact_ids)) {
      contactIdList = contact_ids.map(id => parseInt(id)).filter(id => !isNaN(id));
    }

    if (contactIdList.length === 0) {
      setFlash(req, 'error', 'Please select at least one contact.');
      return res.redirect('/campaign/create');
    }

    // Verify template ownership
    const tmpl = db.prepare('SELECT * FROM templates WHERE id = ? AND (owner_id = ? OR ? = 1)').get(
      parseInt(template_id), userId, req.session.user.role === 'admin' ? 1 : 0
    );
    if (!tmpl) {
      setFlash(req, 'error', 'Template not found.');
      return res.redirect('/campaign/create');
    }

    // Create campaign
    const campaignResult = db.prepare(
      "INSERT INTO campaigns (owner_id, template_id, channel, status, total_count) VALUES (?, ?, ?, 'reviewing', ?)"
    ).run(userId, tmpl.id, channel, contactIdList.length);
    const campaignId = campaignResult.lastInsertRowid;

    // Get contacts and render templates
    const insertRecipient = db.prepare(
      'INSERT INTO campaign_recipients (campaign_id, contact_id, rendered_subject, rendered_body) VALUES (?, ?, ?, ?)'
    );

    const insertAll = db.transaction((ids) => {
      for (const contactId of ids) {
        const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND owner_id = ?').get(contactId, userId);
        if (!contact) continue;

        const renderedSubject = tmpl.subject_template ? template.render(tmpl.subject_template, contact) : null;
        const renderedBody = template.render(tmpl.body_template, contact);

        insertRecipient.run(campaignId, contactId, renderedSubject, renderedBody);
      }
    });

    insertAll(contactIdList);

    res.redirect(`/campaign/${campaignId}/review`);
  } catch (err) {
    console.error('Campaign create error:', err);
    setFlash(req, 'error', 'Failed to create campaign: ' + err.message);
    res.redirect('/campaign/create');
  }
});

// GET /campaign/:id/review — preview rendered messages
router.get('/:id/review', (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const campaignId = parseInt(req.params.id);

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign || (!isAdmin && campaign.owner_id !== userId)) {
      setFlash(req, 'error', 'Campaign not found.');
      return res.redirect('/campaign');
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = 10;
    const offset = (page - 1) * perPage;

    const totalCount = db.prepare(
      'SELECT COUNT(*) as c FROM campaign_recipients WHERE campaign_id = ?'
    ).get(campaignId).c;
    const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

    const recipients = db.prepare(
      `SELECT cr.*, c.first_name, c.last_name, c.email, c.phone
       FROM campaign_recipients cr JOIN contacts c ON cr.contact_id = c.id
       WHERE cr.campaign_id = ? ORDER BY cr.id LIMIT ? OFFSET ?`
    ).all(campaignId, perPage, offset);

    res.render('campaign/review', {
      title: 'Review Campaign',
      campaign,
      recipients,
      currentPage: page,
      totalPages,
      totalCount,
      baseUrl: `/campaign/${campaignId}/review`,
    });
  } catch (err) {
    console.error('Campaign review error:', err);
    res.status(500).render('error', { status: 500, message: 'Failed to load campaign review.' });
  }
});

// POST /campaign/:id/send — start sending or generate SMS
router.post('/:id/send', (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const campaignId = parseInt(req.params.id);

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign || (!isAdmin && campaign.owner_id !== userId)) {
      setFlash(req, 'error', 'Campaign not found.');
      return res.redirect('/campaign');
    }

    if (campaign.channel === 'sms') {
      // Mark recipients as generated and redirect to SMS batch page
      db.prepare(
        "UPDATE campaign_recipients SET status = 'generated' WHERE campaign_id = ? AND status != 'excluded'"
      ).run(campaignId);
      db.prepare("UPDATE campaigns SET status = 'sent', sent_at = datetime('now') WHERE id = ?").run(campaignId);
      return res.redirect(`/campaign/${campaignId}/sms`);
    }

    // Email: redirect to progress page (SSE will start the send)
    res.redirect(`/campaign/${campaignId}/progress`);
  } catch (err) {
    console.error('Campaign send error:', err);
    setFlash(req, 'error', 'Failed to start campaign: ' + err.message);
    res.redirect(`/campaign/${req.params.id}/review`);
  }
});

// GET /campaign/:id/progress — progress page
router.get('/:id/progress', (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const campaignId = parseInt(req.params.id);

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign || (!isAdmin && campaign.owner_id !== userId)) {
      setFlash(req, 'error', 'Campaign not found.');
      return res.redirect('/campaign');
    }

    res.render('campaign/progress', {
      title: 'Sending Campaign',
      campaign,
    });
  } catch (err) {
    console.error('Campaign progress page error:', err);
    res.status(500).render('error', { status: 500, message: 'Failed to load progress.' });
  }
});

// GET /campaign/:id/progress-stream — SSE endpoint
router.get('/:id/progress-stream', async (req, res) => {
  const db = getDb();
  const userId = req.session.user.id;
  const isAdmin = req.session.user.role === 'admin';
  const campaignId = parseInt(req.params.id);

  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign || (!isAdmin && campaign.owner_id !== userId)) {
    return res.status(403).end();
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Keep-alive interval
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });

  // Get full user record for SMTP
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(campaign.owner_id);

  try {
    await sendCampaign(campaignId, user, (progress) => {
      try {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
      } catch (e) { /* client gone */ }
    });
  } catch (err) {
    try {
      res.write(`data: ${JSON.stringify({ error: err.message, done: true })}\n\n`);
    } catch (e) { /* client gone */ }
  }

  clearInterval(keepAlive);
  res.end();
});

// GET /campaign/:id/sms — SMS batch page
router.get('/:id/sms', (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const campaignId = parseInt(req.params.id);

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign || (!isAdmin && campaign.owner_id !== userId)) {
      setFlash(req, 'error', 'Campaign not found.');
      return res.redirect('/campaign');
    }

    const recipients = db.prepare(
      `SELECT cr.*, c.first_name, c.last_name, c.phone
       FROM campaign_recipients cr JOIN contacts c ON cr.contact_id = c.id
       WHERE cr.campaign_id = ? AND cr.status != 'excluded' ORDER BY c.last_name, c.first_name`
    ).all(campaignId);

    const batchData = sms.buildBatchData(recipients.map(r => ({
      ...r,
      id: r.contact_id,
    })));

    res.render('campaign/sms-batch', {
      title: 'Send Texts',
      campaign,
      batchData,
    });
  } catch (err) {
    console.error('SMS batch error:', err);
    res.status(500).render('error', { status: 500, message: 'Failed to load SMS batch.' });
  }
});

// POST /campaign/:id/retry — retry failed recipients
router.post('/:id/retry', (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const campaignId = parseInt(req.params.id);

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign || (!isAdmin && campaign.owner_id !== userId)) {
      setFlash(req, 'error', 'Campaign not found.');
      return res.redirect('/campaign');
    }

    // Reset failed recipients to pending
    const result = db.prepare(
      "UPDATE campaign_recipients SET status = 'pending', error_message = NULL WHERE campaign_id = ? AND status = 'failed'"
    ).run(campaignId);

    if (result.changes === 0) {
      setFlash(req, 'info', 'No failed recipients to retry.');
      return res.redirect('/campaign');
    }

    // Update campaign counts
    db.prepare(
      "UPDATE campaigns SET status = 'reviewing', failed_count = 0 WHERE id = ?"
    ).run(campaignId);

    setFlash(req, 'success', `${result.changes} recipient(s) queued for retry.`);
    res.redirect(`/campaign/${campaignId}/review`);
  } catch (err) {
    console.error('Campaign retry error:', err);
    setFlash(req, 'error', 'Failed to retry campaign.');
    res.redirect('/campaign');
  }
});

module.exports = router;
