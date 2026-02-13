function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  return null;
}

function generateDeepLink(phone, body) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return `sms:${normalized}&body=${encodeURIComponent(body)}`;
}

function buildBatchData(recipients) {
  return recipients
    .map(r => {
      const normalized = normalizePhone(r.phone);
      if (!normalized) return null;
      return {
        contactId: r.contact_id || r.id,
        name: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown',
        phone: normalized,
        displayPhone: normalized,
        body: r.rendered_body || '',
        deepLink: `sms:${normalized}&body=${encodeURIComponent(r.rendered_body || '')}`,
      };
    })
    .filter(Boolean);
}

module.exports = { normalizePhone, generateDeepLink, buildBatchData };
