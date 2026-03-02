const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireRole, setFlash, getEffectiveOwnerId } = require('../middleware/auth');
const { verifyCsrf } = require('../middleware/csrf');
const { getDb } = require('../db/init');
const csv = require('../services/csv');
const vcard = require('../services/vcard');
const matcher = require('../services/matcher');
const fieldConfig = require('../config/field-config');
const { checkAnniversaries } = require('../services/cron');

const router = express.Router();
router.use(requireRole('realestate', 'admin'));

// Configure multer for CSV uploads
const uploadsDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..'), 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed.'));
    }
  },
});

const CRMLS_FIELDS = ['property_address', 'street_number', 'street_name', 'city', 'state', 'zip', 'sale_date', 'sale_price'];

// Map CRMLS field names to their field_visibility equivalents (for filtering by admin settings)
const CRMLS_TO_VISIBILITY = {
  city: 'city',
  state: 'state',
  zip: 'zip',
  sale_date: 'purchase_date',
  sale_price: 'purchase_price',
};

// Fields that are always shown in CRMLS import (no visibility equivalent)
const CRMLS_ALWAYS_VISIBLE = ['property_address', 'street_number', 'street_name'];

function getFilteredCrmlsFields() {
  var visibleFields = fieldConfig.getVisibleFields('realestate');
  return CRMLS_FIELDS.filter(function(field) {
    if (CRMLS_ALWAYS_VISIBLE.includes(field)) return true;
    var visibilityName = CRMLS_TO_VISIBILITY[field];
    if (!visibilityName) return true;
    return visibleFields.includes(visibilityName);
  });
}

// GET /realestate — dashboard
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const isAdmin = req.session.user.role === 'admin';
    const effectiveOwnerId = getEffectiveOwnerId(req);
    const crmlsWhere = (isAdmin && !effectiveOwnerId) ? '1=1' : 'owner_id = ?';
    const crmlsParams = (isAdmin && !effectiveOwnerId) ? [] : [effectiveOwnerId];

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN realist_lookup_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN realist_lookup_status = 'found' THEN 1 ELSE 0 END) as found,
        SUM(CASE WHEN realist_lookup_status = 'not_found' THEN 1 ELSE 0 END) as not_found
      FROM crmls_properties
      WHERE ${crmlsWhere}
    `).get(...crmlsParams);

    // Upcoming anniversaries (next 7 days)
    var todayStr = new Date().toISOString().slice(0, 10);
    var futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    var futureStr = futureDate.toISOString().slice(0, 10);

    var ownerFilter = (isAdmin && !effectiveOwnerId) ? '' : 'AND c.owner_id = ?';
    var ownerParams = (isAdmin && !effectiveOwnerId) ? [] : [effectiveOwnerId];

    var upcomingAnniversaries = db.prepare(`
      SELECT al.*, c.first_name, c.last_name, c.property_address, c.id as cid
      FROM anniversary_log al
      JOIN contacts c ON al.contact_id = c.id
      WHERE al.anniversary_date >= ? AND al.anniversary_date <= ?
        AND al.status = 'pending' ${ownerFilter}
      ORDER BY al.anniversary_date
      LIMIT 5
    `).all(todayStr, futureStr, ...ownerParams);

    res.render('realestate/dashboard', { title: 'Real Estate', stats, upcomingAnniversaries });
  } catch (err) {
    console.error('Real estate dashboard error:', err);
    res.status(500).render('error', { status: 500, message: 'Failed to load dashboard.' });
  }
});

// GET /realestate/import-crmls — CRMLS CSV upload form
router.get('/import-crmls', (req, res) => {
  res.render('realestate/import-crmls', {
    title: 'Import CRMLS',
    step: 'upload',
    headers: [],
    suggestions: {},
    sampleRows: [],
    crmlsFields: getFilteredCrmlsFields(),
  });
});

// POST /realestate/import-crmls/upload — parse CSV, store in session
router.post('/import-crmls/upload', upload.single('csvfile'), verifyCsrf, (req, res) => {
  try {
    if (!req.file) {
      setFlash(req, 'error', 'Please select a CSV file.');
      return res.redirect('/realestate/import-crmls');
    }

    const result = csv.parseFile(req.file.path);

    if (!result.rows || result.rows.length === 0) {
      setFlash(req, 'error', 'CSV file is empty or has no data rows.');
      fs.unlinkSync(req.file.path);
      return res.redirect('/realestate/import-crmls');
    }

    const suggestions = csv.suggestCrmlsMapping(result.headers);

    req.session.crmlsImport = {
      headers: result.headers,
      rows: result.rows,
      filePath: req.file.path,
      filename: req.file.originalname,
    };

    res.render('realestate/import-crmls', {
      title: 'Map Columns',
      step: 'map',
      headers: result.headers,
      suggestions,
      sampleRows: result.rows.slice(0, 3),
      crmlsFields: getFilteredCrmlsFields(),
      rowCount: result.rows.length,
    });
  } catch (err) {
    console.error('CRMLS upload error:', err);
    if (req.file) fs.unlinkSync(req.file.path);
    setFlash(req, 'error', 'Failed to parse CSV: ' + err.message);
    res.redirect('/realestate/import-crmls');
  }
});

// POST /realestate/import-crmls/map — apply mapping, import to crmls_properties
router.post('/import-crmls/map', (req, res) => {
  try {
    const crmlsImport = req.session.crmlsImport;
    if (!crmlsImport) {
      setFlash(req, 'error', 'No CSV data found. Please upload again.');
      return res.redirect('/realestate/import-crmls');
    }

    const mapping = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (key.startsWith('mapping_') && value && value !== 'skip') {
        const csvCol = key.replace('mapping_', '');
        mapping[csvCol] = value;
      }
    }

    if (Object.keys(mapping).length === 0) {
      setFlash(req, 'error', 'Please map at least one column.');
      return res.redirect('/realestate/import-crmls');
    }

    const effectiveOwnerId = getEffectiveOwnerId(req);
    if (!effectiveOwnerId) {
      setFlash(req, 'error', 'Please select a user to act as before importing.');
      return res.redirect('/realestate/import-crmls');
    }

    const result = csv.importCrmlsProperties(crmlsImport.rows, mapping, effectiveOwnerId);

    // Clean up
    if (crmlsImport.filePath && fs.existsSync(crmlsImport.filePath)) {
      fs.unlinkSync(crmlsImport.filePath);
    }
    delete req.session.crmlsImport;

    let msg = `Imported ${result.inserted} property/properties.`;
    if (result.skipped > 0) msg += ` Skipped ${result.skipped} row(s).`;
    if (result.errors.length > 0) msg += ` ${result.errors.length} error(s).`;

    setFlash(req, result.inserted > 0 ? 'success' : 'info', msg);
    res.redirect('/realestate');
  } catch (err) {
    console.error('CRMLS map error:', err);
    setFlash(req, 'error', 'Failed to import properties: ' + err.message);
    res.redirect('/realestate/import-crmls');
  }
});

// GET /realestate/lookup — Realist lookup dashboard
router.get('/lookup', (req, res) => {
  try {
    const db = getDb();
    const isAdmin = req.session.user.role === 'admin';
    const effectiveOwnerId = getEffectiveOwnerId(req);
    const ownerWhere = (isAdmin && !effectiveOwnerId) ? '1=1' : 'owner_id = ?';
    const ownerParams = (isAdmin && !effectiveOwnerId) ? [] : [effectiveOwnerId];

    const statusFilter = req.query.status || 'all';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = 50;
    const offset = (page - 1) * perPage;

    const counts = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN realist_lookup_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN realist_lookup_status = 'found' THEN 1 ELSE 0 END) as found,
        SUM(CASE WHEN realist_lookup_status = 'not_found' THEN 1 ELSE 0 END) as not_found
      FROM crmls_properties
      WHERE ${ownerWhere}
    `).get(...ownerParams);

    var conditions = [ownerWhere];
    const params = [...ownerParams];
    if (['pending', 'found', 'not_found'].includes(statusFilter)) {
      conditions.push('realist_lookup_status = ?');
      params.push(statusFilter);
    }
    const where = conditions.join(' AND ');

    const totalCount = db.prepare(
      `SELECT COUNT(*) as c FROM crmls_properties WHERE ${where}`
    ).get(...params).c;
    const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

    const properties = db.prepare(
      `SELECT * FROM crmls_properties WHERE ${where}
       ORDER BY city, zip, property_address
       LIMIT ? OFFSET ?`
    ).all(...params, perPage, offset);

    // Count unmapped cities for admin badge
    var unmappedCount = 0;
    if (req.session.user.role === 'admin') {
      unmappedCount = db.prepare(`
        SELECT COUNT(DISTINCT raw_city) as c
        FROM crmls_properties
        WHERE raw_city IS NOT NULL
          AND raw_city NOT IN (SELECT raw_city FROM city_mappings)
      `).get().c;
    }

    res.render('realestate/realist-lookup', {
      title: 'Realist Lookup',
      properties,
      counts,
      statusFilter,
      currentPage: page,
      totalPages,
      totalCount,
      unmappedCount,
    });
  } catch (err) {
    console.error('Realist lookup error:', err);
    res.status(500).render('error', { status: 500, message: 'Failed to load lookup.' });
  }
});

// POST /realestate/lookup/finalize — create contact records from found properties
router.post('/lookup/finalize', (req, res) => {
  try {
    const db = getDb();
    const isAdmin = req.session.user.role === 'admin';
    const effectiveOwnerId = getEffectiveOwnerId(req);
    const ownerWhere = (isAdmin && !effectiveOwnerId) ? '1=1' : 'owner_id = ?';
    const ownerParams = (isAdmin && !effectiveOwnerId) ? [] : [effectiveOwnerId];
    const userId = effectiveOwnerId || req.session.user.id;
    const isAjax = req.headers.accept && req.headers.accept.includes('application/json');

    const found = db.prepare(
      `SELECT * FROM crmls_properties WHERE realist_lookup_status = 'found' AND realist_owner_name IS NOT NULL AND ${ownerWhere}`
    ).all(...ownerParams);

    if (found.length === 0) {
      if (isAjax) return res.json({ success: false, error: 'No properties to finalize.' });
      setFlash(req, 'info', 'No properties with found owners to finalize.');
      return res.redirect('/realestate/lookup');
    }

    const insertContact = db.prepare(
      `INSERT INTO contacts (owner_id, first_name, last_name, property_address, city, state, zip, purchase_date, purchase_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const existsCheck = db.prepare(
      'SELECT id FROM contacts WHERE owner_id = ? AND property_address = ?'
    );

    const deleteProperty = db.prepare('DELETE FROM crmls_properties WHERE id = ?');

    let created = 0;
    let skipped = 0;
    const finalizedIds = [];

    const finalize = db.transaction(() => {
      for (const prop of found) {
        const existing = existsCheck.get(userId, prop.property_address);
        if (existing) {
          skipped++;
          // Still remove from lookup even if duplicate
          deleteProperty.run(prop.id);
          finalizedIds.push(prop.id);
          continue;
        }

        const name = prop.realist_owner_name.trim();
        const parts = name.split(/\s+/);
        const lastName = parts.length > 1 ? parts.pop() : name;
        const firstName = parts.length > 0 ? parts.join(' ') : null;

        insertContact.run(
          userId, firstName, lastName,
          prop.property_address, prop.city || null, prop.state || null,
          prop.zip || null, prop.sale_date || null, prop.sale_price || null
        );
        created++;
        deleteProperty.run(prop.id);
        finalizedIds.push(prop.id);
      }
    });

    finalize();

    // Get updated counts
    const counts = db.prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN realist_lookup_status = 'found' THEN 1 ELSE 0 END) as found,
        SUM(CASE WHEN realist_lookup_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN realist_lookup_status = 'not_found' THEN 1 ELSE 0 END) as not_found
      FROM crmls_properties WHERE ${ownerWhere}`
    ).get(...ownerParams);

    if (isAjax) {
      return res.json({ success: true, created, skipped, finalizedIds, counts });
    }

    let msg = `Created ${created} contact(s) from found properties.`;
    if (skipped > 0) msg += ` Skipped ${skipped} duplicate(s).`;
    setFlash(req, 'success', msg);
    res.redirect('/contacts');
  } catch (err) {
    console.error('Finalize error:', err);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({ error: 'Failed to finalize.' });
    }
    setFlash(req, 'error', 'Failed to create contacts: ' + err.message);
    res.redirect('/realestate/lookup');
  }
});

// ========== vCard Import & Phone/Email Matching ==========

const vcfUpload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for large contact files
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.vcf') || file.mimetype === 'text/vcard' || file.mimetype === 'text/x-vcard') {
      cb(null, true);
    } else {
      cb(new Error('Only vCard (.vcf) files are allowed.'));
    }
  },
});

// GET /realestate/import-vcard — upload form
router.get('/import-vcard', (req, res) => {
  res.render('realestate/import-vcard', { title: 'Import vCard', step: 'upload', summary: null });
});

// POST /realestate/import-vcard/upload — parse VCF, store in DB, run matching
router.post('/import-vcard/upload', vcfUpload.single('vcffile'), verifyCsrf, (req, res) => {
  try {
    if (!req.file) {
      setFlash(req, 'error', 'Please select a vCard (.vcf) file.');
      return res.redirect('/realestate/import-vcard');
    }

    const db = getDb();
    const userId = getEffectiveOwnerId(req);
    if (!userId) {
      setFlash(req, 'error', 'Please select a user to act as before importing.');
      fs.unlinkSync(req.file.path);
      return res.redirect('/realestate/import-vcard');
    }
    const result = vcard.parseFile(req.file.path);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    if (result.contacts.length === 0) {
      setFlash(req, 'error', 'No contacts found in vCard file.');
      return res.redirect('/realestate/import-vcard');
    }

    // Store import record
    const importResult = db.prepare(
      'INSERT INTO contact_imports (filename, import_type, contact_count, imported_by) VALUES (?, ?, ?, ?)'
    ).run(req.file.originalname, 'vcard', result.contacts.length, userId);
    const importId = importResult.lastInsertRowid;

    // Insert imported contacts
    const insertImported = db.prepare(
      'INSERT INTO imported_contacts (import_id, full_name, first_name, last_name, phone, email, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    const insertMany = db.transaction(() => {
      for (const c of result.contacts) {
        insertImported.run(
          importId,
          c.full_name || null,
          c.first_name || null,
          c.last_name || null,
          c.phone || null,
          c.email || null,
          c.raw_data || null
        );
      }
    });
    insertMany();

    // Get imported contacts from DB (now with IDs)
    const importedContacts = db.prepare(
      'SELECT * FROM imported_contacts WHERE import_id = ?'
    ).all(importId);

    // Get existing contacts for this user that are missing phone or email
    const existingContacts = db.prepare(
      "SELECT * FROM contacts WHERE owner_id = ? AND ((phone IS NULL OR phone = '') OR (email IS NULL OR email = ''))"
    ).all(userId);

    // Run matching algorithm — from existing contacts' perspective
    const matchResults = matcher.matchAllByExisting(existingContacts, importedContacts);

    // Store matches in phone_matches table
    const insertMatch = db.prepare(
      'INSERT INTO phone_matches (contact_id, imported_contact_id, match_type, confidence_score) VALUES (?, ?, ?, ?)'
    );

    let autoConfirmed = 0;
    let needsReview = 0;
    let unmatched = 0;

    const storeMatches = db.transaction(() => {
      for (const result of matchResults) {
        if (result.matches.length === 0) {
          unmatched++;
          continue;
        }

        const bestMatch = result.matches[0];
        if (bestMatch.confidence >= 70) {
          insertMatch.run(result.contact_id, bestMatch.imported_contact_id, 'auto', bestMatch.confidence);
          autoConfirmed++;
        } else {
          insertMatch.run(result.contact_id, bestMatch.imported_contact_id, 'auto', bestMatch.confidence);
          needsReview++;
        }
      }
    });
    storeMatches();

    const phonesFound = result.contacts.filter(c => c.phone).length;
    const emailsFound = result.contacts.filter(c => c.email).length;

    setFlash(req, 'success',
      `Imported ${result.contacts.length} contact(s) (${phonesFound} phones, ${emailsFound} emails). ` +
      `Matched to ${autoConfirmed + needsReview} existing contact(s). Needs review: ${needsReview}. Unmatched contacts: ${unmatched}.`
    );
    res.redirect('/realestate/matching?import_id=' + importId);
  } catch (err) {
    console.error('vCard upload error:', err);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    setFlash(req, 'error', 'Failed to import vCard: ' + err.message);
    res.redirect('/realestate/import-vcard');
  }
});

// GET /realestate/matching — review dashboard
router.get('/matching', (req, res) => {
  try {
    const db = getDb();
    const userId = getEffectiveOwnerId(req);
    if (!userId) {
      setFlash(req, 'error', 'Please select a user to act as before viewing matches.');
      return res.redirect('/realestate');
    }
    const importId = req.query.import_id;

    // Optional import filter (filters through the join chain)
    let importFilter = '';
    const importParams = [];
    if (importId) {
      importFilter = 'AND ci.id = ?';
      importParams.push(parseInt(importId));
    }

    // Contact-centric queries: existing contacts are the primary entity
    // Applied: high-confidence matches already confirmed and applied
    const confirmed = db.prepare(`
      SELECT c.id as contact_id, c.first_name as c_first, c.last_name as c_last,
             c.property_address as c_address, c.phone as c_phone, c.email as c_email,
             pm.id as match_id, pm.confidence_score, pm.confirmed_at,
             ic.id as imported_id, ic.full_name as ic_name, ic.first_name as ic_first,
             ic.last_name as ic_last, ic.phone as ic_phone, ic.email as ic_email
      FROM phone_matches pm
      JOIN contacts c ON pm.contact_id = c.id
      JOIN imported_contacts ic ON pm.imported_contact_id = ic.id
      JOIN contact_imports ci ON ic.import_id = ci.id
      WHERE c.owner_id = ? ${importFilter}
        AND pm.confidence_score >= 70
        AND pm.confirmed_at IS NOT NULL
      ORDER BY pm.confidence_score DESC
    `).all(userId, ...importParams);

    // Auto-matched: high confidence, not yet applied
    const autoConfirmed = db.prepare(`
      SELECT c.id as contact_id, c.first_name as c_first, c.last_name as c_last,
             c.property_address as c_address, c.phone as c_phone, c.email as c_email,
             pm.id as match_id, pm.confidence_score,
             ic.id as imported_id, ic.full_name as ic_name, ic.first_name as ic_first,
             ic.last_name as ic_last, ic.phone as ic_phone, ic.email as ic_email
      FROM phone_matches pm
      JOIN contacts c ON pm.contact_id = c.id
      JOIN imported_contacts ic ON pm.imported_contact_id = ic.id
      JOIN contact_imports ci ON ic.import_id = ci.id
      WHERE c.owner_id = ? ${importFilter}
        AND pm.confidence_score >= 70
        AND pm.confirmed_at IS NULL
      ORDER BY pm.confidence_score DESC
    `).all(userId, ...importParams);

    // Needs review: low confidence, not yet confirmed
    const needsReview = db.prepare(`
      SELECT c.id as contact_id, c.first_name as c_first, c.last_name as c_last,
             c.property_address as c_address, c.phone as c_phone, c.email as c_email,
             pm.id as match_id, pm.confidence_score,
             ic.id as imported_id, ic.full_name as ic_name, ic.first_name as ic_first,
             ic.last_name as ic_last, ic.phone as ic_phone, ic.email as ic_email
      FROM phone_matches pm
      JOIN contacts c ON pm.contact_id = c.id
      JOIN imported_contacts ic ON pm.imported_contact_id = ic.id
      JOIN contact_imports ci ON ic.import_id = ci.id
      WHERE c.owner_id = ? ${importFilter}
        AND pm.confidence_score < 70
        AND pm.confirmed_at IS NULL
      ORDER BY pm.confidence_score DESC
    `).all(userId, ...importParams);

    // Unmatched: existing contacts missing phone/email with no match entry
    const unmatched = db.prepare(`
      SELECT c.id as contact_id, c.first_name as c_first, c.last_name as c_last,
             c.property_address as c_address, c.phone as c_phone, c.email as c_email
      FROM contacts c
      WHERE c.owner_id = ?
        AND ((c.phone IS NULL OR c.phone = '') OR (c.email IS NULL OR c.email = ''))
        AND c.id NOT IN (SELECT contact_id FROM phone_matches)
      ORDER BY c.last_name, c.first_name
    `).all(userId);

    const counts = {
      confirmed: confirmed.length,
      autoConfirmed: autoConfirmed.length,
      review: needsReview.length,
      unmatched: unmatched.length,
      total: confirmed.length + autoConfirmed.length + needsReview.length + unmatched.length,
    };

    res.render('realestate/phone-matching', {
      title: 'Phone & Email Matching',
      confirmed,
      autoConfirmed,
      needsReview,
      unmatched,
      counts,
      importId: importId || '',
    });
  } catch (err) {
    console.error('Matching review error:', err);
    res.status(500).render('error', { status: 500, message: 'Failed to load matching review.' });
  }
});

// POST /realestate/matching/apply — bulk apply all confirmed matches
router.post('/matching/apply', (req, res) => {
  try {
    const db = getDb();
    const userId = getEffectiveOwnerId(req);
    if (!userId) {
      setFlash(req, 'error', 'Please select a user to act as before applying matches.');
      return res.redirect('/realestate/matching');
    }

    // Get all confirmed matches (auto with confidence >= 70 OR manually confirmed)
    const matches = db.prepare(`
      SELECT pm.id, pm.contact_id, pm.imported_contact_id,
             ic.phone as imported_phone, ic.email as imported_email
      FROM phone_matches pm
      JOIN imported_contacts ic ON pm.imported_contact_id = ic.id
      JOIN contact_imports ci ON ic.import_id = ci.id
      JOIN contacts c ON pm.contact_id = c.id
      WHERE ci.imported_by = ?
        AND (pm.confirmed_at IS NOT NULL OR pm.confidence_score >= 70)
      ORDER BY pm.id
    `).all(userId);

    let phonesUpdated = 0;
    let emailsUpdated = 0;

    const applyAll = db.transaction(() => {
      for (const match of matches) {
        const contact = db.prepare('SELECT phone, email FROM contacts WHERE id = ?').get(match.contact_id);
        if (!contact) continue;

        // Update phone if imported has one and contact is missing it
        if (match.imported_phone && (!contact.phone || contact.phone === '')) {
          db.prepare("UPDATE contacts SET phone = ?, phone_source = 'vcard' WHERE id = ?")
            .run(match.imported_phone, match.contact_id);
          phonesUpdated++;
        }

        // Update email if imported has one and contact is missing it
        if (match.imported_email && (!contact.email || contact.email === '')) {
          db.prepare("UPDATE contacts SET email = ?, email_source = 'vcard' WHERE id = ?")
            .run(match.imported_email, match.contact_id);
          emailsUpdated++;
        }

        // Mark match as confirmed if not already
        if (!db.prepare('SELECT confirmed_at FROM phone_matches WHERE id = ?').get(match.id).confirmed_at) {
          db.prepare("UPDATE phone_matches SET confirmed_at = datetime('now'), confirmed_by = ? WHERE id = ?")
            .run(userId, match.id);
        }
      }
    });

    applyAll();

    var message = `Applied ${matches.length} match(es). Updated ${phonesUpdated} phone(s) and ${emailsUpdated} email(s).`;

    // Return JSON for AJAX requests
    if (req.headers['x-csrf-token']) {
      return res.json({ success: true, message, applied: matches.length, phonesUpdated, emailsUpdated });
    }

    setFlash(req, 'success', message);
    res.redirect('/realestate/matching');
  } catch (err) {
    console.error('Apply matches error:', err);
    if (req.headers['x-csrf-token']) {
      return res.status(500).json({ error: err.message });
    }
    setFlash(req, 'error', 'Failed to apply matches: ' + err.message);
    res.redirect('/realestate/matching');
  }
});

// ========== Anniversaries ==========

// GET /realestate/anniversaries — anniversary digest view
router.get('/anniversaries', (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const todayStr = new Date().toISOString().slice(0, 10);

    // Trigger a check to ensure today's anniversaries are detected
    checkAnniversaries(7);

    const ownerFilter = isAdmin ? '' : 'AND c.owner_id = ?';
    const ownerParams = isAdmin ? [] : [userId];

    // Today's pending anniversaries
    const today = db.prepare(`
      SELECT al.*, c.first_name, c.last_name, c.property_address, c.email, c.phone, c.id as cid
      FROM anniversary_log al
      JOIN contacts c ON al.contact_id = c.id
      WHERE al.anniversary_date = ? AND al.status = 'pending' ${ownerFilter}
      ORDER BY c.last_name, c.first_name
    `).all(todayStr, ...ownerParams);

    // This week (next 7 days, not today)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const futureStr = futureDate.toISOString().slice(0, 10);

    const thisWeek = db.prepare(`
      SELECT al.*, c.first_name, c.last_name, c.property_address, c.email, c.phone, c.id as cid
      FROM anniversary_log al
      JOIN contacts c ON al.contact_id = c.id
      WHERE al.anniversary_date > ? AND al.anniversary_date <= ? AND al.status = 'pending' ${ownerFilter}
      ORDER BY al.anniversary_date, c.last_name
    `).all(todayStr, futureStr, ...ownerParams);

    // Recently completed (sent or skipped in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysStr = thirtyDaysAgo.toISOString().slice(0, 10);

    const completed = db.prepare(`
      SELECT al.*, c.first_name, c.last_name, c.property_address, c.id as cid
      FROM anniversary_log al
      JOIN contacts c ON al.contact_id = c.id
      WHERE al.status IN ('sent', 'skipped') AND al.anniversary_date >= ? ${ownerFilter}
      ORDER BY al.anniversary_date DESC
    `).all(thirtyDaysStr, ...ownerParams);

    // Admin: load digest settings for all RE users
    var digestSettings = [];
    if (isAdmin) {
      var reUsers = db.prepare(
        "SELECT id, name, email FROM users WHERE role = 'realestate' ORDER BY name"
      ).all();
      var settings = db.prepare('SELECT * FROM digest_settings').all();
      var settingsMap = {};
      settings.forEach(function(s) { settingsMap[s.user_id] = s; });
      digestSettings = reUsers.map(function(u) {
        var s = settingsMap[u.id];
        return {
          user_id: u.id,
          user_name: u.name,
          user_email: u.email,
          enabled: s ? s.enabled : 1,
          lookahead_days: s ? s.lookahead_days : 7,
        };
      });
    }

    // RE user: load their own digest setting
    var myDigestEnabled = true;
    if (!isAdmin) {
      var mySetting = db.prepare('SELECT enabled FROM digest_settings WHERE user_id = ?').get(userId);
      myDigestEnabled = mySetting ? !!mySetting.enabled : true;
    }

    res.render('realestate/anniversaries', {
      title: 'Anniversaries',
      today,
      thisWeek,
      completed,
      digestSettings,
      myDigestEnabled,
    });
  } catch (err) {
    console.error('Anniversaries error:', err);
    res.status(500).render('error', { status: 500, message: 'Failed to load anniversaries.' });
  }
});

module.exports = router;
