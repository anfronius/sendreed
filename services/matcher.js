/**
 * Five-pass name matching algorithm for matching imported vCard contacts
 * against existing contacts in the database.
 */

const SUFFIXES = /\b(jr\.?|sr\.?|ii|iii|iv|v|esq\.?|phd|md)\b/gi;
const CATEGORY_PREFIXES = /^(client|agent|ld|lender|referral|seller|buyer|friend|cousin|wa[rm]|loan\s*depot|estate\s*planning|better|electrician|plumber)\s*[-:]\s*/i;

/**
 * Compute Levenshtein edit distance between two strings.
 */
function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Normalize a name: lowercase, strip category prefixes, strip suffixes, collapse whitespace.
 */
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(CATEGORY_PREFIXES, '')
    .replace(SUFFIXES, '')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a full name string from first and last name fields.
 */
function buildFullName(contact) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ');
}

/**
 * Strip middle names from a full name, keeping only first and last.
 */
function stripMiddleNames(name) {
  const parts = name.split(/\s+/);
  if (parts.length <= 2) return name;
  return parts[0] + ' ' + parts[parts.length - 1];
}

/**
 * Strip single-letter tokens (middle initials) from a name.
 * "michael v aguirre" → "michael aguirre"
 */
function stripInitials(name) {
  if (!name) return '';
  var parts = name.split(/\s+/);
  var filtered = parts.filter(function(p) {
    return p.length > 1 || !/^[a-z]$/i.test(p);
  });
  return filtered.length > 0 ? filtered.join(' ') : name;
}

/**
 * Match a single imported contact against all existing contacts using 5 passes.
 * Returns array of matches sorted by confidence (highest first).
 */
function findMatches(importedContact, existingContacts) {
  const importedFull = buildFullName(importedContact) || importedContact.full_name || '';
  const importedNorm = normalizeName(importedFull);
  const importedNoInitials = stripInitials(importedNorm);
  const importedStripped = stripInitials(stripMiddleNames(importedNorm));
  const importedFirst = normalizeName(importedContact.first_name || '');
  const importedLast = normalizeName(importedContact.last_name || '');

  const matches = [];
  const matchedIds = new Set();

  for (const contact of existingContacts) {
    const contactFull = buildFullName(contact);
    const contactNorm = normalizeName(contactFull);
    const contactNoInitials = stripInitials(contactNorm);
    const contactStripped = stripInitials(stripMiddleNames(contactNorm));
    const contactFirst = normalizeName(contact.first_name || '');
    const contactLast = normalizeName(contact.last_name || '');

    // Pass 1: Exact match after stripping initials (100%)
    // "michael v aguirre" vs "michael aguirre" both become "michael aguirre"
    if (importedNoInitials && contactNoInitials && importedNoInitials === contactNoInitials) {
      matches.push({ contact_id: contact.id, confidence: 100, match_type: 'exact' });
      matchedIds.add(contact.id);
      continue;
    }

    // Pass 2: Strip middle names + initials (90%)
    if (importedStripped && contactStripped && importedStripped === contactStripped) {
      if (!matchedIds.has(contact.id)) {
        matches.push({ contact_id: contact.id, confidence: 90, match_type: 'normalized' });
        matchedIds.add(contact.id);
        continue;
      }
    }

    // Pass 3: Last name exact + first initial (70%)
    // Only applies when at least one side has a short first name (actual initial),
    // not when both sides have full first names that happen to share the same letter
    var importedFirstClean = stripInitials(importedFirst) || stripInitials(importedNorm).split(/\s+/)[0] || '';
    var contactFirstClean = stripInitials(contactFirst) || stripInitials(contactNorm).split(/\s+/)[0] || '';
    var importedFirstInitial = importedFirstClean.charAt(0);
    var contactFirstInitial = contactFirstClean.charAt(0);
    var oneIsShort = importedFirstClean.length <= 2 || contactFirstClean.length <= 2;
    if (oneIsShort && importedLast && contactLast &&
        importedLast === contactLast &&
        importedFirstInitial && contactFirstInitial &&
        importedFirstInitial === contactFirstInitial) {
      if (!matchedIds.has(contact.id)) {
        matches.push({ contact_id: contact.id, confidence: 70, match_type: 'initial' });
        matchedIds.add(contact.id);
        continue;
      }
    }

    // Pass 4: Last name exact + fuzzy first name (50-60%)
    // Only fuzzes first names — prevents "Julio Gomez" matching "Justin Gomez"
    if (importedLast && contactLast && importedLast === contactLast) {
      var importedFirstClean = stripInitials(importedFirst) || stripInitials(importedNorm).split(/\s+/)[0] || '';
      var contactFirstClean = stripInitials(contactFirst) || stripInitials(contactNorm).split(/\s+/)[0] || '';
      if (importedFirstClean && contactFirstClean) {
        var firstDist = levenshteinDistance(importedFirstClean, contactFirstClean);
        if (firstDist > 0 && firstDist <= 2 && !matchedIds.has(contact.id)) {
          var confidence = firstDist === 1 ? 60 : 50;
          matches.push({ contact_id: contact.id, confidence: confidence, match_type: 'fuzzy_first' });
          matchedIds.add(contact.id);
          continue;
        }
      }
    }

    // Pass 5: Full name fuzzy (40%) — tightened: dist ≤ 2, min length 8
    if (importedStripped && contactStripped) {
      var minLen = Math.min(importedStripped.length, contactStripped.length);
      var dist = levenshteinDistance(importedStripped, contactStripped);
      if (dist > 0 && dist <= 2 && minLen >= 8 && !matchedIds.has(contact.id)) {
        matches.push({ contact_id: contact.id, confidence: 40, match_type: 'fuzzy' });
        matchedIds.add(contact.id);
      }
    }
  }

  // Sort by confidence descending
  matches.sort(function(a, b) { return b.confidence - a.confidence; });
  return matches;
}

/**
 * Run matching for all imported contacts against existing contacts.
 * Returns array of { imported_contact_id, imported_contact, matches[] }
 */
function matchAll(importedContacts, existingContacts) {
  const results = [];

  for (const imported of importedContacts) {
    const matches = findMatches(imported, existingContacts);
    results.push({
      imported_contact_id: imported.id,
      imported_contact: imported,
      matches,
    });
  }

  return results;
}

/**
 * Run matching from the existing-contact perspective: for each existing contact,
 * find the best matching imported contacts.
 * Returns array of { contact_id, contact, matches[] }
 * where matches[].imported_contact_id is the imported contact's ID.
 */
function matchAllByExisting(existingContacts, importedContacts) {
  const results = [];

  for (const existing of existingContacts) {
    // findMatches returns { contact_id: pool_item.id, ... }
    // When pool = importedContacts, contact_id = imported contact's id
    const rawMatches = findMatches(existing, importedContacts);
    const matches = rawMatches.map(function(m) {
      return {
        imported_contact_id: m.contact_id,
        confidence: m.confidence,
        match_type: m.match_type,
      };
    });
    results.push({
      contact_id: existing.id,
      contact: existing,
      matches,
    });
  }

  return results;
}

module.exports = { matchAll, matchAllByExisting, findMatches, levenshteinDistance, normalizeName, stripInitials };
