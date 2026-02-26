const cron = require('node-cron');
const { getDb } = require('../db/init');
const { createTransport } = require('../config/smtp');

/**
 * Check for upcoming purchase anniversaries within a lookahead window.
 * Inserts new entries into anniversary_log (deduplicates by contact + year).
 */
function checkAnniversaries(lookaheadDays = 7) {
  const db = getDb();
  const today = new Date();
  const currentYear = today.getFullYear();

  // Get all contacts with purchase_date
  const contacts = db.prepare(
    "SELECT id, owner_id, first_name, last_name, purchase_date FROM contacts WHERE purchase_date IS NOT NULL AND purchase_date != ''"
  ).all();

  const checkExisting = db.prepare(
    'SELECT id FROM anniversary_log WHERE contact_id = ? AND anniversary_date = ?'
  );
  const insertLog = db.prepare(
    'INSERT INTO anniversary_log (contact_id, anniversary_date, years, status) VALUES (?, ?, ?, ?)'
  );

  let created = 0;

  const run = db.transaction(() => {
    for (const contact of contacts) {
      // Parse purchase date
      const purchaseDate = new Date(contact.purchase_date + 'T00:00:00');
      if (isNaN(purchaseDate.getTime())) continue;

      const purchaseMonth = purchaseDate.getMonth();
      const purchaseDay = purchaseDate.getDate();
      const purchaseYear = purchaseDate.getFullYear();

      // Check if anniversary falls within lookahead window
      for (let offset = 0; offset <= lookaheadDays; offset++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() + offset);

        if (checkDate.getMonth() === purchaseMonth && checkDate.getDate() === purchaseDay) {
          const years = currentYear - purchaseYear;
          if (years <= 0) continue; // Skip same-year purchases

          const anniversaryDate = `${currentYear}-${String(purchaseMonth + 1).padStart(2, '0')}-${String(purchaseDay).padStart(2, '0')}`;

          // Deduplicate
          const existing = checkExisting.get(contact.id, anniversaryDate);
          if (existing) continue;

          insertLog.run(contact.id, anniversaryDate, years, 'pending');
          created++;
          break;
        }
      }
    }
  });

  run();

  if (created > 0) {
    console.log(`[Cron] Created ${created} anniversary log entries.`);
  }

  return created;
}

/**
 * Get upcoming holidays within a window.
 */
function getUpcomingHolidays(days = 7) {
  const db = getDb();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const futureDate = new Date(today);
  futureDate.setDate(today.getDate() + days);
  const futureStr = futureDate.toISOString().slice(0, 10);

  return db.prepare(
    'SELECT * FROM holidays WHERE date >= ? AND date <= ? ORDER BY date'
  ).all(todayStr, futureStr);
}

/**
 * Get pending anniversaries for today.
 */
function getTodaysAnniversaries() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  return db.prepare(`
    SELECT al.*, c.first_name, c.last_name, c.property_address, c.email, c.phone, c.owner_id
    FROM anniversary_log al
    JOIN contacts c ON al.contact_id = c.id
    WHERE al.anniversary_date = ? AND al.status = 'pending'
    ORDER BY c.last_name, c.first_name
  `).all(today);
}

/**
 * Send morning digest email to realestate users.
 * Digest is sent FROM admin's SMTP account TO each RE user's login email.
 * Per-user settings (enabled/disabled, lookahead days) are read from digest_settings table.
 */
async function sendMorningDigest() {
  const db = getDb();

  // Get admin user with SMTP configured (the sender)
  const admin = db.prepare(
    "SELECT * FROM users WHERE role = 'admin' AND smtp_email IS NOT NULL AND smtp_password_encrypted IS NOT NULL"
  ).get();

  if (!admin) {
    console.log('[Cron] No admin with SMTP configured; skipping digest.');
    return;
  }

  // Get realestate users
  const reUsers = db.prepare(
    "SELECT * FROM users WHERE role = 'realestate'"
  ).all();

  if (reUsers.length === 0) return;

  // Load per-user digest settings
  const settingsRows = db.prepare('SELECT * FROM digest_settings').all();
  const settingsMap = {};
  settingsRows.forEach(function(s) { settingsMap[s.user_id] = s; });

  const todayStr = new Date().toISOString().slice(0, 10);
  const holidays = getUpcomingHolidays(7);
  const todayHolidays = holidays.filter(h => h.date === todayStr);
  const upcomingHolidays = holidays.filter(h => h.date !== todayStr);

  let transport;
  try {
    transport = createTransport(admin);
  } catch (err) {
    console.error('[Cron] Failed to create admin SMTP transport:', err.message);
    return;
  }

  for (const user of reUsers) {
    // Check per-user settings (default: enabled, 7 days)
    const settings = settingsMap[user.id];
    const enabled = settings ? settings.enabled : 1;
    const lookaheadDays = settings ? settings.lookahead_days : 7;

    if (!enabled) {
      continue;
    }

    // Get this user's pending anniversaries using their configured lookahead
    const todayAnniversaries = db.prepare(`
      SELECT al.*, c.first_name, c.last_name, c.property_address, c.email, c.phone
      FROM anniversary_log al
      JOIN contacts c ON al.contact_id = c.id
      WHERE al.anniversary_date = ? AND al.status = 'pending' AND c.owner_id = ?
      ORDER BY c.last_name
    `).all(todayStr, user.id);

    const weekAnniversaries = db.prepare(`
      SELECT al.*, c.first_name, c.last_name, c.property_address
      FROM anniversary_log al
      JOIN contacts c ON al.contact_id = c.id
      WHERE al.anniversary_date > ? AND al.anniversary_date <= date(?, '+' || ? || ' days')
        AND al.status = 'pending' AND c.owner_id = ?
      ORDER BY al.anniversary_date
    `).all(todayStr, todayStr, lookaheadDays, user.id);

    // Skip if nothing to report
    if (todayAnniversaries.length === 0 && weekAnniversaries.length === 0 &&
        todayHolidays.length === 0 && upcomingHolidays.length === 0) {
      continue;
    }

    // Build digest email
    let body = 'Good morning! Here is your daily outreach digest:\n\n';

    if (todayHolidays.length > 0) {
      body += '--- TODAY\'S HOLIDAYS ---\n';
      todayHolidays.forEach(h => { body += `  * ${h.name}\n`; });
      body += '\n';
    }

    if (todayAnniversaries.length > 0) {
      body += '--- TODAY\'S ANNIVERSARIES ---\n';
      todayAnniversaries.forEach(a => {
        const name = [a.first_name, a.last_name].filter(Boolean).join(' ');
        body += `  * ${name} — ${a.years} year(s) at ${a.property_address || 'N/A'}\n`;
        if (a.phone) body += `    Phone: ${a.phone}\n`;
        if (a.email) body += `    Email: ${a.email}\n`;
      });
      body += '\n';
    }

    if (upcomingHolidays.length > 0) {
      body += '--- UPCOMING HOLIDAYS (this week) ---\n';
      upcomingHolidays.forEach(h => { body += `  * ${h.name} — ${h.date}\n`; });
      body += '\n';
    }

    if (weekAnniversaries.length > 0) {
      body += '--- UPCOMING ANNIVERSARIES ---\n';
      weekAnniversaries.forEach(a => {
        const name = [a.first_name, a.last_name].filter(Boolean).join(' ');
        body += `  * ${name} — ${a.years} year(s) on ${a.anniversary_date}\n`;
      });
      body += '\n';
    }

    body += 'Log in to manage these at your SendReed dashboard.\n';

    try {
      await transport.sendMail({
        from: admin.smtp_email,
        to: user.email,
        subject: 'SendReed Daily Digest — ' + todayStr,
        text: body,
      });
      console.log(`[Cron] Morning digest sent to ${user.email}`);
    } catch (err) {
      console.error(`[Cron] Failed to send digest to ${user.email}:`, err.message);
    }
  }

  try { transport.close(); } catch (e) { /* ignore */ }
}

/**
 * Process scheduled templates: auto-create and send campaigns for templates
 * whose scheduled_date matches today.
 */
async function processScheduledTemplates() {
  const db = getDb();
  const todayStr = new Date().toISOString().slice(0, 10);

  const templates = db.prepare(
    "SELECT * FROM templates WHERE scheduled_date = ?"
  ).all(todayStr);

  if (templates.length === 0) return;

  const { sendCampaign } = require('./email');
  const templateService = require('./template');

  for (const tmpl of templates) {
    // Check if a campaign already exists for this template today (dedup)
    const existing = db.prepare(
      "SELECT id FROM campaigns WHERE template_id = ? AND date(created_at) = ?"
    ).get(tmpl.id, todayStr);
    if (existing) {
      console.log(`[Cron] Scheduled template ${tmpl.id} already has campaign for today; skipping.`);
      continue;
    }

    // Get owner's contacts
    const contacts = db.prepare(
      "SELECT * FROM contacts WHERE owner_id = ?"
    ).all(tmpl.owner_id);

    if (contacts.length === 0) {
      console.log(`[Cron] No contacts for template ${tmpl.id} owner; skipping.`);
      continue;
    }

    // Filter contacts by channel
    var eligibleContacts = contacts;
    if (tmpl.channel === 'email') {
      eligibleContacts = contacts.filter(function(c) { return c.email; });
    } else if (tmpl.channel === 'sms') {
      eligibleContacts = contacts.filter(function(c) { return c.phone; });
    }

    if (eligibleContacts.length === 0) continue;

    // Create campaign
    const campaignResult = db.prepare(
      "INSERT INTO campaigns (owner_id, template_id, channel, status, total_count) VALUES (?, ?, ?, 'reviewing', ?)"
    ).run(tmpl.owner_id, tmpl.id, tmpl.channel, eligibleContacts.length);
    const campaignId = campaignResult.lastInsertRowid;

    // Render and insert recipients
    const insertRecipient = db.prepare(
      'INSERT INTO campaign_recipients (campaign_id, contact_id, rendered_subject, rendered_body) VALUES (?, ?, ?, ?)'
    );

    const insertAll = db.transaction(function(cList) {
      for (var c of cList) {
        var renderedSubject = tmpl.subject_template ? templateService.render(tmpl.subject_template, c) : null;
        var renderedBody = templateService.render(tmpl.body_template, c);
        insertRecipient.run(campaignId, c.id, renderedSubject, renderedBody);
      }
    });
    insertAll(eligibleContacts);

    // Get user for SMTP and send if email channel
    if (tmpl.channel === 'email') {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(tmpl.owner_id);
      if (user && user.smtp_email && user.smtp_password_encrypted) {
        try {
          await sendCampaign(campaignId, user, function(progress) {
            // No SSE stream for cron-triggered sends
          });
          console.log(`[Cron] Scheduled template ${tmpl.id} sent as campaign ${campaignId}`);
        } catch (err) {
          console.error(`[Cron] Failed to send scheduled campaign ${campaignId}:`, err.message);
        }
      } else {
        console.log(`[Cron] User ${tmpl.owner_id} has no SMTP; campaign ${campaignId} left in reviewing.`);
      }
    } else {
      // SMS campaigns just mark as sent (links are generated on view)
      db.prepare("UPDATE campaigns SET status = 'sent', sent_at = datetime('now') WHERE id = ?").run(campaignId);
      db.prepare("UPDATE campaign_recipients SET status = 'generated' WHERE campaign_id = ?").run(campaignId);
      console.log(`[Cron] Scheduled SMS template ${tmpl.id} campaign ${campaignId} generated.`);
    }

    // Clear the scheduled_date so it doesn't re-send next year
    db.prepare('UPDATE templates SET scheduled_date = NULL WHERE id = ?').run(tmpl.id);
  }
}

/**
 * Start all cron jobs.
 */
function startCronJobs() {
  // Daily at 7:00 AM Pacific
  cron.schedule('0 7 * * *', async () => {
    console.log('[Cron] Running daily checks...');
    try {
      checkAnniversaries(7);
      await sendMorningDigest();
      await processScheduledTemplates();
    } catch (err) {
      console.error('[Cron] Error in daily job:', err);
    }
  }, {
    timezone: 'America/Los_Angeles',
  });

  // Also run anniversary check on startup to catch any missed
  try {
    checkAnniversaries(7);
  } catch (err) {
    console.error('[Cron] Error in startup anniversary check:', err);
  }

  console.log('Cron jobs initialized (daily at 7:00 AM Pacific).');
}

module.exports = { startCronJobs, checkAnniversaries, getUpcomingHolidays, getTodaysAnniversaries };
