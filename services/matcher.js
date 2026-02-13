/**
 * Four-pass name matching algorithm for matching imported vCard contacts
 * against existing contacts in the database.
 */

const SUFFIXES = /\b(jr\.?|sr\.?|ii|iii|iv|v|esq\.?|phd|md)\b/gi;

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
 * Normalize a name: lowercase, strip suffixes, strip middle names, collapse whitespace.
 */
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
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
 * Match a single imported contact against all existing contacts using 4 passes.
 * Returns array of matches sorted by confidence (highest first).
 */
function findMatches(importedContact, existingContacts) {
  const importedFull = buildFullName(importedContact) || importedContact.full_name || '';
  const importedNorm = normalizeName(importedFull);
  const importedStripped = stripMiddleNames(importedNorm);
  const importedLast = normalizeName(importedContact.last_name || '');
  const importedFirstInitial = importedNorm.charAt(0);

  const matches = [];
  const matchedIds = new Set();

  for (const contact of existingContacts) {
    const contactFull = buildFullName(contact);
    const contactNorm = normalizeName(contactFull);

    // Pass 1: Exact match (case-insensitive)
    if (importedNorm && contactNorm && importedNorm === contactNorm) {
      matches.push({ contact_id: contact.id, confidence: 100, match_type: 'exact' });
      matchedIds.add(contact.id);
      continue;
    }

    // Pass 2: Normalized (strip middle names and suffixes)
    const contactStripped = stripMiddleNames(contactNorm);
    if (importedStripped && contactStripped && importedStripped === contactStripped) {
      if (!matchedIds.has(contact.id)) {
        matches.push({ contact_id: contact.id, confidence: 90, match_type: 'normalized' });
        matchedIds.add(contact.id);
        continue;
      }
    }

    // Pass 3: Last name + first initial
    const contactLast = normalizeName(contact.last_name || '');
    const contactFirstInitial = contactNorm.charAt(0);
    if (importedLast && contactLast &&
        importedLast === contactLast &&
        importedFirstInitial && contactFirstInitial &&
        importedFirstInitial === contactFirstInitial) {
      if (!matchedIds.has(contact.id)) {
        matches.push({ contact_id: contact.id, confidence: 70, match_type: 'initial' });
        matchedIds.add(contact.id);
        continue;
      }
    }

    // Pass 4: Fuzzy (Levenshtein distance ≤ 3)
    if (importedStripped && contactStripped) {
      const dist = levenshteinDistance(importedStripped, contactStripped);
      if (dist > 0 && dist <= 3 && !matchedIds.has(contact.id)) {
        const confidence = dist === 1 ? 60 : dist === 2 ? 50 : 40;
        matches.push({ contact_id: contact.id, confidence, match_type: 'fuzzy' });
        matchedIds.add(contact.id);
      }
    }
  }

  // Sort by confidence descending
  matches.sort((a, b) => b.confidence - a.confidence);
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

module.exports = { matchAll, findMatches, levenshteinDistance, normalizeName };
