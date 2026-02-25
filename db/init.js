const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

let db;

function getDb() {
  if (db) return db;

  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..');
  const dbPath = path.join(dataDir, 'sendreed.db');

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
  seedAdmin();

  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'nonprofit', 'realestate')),
      name TEXT NOT NULL,
      smtp_provider TEXT,
      smtp_host TEXT,
      smtp_port INTEGER,
      smtp_email TEXT,
      smtp_password_encrypted TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      organization TEXT,
      title TEXT,
      district TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      property_address TEXT,
      purchase_date DATE,
      purchase_price REAL,
      phone_source TEXT CHECK (phone_source IN ('csv', 'vcard', 'manual')),
      email_source TEXT CHECK (email_source IN ('csv', 'vcard', 'manual')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
      subject_template TEXT,
      body_template TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      template_id INTEGER NOT NULL REFERENCES templates(id),
      channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewing', 'sending', 'sent', 'paused', 'resume_tomorrow')),
      total_count INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS campaign_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
      contact_id INTEGER NOT NULL REFERENCES contacts(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'excluded', 'generated')),
      rendered_subject TEXT,
      rendered_body TEXT,
      error_message TEXT,
      sent_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS csv_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      upload_type TEXT NOT NULL CHECK (upload_type IN ('politicians', 'crmls')),
      row_count INTEGER,
      uploaded_by INTEGER REFERENCES users(id),
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crmls_properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_address TEXT NOT NULL,
      city TEXT,
      state TEXT,
      zip TEXT,
      sale_date DATE,
      sale_price REAL,
      csv_upload_id INTEGER REFERENCES csv_uploads(id),
      realist_owner_name TEXT,
      realist_lookup_status TEXT DEFAULT 'pending' CHECK (realist_lookup_status IN ('pending', 'found', 'not_found')),
      looked_up_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date DATE NOT NULL,
      is_preset BOOLEAN DEFAULT 0,
      owner_id INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS anniversary_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id),
      anniversary_date DATE NOT NULL,
      years INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped')),
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contact_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      import_type TEXT DEFAULT 'vcard',
      contact_count INTEGER,
      imported_by INTEGER REFERENCES users(id),
      imported_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS imported_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL REFERENCES contact_imports(id),
      full_name TEXT,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      email TEXT,
      raw_data TEXT
    );

    CREATE TABLE IF NOT EXISTS phone_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id),
      imported_contact_id INTEGER NOT NULL REFERENCES imported_contacts(id),
      match_type TEXT CHECK (match_type IN ('auto', 'manual')),
      confidence_score INTEGER,
      confirmed_by INTEGER REFERENCES users(id),
      confirmed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS city_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raw_city TEXT UNIQUE NOT NULL,
      mapped_city TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS digest_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      enabled INTEGER NOT NULL DEFAULT 1,
      lookahead_days INTEGER NOT NULL DEFAULT 7,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id)
    );

    CREATE TABLE IF NOT EXISTS field_visibility (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK (role IN ('nonprofit', 'realestate')),
      field_name TEXT NOT NULL,
      visible INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER DEFAULT 0,
      UNIQUE(role, field_name)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_purchase_date ON contacts(purchase_date);
    CREATE INDEX IF NOT EXISTS idx_campaigns_owner ON campaigns(owner_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_crmls_status ON crmls_properties(realist_lookup_status);
    CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
    CREATE INDEX IF NOT EXISTS idx_anniversary_status ON anniversary_log(status, anniversary_date);
    CREATE INDEX IF NOT EXISTS idx_city_mappings_raw ON city_mappings(raw_city);
  `);

  // Add raw_city column to crmls_properties if it doesn't exist yet
  var crmlsCols = db.pragma('table_info(crmls_properties)').map(function(c) { return c.name; });
  if (!crmlsCols.includes('raw_city')) {
    db.exec('ALTER TABLE crmls_properties ADD COLUMN raw_city TEXT');
  }

  // Migrate existing data: set raw_city = city where raw_city is NULL
  db.prepare('UPDATE crmls_properties SET raw_city = city WHERE raw_city IS NULL').run();

  // Seed field_visibility defaults if the table is empty
  var fieldCount = db.prepare('SELECT COUNT(*) as c FROM field_visibility').get().c;
  if (fieldCount === 0) {
    var fieldConfig = require('../config/field-config');
    var insertField = db.prepare(
      'INSERT INTO field_visibility (role, field_name, visible, display_order) VALUES (?, ?, ?, ?)'
    );
    var seedFields = db.transaction(function() {
      ['nonprofit', 'realestate'].forEach(function(role) {
        var allFields = fieldConfig.ALL_CONTACT_FIELDS;
        var roleFields = fieldConfig.ROLE_FIELDS[role].contacts;
        allFields.forEach(function(field, idx) {
          insertField.run(role, field, roleFields.includes(field) ? 1 : 0, idx);
        });
      });
    });
    seedFields();
  }
}

function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;

  const existing = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (existing) return;

  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)'
  ).run(email, hash, 'admin', 'Admin');

  console.log('Admin user seeded:', email);
}

module.exports = { getDb };
