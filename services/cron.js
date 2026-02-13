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
 */
async function sendMorningDigest() {
  const db = getDb();

  // Get realestate users with SMTP configured
  const users = db.prepare(
    "SELECT * FROM users WHERE role = 'realestate' AND smtp_email IS NOT NULL AND smtp_password_encrypted IS NOT NULL"
  ).all();

  if (users.length === 0) return;

  const todayStr = new Date().toISOString().slice(0, 10);
  const holidays = getUpcomingHolidays(7);
  const todayHolidays = holidays.filter(h => h.date === todayStr);
  const upcomingHolidays = holidays.filter(h => h.date !== todayStr);

  for (const user of users) {
    // Get this user's pending anniversaries
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
      WHERE al.anniversary_date > ? AND al.anniversary_date <= date(?, '+7 days')
        AND al.status = 'pending' AND c.owner_id = ?
      ORDER BY al.anniversary_date
    `).all(todayStr, todayStr, user.id);

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
      body += '--- UPCOMING ANNIVERSARIES (this week) ---\n';
      weekAnniversaries.forEach(a => {
        const name = [a.first_name, a.last_name].filter(Boolean).join(' ');
        body += `  * ${name} — ${a.years} year(s) on ${a.anniversary_date}\n`;
      });
      body += '\n';
    }

    body += 'Log in to manage these at your SendReed dashboard.\n';

    try {
      const transport = createTransport(user);
      await transport.sendMail({
        from: user.smtp_email,
        to: user.smtp_email,
        subject: 'SendReed Daily Digest — ' + todayStr,
        text: body,
      });
      transport.close();
      console.log(`[Cron] Morning digest sent to ${user.email}`);
    } catch (err) {
      console.error(`[Cron] Failed to send digest to ${user.email}:`, err.message);
    }
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
