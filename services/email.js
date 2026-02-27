const { createTransport } = require('../config/smtp');
const { getDb } = require('../db/init');
const providers = require('../config/providers.json');

// In-memory daily send counts: Map<userId, { count, date }>
const dailySendCounts = new Map();

function getDailyCount(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = dailySendCounts.get(userId);
  if (!entry || entry.date !== today) {
    dailySendCounts.set(userId, { count: 0, date: today });
    return 0;
  }
  return entry.count;
}

function incrementDailyCount(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = dailySendCounts.get(userId);
  if (!entry || entry.date !== today) {
    dailySendCounts.set(userId, { count: 1, date: today });
  } else {
    entry.count++;
  }
}

function getDailyLimit(user) {
  const provider = providers[user.smtp_provider];
  return provider ? provider.dailyLimit : 300;
}

function getDelay(user) {
  const provider = providers[user.smtp_provider];
  return provider ? provider.defaultDelay : 2000;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send a campaign's emails sequentially with rate limiting.
 * @param {number} campaignId
 * @param {object} user - Full user row from DB (with smtp fields)
 * @param {function} onProgress - Called with { sent, failed, total, recipientId, status, error }
 */
async function sendCampaign(campaignId, user, onProgress) {
  const db = getDb();

  // Concurrent guard: check no other campaign is sending for this user
  const activeCampaign = db.prepare(
    "SELECT id FROM campaigns WHERE owner_id = ? AND status = 'sending' AND id != ?"
  ).get(user.id, campaignId);
  if (activeCampaign) {
    throw new Error('Another campaign is already sending. Please wait for it to complete.');
  }

  // Verify SMTP credentials exist
  if (!user.smtp_email || !user.smtp_password_encrypted) {
    throw new Error('SMTP credentials not configured. Ask your admin to set up email.');
  }

  let transport;
  try {
    transport = createTransport(user);
    transport.options.connectionTimeout = 10000;
    transport.options.socketTimeout = 30000;
  } catch (err) {
    throw new Error('Failed to create SMTP transport: ' + err.message);
  }

  // Mark campaign as sending
  db.prepare("UPDATE campaigns SET status = 'sending' WHERE id = ?").run(campaignId);

  const recipients = db.prepare(
    "SELECT cr.id, cr.contact_id, cr.rendered_subject, cr.rendered_body, c.email " +
    "FROM campaign_recipients cr JOIN contacts c ON cr.contact_id = c.id " +
    "WHERE cr.campaign_id = ? AND cr.status = 'pending' ORDER BY cr.id"
  ).all(campaignId);

  const total = db.prepare(
    "SELECT COUNT(*) as c FROM campaign_recipients WHERE campaign_id = ? AND status != 'excluded'"
  ).get(campaignId).c;

  const campaign = db.prepare('SELECT sent_count, failed_count, daily_limit FROM campaigns WHERE id = ?').get(campaignId);
  let sent = campaign.sent_count;
  let failed = campaign.failed_count;
  const providerLimit = getDailyLimit(user);
  const campaignLimit = campaign.daily_limit;
  const dailyLimit = campaignLimit ? Math.min(providerLimit, campaignLimit) : providerLimit;
  const delay = getDelay(user);
  let rateLimitHit = false;

  for (const recipient of recipients) {
    // Check if campaign was paused externally
    const currentStatus = db.prepare('SELECT status FROM campaigns WHERE id = ?').get(campaignId);
    if (currentStatus && currentStatus.status === 'paused') {
      break;
    }

    // Rate limit check
    const currentCount = getDailyCount(user.id);
    if (currentCount >= dailyLimit) {
      rateLimitHit = true;
      db.prepare("UPDATE campaigns SET status = 'resume_tomorrow' WHERE id = ?").run(campaignId);
      if (onProgress) {
        try { onProgress({ sent, failed, total, rateLimitHit: true }); } catch (e) { /* client disconnected */ }
      }
      break;
    }

    // Warn at 80%
    const warnThreshold = Math.floor(dailyLimit * 0.8);
    const approaching = currentCount >= warnThreshold;

    try {
      await transport.sendMail({
        from: user.smtp_email,
        to: recipient.email,
        subject: recipient.rendered_subject || '(No subject)',
        text: recipient.rendered_body,
      });

      db.prepare(
        "UPDATE campaign_recipients SET status = 'sent', sent_at = datetime('now') WHERE id = ?"
      ).run(recipient.id);

      sent++;
      incrementDailyCount(user.id);
      db.prepare(
        'UPDATE campaigns SET sent_count = ? WHERE id = ?'
      ).run(sent, campaignId);

      if (onProgress) {
        try {
          onProgress({
            sent, failed, total,
            recipientId: recipient.id,
            contactId: recipient.contact_id,
            status: 'sent',
            approaching,
          });
        } catch (e) { /* client disconnected */ }
      }
    } catch (err) {
      db.prepare(
        "UPDATE campaign_recipients SET status = 'failed', error_message = ? WHERE id = ?"
      ).run(err.message, recipient.id);

      failed++;
      db.prepare(
        'UPDATE campaigns SET failed_count = ? WHERE id = ?'
      ).run(failed, campaignId);

      if (onProgress) {
        try {
          onProgress({
            sent, failed, total,
            recipientId: recipient.id,
            contactId: recipient.contact_id,
            status: 'failed',
            error: err.message,
            approaching,
          });
        } catch (e) { /* client disconnected */ }
      }
    }

    // Delay between sends
    if (recipients.indexOf(recipient) < recipients.length - 1) {
      await sleep(delay);
    }
  }

  // Finalize campaign status
  if (!rateLimitHit) {
    const finalStatus = db.prepare('SELECT status FROM campaigns WHERE id = ?').get(campaignId);
    if (finalStatus && finalStatus.status === 'sending') {
      db.prepare("UPDATE campaigns SET status = 'sent', sent_at = datetime('now') WHERE id = ?").run(campaignId);
    }
  }

  transport.close();

  if (onProgress) {
    try { onProgress({ sent, failed, total, done: true, rateLimitHit }); } catch (e) { /* client disconnected */ }
  }

  return { sent, failed, total };
}

/**
 * On startup, mark any 'sending' campaigns as 'paused' (stale from crash).
 */
function recoverStaleCampaigns() {
  const db = getDb();
  const result = db.prepare("UPDATE campaigns SET status = 'paused' WHERE status = 'sending'").run();
  if (result.changes > 0) {
    console.log(`Recovered ${result.changes} stale campaign(s) to 'paused' status.`);
  }
}

module.exports = { sendCampaign, recoverStaleCampaigns, getDailyCount, getDailyLimit };
