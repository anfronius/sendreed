const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth, setFlash } = require('../middleware/auth');
const { verifyCsrf } = require('../middleware/csrf');
const { getDb } = require('../db/init');
const csv = require('../services/csv');

const router = express.Router();
router.use(requireAuth);

// Configure multer for CSV uploads
const uploadsDir = path.join(process.env.DATA_DIR || path.join(__dirname, '..'), 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed.'));
    }
  },
});

// GET /contacts — paginated list
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const userId = req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = 25;
    const offset = (page - 1) * perPage;
    const search = req.query.search || '';
    const filter = req.query.filter || 'all';

    let where = isAdmin ? '1=1' : 'owner_id = ?';
    const params = isAdmin ? [] : [userId];

    if (search) {
      where += " AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ? OR organization LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }

    if (filter === 'missing-email') {
      where += " AND (email IS NULL OR email = '')";
    } else if (filter === 'missing-phone') {
      where += " AND (phone IS NULL OR phone = '')";
    }

    const totalCount = db.prepare(`SELECT COUNT(*) as c FROM contacts WHERE ${where}`).get(...params).c;
    const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

    const contacts = db.prepare(
      `SELECT * FROM contacts WHERE ${where} ORDER BY last_name, first_name LIMIT ? OFFSET ?`
    ).all(...params, perPage, offset);

    res.render('contacts/list', {
      title: 'Contacts',
      contacts,
      currentPage: page,
      totalPages,
      totalCount,
      search,
      filter,
      baseUrl: '/contacts',
    });
  } catch (err) {
    console.error('Contacts list error:', err);
    res.status(500).render('error', { status: 500, message: 'Failed to load contacts.' });
  }
});

// GET /contacts/import — upload form
router.get('/import', (req, res) => {
  res.render('contacts/import-csv', {
    title: 'Import CSV',
    step: 'upload',
    headers: [],
    suggestions: {},
    sampleRows: [],
    contactFields: csv.CONTACT_FIELDS,
  });
});

// POST /contacts/import/upload — parse CSV, store in session
router.post('/import/upload', upload.single('csvfile'), verifyCsrf, (req, res) => {
  try {
    if (!req.file) {
      setFlash(req, 'error', 'Please select a CSV file.');
      return res.redirect('/contacts/import');
    }

    const result = csv.parseFile(req.file.path);

    if (!result.rows || result.rows.length === 0) {
      setFlash(req, 'error', 'CSV file is empty or has no data rows.');
      fs.unlinkSync(req.file.path);
      return res.redirect('/contacts/import');
    }

    const suggestions = csv.suggestMapping(result.headers);

    // Store parsed data in session for the mapping step
    req.session.csvImport = {
      headers: result.headers,
      rows: result.rows,
      filePath: req.file.path,
      filename: req.file.originalname,
    };

    res.render('contacts/import-csv', {
      title: 'Map Columns',
      step: 'map',
      headers: result.headers,
      suggestions,
      sampleRows: result.rows.slice(0, 3),
      contactFields: csv.CONTACT_FIELDS,
      rowCount: result.rows.length,
    });
  } catch (err) {
    console.error('CSV upload error:', err);
    if (req.file) fs.unlinkSync(req.file.path);
    setFlash(req, 'error', 'Failed to parse CSV: ' + err.message);
    res.redirect('/contacts/import');
  }
});

// POST /contacts/import/map — apply mapping, insert records
router.post('/import/map', (req, res) => {
  try {
    const csvImport = req.session.csvImport;
    if (!csvImport) {
      setFlash(req, 'error', 'No CSV data found. Please upload again.');
      return res.redirect('/contacts/import');
    }

    // Build mapping from form: mapping_ColumnName = dbField
    const mapping = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (key.startsWith('mapping_') && value && value !== 'skip') {
        const csvCol = key.replace('mapping_', '');
        mapping[csvCol] = value;
      }
    }

    if (Object.keys(mapping).length === 0) {
      setFlash(req, 'error', 'Please map at least one column.');
      return res.redirect('/contacts/import');
    }

    const uploadType = req.session.user.role === 'realestate' ? 'crmls' : 'politicians';
    const result = csv.importContacts(csvImport.rows, mapping, req.session.user.id, uploadType);

    // Clean up
    if (csvImport.filePath && fs.existsSync(csvImport.filePath)) {
      fs.unlinkSync(csvImport.filePath);
    }
    delete req.session.csvImport;

    let msg = `Imported ${result.inserted} contact(s).`;
    if (result.skipped > 0) msg += ` Skipped ${result.skipped} row(s).`;
    if (result.errors.length > 0) msg += ` ${result.errors.length} error(s).`;

    setFlash(req, result.inserted > 0 ? 'success' : 'info', msg);
    res.redirect('/contacts');
  } catch (err) {
    console.error('CSV map error:', err);
    setFlash(req, 'error', 'Failed to import contacts: ' + err.message);
    res.redirect('/contacts/import');
  }
});

module.exports = router;
