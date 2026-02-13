const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireRole, setFlash } = require('../middleware/auth');
const { getDb } = require('../db/init');
const csv = require('../services/csv');

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

const CRMLS_FIELDS = ['property_address', 'city', 'state', 'zip', 'sale_date', 'sale_price'];

// GET /realestate — dashboard
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN realist_lookup_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN realist_lookup_status = 'found' THEN 1 ELSE 0 END) as found,
        SUM(CASE WHEN realist_lookup_status = 'not_found' THEN 1 ELSE 0 END) as not_found
      FROM crmls_properties
    `).get();

    res.render('realestate/dashboard', { title: 'Real Estate', stats });
  } catch (err) {
    console.error('Real estate dashboard error:', err);
    res.status(500).render('error', { status: 500, message: 'Failed to load dashboard.' });
  }
});

// GET /realestate/import — CRMLS CSV upload form
router.get('/import', (req, res) => {
  res.render('realestate/import-crmls', {
    title: 'Import CRMLS',
    step: 'upload',
    headers: [],
    suggestions: {},
    sampleRows: [],
    crmlsFields: CRMLS_FIELDS,
  });
});

// POST /realestate/import/upload — parse CSV, store in session
router.post('/import/upload', upload.single('csvfile'), (req, res) => {
  try {
    if (!req.file) {
      setFlash(req, 'error', 'Please select a CSV file.');
      return res.redirect('/realestate/import');
    }

    const result = csv.parseFile(req.file.path);

    if (!result.rows || result.rows.length === 0) {
      setFlash(req, 'error', 'CSV file is empty or has no data rows.');
      fs.unlinkSync(req.file.path);
      return res.redirect('/realestate/import');
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
      crmlsFields: CRMLS_FIELDS,
      rowCount: result.rows.length,
    });
  } catch (err) {
    console.error('CRMLS upload error:', err);
    if (req.file) fs.unlinkSync(req.file.path);
    setFlash(req, 'error', 'Failed to parse CSV: ' + err.message);
    res.redirect('/realestate/import');
  }
});

// POST /realestate/import/map — apply mapping, import to crmls_properties
router.post('/import/map', (req, res) => {
  try {
    const crmlsImport = req.session.crmlsImport;
    if (!crmlsImport) {
      setFlash(req, 'error', 'No CSV data found. Please upload again.');
      return res.redirect('/realestate/import');
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
      return res.redirect('/realestate/import');
    }

    const result = csv.importCrmlsProperties(crmlsImport.rows, mapping, req.session.user.id);

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
    res.redirect('/realestate/import');
  }
});

// GET /realestate/lookup — Realist lookup dashboard
router.get('/lookup', (req, res) => {
  try {
    const db = getDb();
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
    `).get();

    let where = '1=1';
    const params = [];
    if (['pending', 'found', 'not_found'].includes(statusFilter)) {
      where = 'realist_lookup_status = ?';
      params.push(statusFilter);
    }

    const totalCount = db.prepare(
      `SELECT COUNT(*) as c FROM crmls_properties WHERE ${where}`
    ).get(...params).c;
    const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

    const properties = db.prepare(
      `SELECT * FROM crmls_properties WHERE ${where}
       ORDER BY city, zip, property_address
       LIMIT ? OFFSET ?`
    ).all(...params, perPage, offset);

    res.render('realestate/realist-lookup', {
      title: 'Realist Lookup',
      properties,
      counts,
      statusFilter,
      currentPage: page,
      totalPages,
      totalCount,
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
    const userId = req.session.user.id;

    const found = db.prepare(
      "SELECT * FROM crmls_properties WHERE realist_lookup_status = 'found' AND realist_owner_name IS NOT NULL"
    ).all();

    if (found.length === 0) {
      setFlash(req, 'info', 'No properties with found owners to finalize.');
      return res.redirect('/realestate/lookup');
    }

    const insertContact = db.prepare(
      `INSERT INTO contacts (owner_id, first_name, last_name, property_address, city, state, zip, purchase_date, purchase_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    // Check for existing contacts to avoid duplicates
    const existsCheck = db.prepare(
      'SELECT id FROM contacts WHERE owner_id = ? AND property_address = ?'
    );

    let created = 0;
    let skipped = 0;

    const finalize = db.transaction(() => {
      for (const prop of found) {
        // Skip if contact already exists for this property
        const existing = existsCheck.get(userId, prop.property_address);
        if (existing) {
          skipped++;
          continue;
        }

        const name = prop.realist_owner_name.trim();
        const parts = name.split(/\s+/);
        const lastName = parts.length > 1 ? parts.pop() : name;
        const firstName = parts.length > 0 ? parts.join(' ') : null;

        insertContact.run(
          userId,
          firstName,
          lastName,
          prop.property_address,
          prop.city || null,
          prop.state || null,
          prop.zip || null,
          prop.sale_date || null,
          prop.sale_price || null
        );
        created++;
      }
    });

    finalize();

    let msg = `Created ${created} contact(s) from found properties.`;
    if (skipped > 0) msg += ` Skipped ${skipped} duplicate(s).`;

    setFlash(req, 'success', msg);
    res.redirect('/contacts');
  } catch (err) {
    console.error('Finalize error:', err);
    setFlash(req, 'error', 'Failed to create contacts: ' + err.message);
    res.redirect('/realestate/lookup');
  }
});

module.exports = router;
