const fs = require('fs');

/**
 * Parse a VCF (vCard) file and extract contact information.
 * Supports VCF 3.0 and 4.0 formats.
 */
function parseFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return parseString(raw);
}

function parseString(raw) {
  const contacts = [];
  const errors = [];

  // Unfold continuation lines (RFC 2425: line starts with space or tab)
  const unfolded = raw.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');

  // Split into vCard blocks
  const blocks = unfolded.split(/BEGIN:VCARD/i).slice(1);

  for (let i = 0; i < blocks.length; i++) {
    try {
      const endIdx = blocks[i].search(/END:VCARD/i);
      if (endIdx === -1) {
        errors.push({ index: i, error: 'Missing END:VCARD' });
        continue;
      }

      const blockContent = blocks[i].substring(0, endIdx);
      const lines = blockContent.split(/\r?\n/).filter(l => l.trim());
      const contact = parseVCardBlock(lines);

      if (contact.full_name || contact.first_name || contact.last_name) {
        contact.raw_data = 'BEGIN:VCARD' + blocks[i].substring(0, endIdx) + 'END:VCARD';
        contacts.push(contact);
      }
    } catch (err) {
      errors.push({ index: i, error: err.message });
    }
  }

  return { contacts, errors };
}

function parseVCardBlock(lines) {
  const contact = {
    full_name: null,
    first_name: null,
    last_name: null,
    phone: null,
    email: null,
  };

  const phones = [];
  const emails = [];

  for (const line of lines) {
    // Parse property: NAME;PARAMS:VALUE or NAME:VALUE
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const left = line.substring(0, colonIdx);
    const value = line.substring(colonIdx + 1).trim();
    if (!value) continue;

    // Split left side into property name and parameters
    const parts = left.split(';');
    const propName = parts[0].toUpperCase();
    const params = parts.slice(1).map(p => p.toUpperCase());

    switch (propName) {
      case 'FN':
        contact.full_name = decodeVCardValue(value);
        break;

      case 'N': {
        // N:LastName;FirstName;MiddleName;Prefix;Suffix
        const nameParts = value.split(';');
        contact.last_name = decodeVCardValue(nameParts[0] || '').trim() || null;
        contact.first_name = decodeVCardValue(nameParts[1] || '').trim() || null;
        break;
      }

      case 'TEL': {
        const phoneNum = normalizePhone(value);
        if (!phoneNum) break;

        const typeStr = params.join(';');
        const isMobile = /CELL|MOBILE/i.test(typeStr);
        const isPref = /PREF/i.test(typeStr);
        // Also check for TYPE= within params
        const typeParam = params.find(p => p.startsWith('TYPE='));
        const typeVal = typeParam ? typeParam.substring(5) : '';
        const isMobileType = /CELL|MOBILE/i.test(typeVal);

        phones.push({
          number: phoneNum,
          isMobile: isMobile || isMobileType,
          isPref: isPref || /PREF/i.test(typeVal),
        });
        break;
      }

      case 'EMAIL': {
        const emailAddr = decodeVCardValue(value).trim();
        if (!emailAddr || !emailAddr.includes('@')) break;

        const typeStr = params.join(';');
        const isPref = /PREF/i.test(typeStr);
        emails.push({ address: emailAddr, isPref });
        break;
      }
    }
  }

  // Select best phone: prefer mobile, then pref, then first
  if (phones.length > 0) {
    const mobile = phones.find(p => p.isMobile);
    const pref = phones.find(p => p.isPref);
    contact.phone = (mobile || pref || phones[0]).number;
  }

  // Select best email: prefer pref, then first
  if (emails.length > 0) {
    const pref = emails.find(e => e.isPref);
    contact.email = (pref || emails[0]).address;
  }

  // Derive full_name from N if FN missing
  if (!contact.full_name && (contact.first_name || contact.last_name)) {
    contact.full_name = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
  }

  // Derive first/last from FN if N missing
  if (contact.full_name && !contact.first_name && !contact.last_name) {
    const parts = contact.full_name.trim().split(/\s+/);
    if (parts.length > 1) {
      contact.last_name = parts.pop();
      contact.first_name = parts.join(' ');
    } else {
      contact.last_name = parts[0];
    }
  }

  return contact;
}

/**
 * Decode vCard encoded values (quoted-printable, basic escapes).
 */
function decodeVCardValue(value) {
  // Handle basic vCard escaping: \n, \, \;
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .replace(/\\,/g, ',');
}

/**
 * Normalize a phone number string to digits only.
 * Returns null if insufficient digits.
 */
function normalizePhone(value) {
  // Strip tel: URI prefix
  let cleaned = value.replace(/^tel:/i, '');
  // Strip everything except digits and +
  cleaned = cleaned.replace(/[^\d+]/g, '');
  // Remove leading + and country code handling
  if (cleaned.startsWith('+1')) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
    // If it starts with country code 1 and has 11 digits
    if (cleaned.startsWith('1') && cleaned.length === 11) {
      cleaned = cleaned.substring(1);
    }
  } else if (cleaned.startsWith('1') && cleaned.length === 11) {
    cleaned = cleaned.substring(1);
  }

  // Must have at least 10 digits for a US number
  if (cleaned.length < 10) return null;

  // Take last 10 digits
  cleaned = cleaned.slice(-10);
  return cleaned;
}

module.exports = { parseFile, parseString, normalizePhone };
