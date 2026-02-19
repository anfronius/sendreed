const Papa = require('papaparse');
const fs = require('fs');
const { getDb } = require('../db/init');
const { expandCity } = require('../config/ca-cities');

// Alias map: normalized header name → contact field
const COLUMN_ALIASES = {
  firstname: 'first_name',
  first_name: 'first_name',
  first: 'first_name',
  fname: 'first_name',
  lastname: 'last_name',
  last_name: 'last_name',
  last: 'last_name',
  lname: 'last_name',
  email: 'email',
  emailaddress: 'email',
  email_address: 'email',
  phone: 'phone',
  phonenumber: 'phone',
  phone_number: 'phone',
  mobile: 'phone',
  cell: 'phone',
  organization: 'organization',
  org: 'organization',
  company: 'organization',
  title: 'title',
  district: 'district',
  city: 'city',
  state: 'state',
  zip: 'zip',
  zipcode: 'zip',
  zip_code: 'zip',
  propertyaddress: 'property_address',
  property_address: 'property_address',
  address: 'property_address',
  purchasedate: 'purchase_date',
  purchase_date: 'purchase_date',
  saledate: 'purchase_date',
  sale_date: 'purchase_date',
  closedate: 'purchase_date',
  purchaseprice: 'purchase_price',
  purchase_price: 'purchase_price',
  saleprice: 'purchase_price',
  sale_price: 'purchase_price',
  price: 'purchase_price',
  notes: 'notes',
};

function normalizeHeader(header) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function suggestMapping(headers) {
  const suggestions = {};
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (COLUMN_ALIASES[normalized]) {
      suggestions[header] = COLUMN_ALIASES[normalized];
    }
  }
  return suggestions;
}

function parseFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const result = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
  });

  return {
    headers: result.meta.fields || [],
    rows: result.data,
    errors: result.errors,
  };
}

const CONTACT_FIELDS = [
  'first_name', 'last_name', 'email', 'phone', 'organization', 'title',
  'district', 'city', 'state', 'zip', 'property_address', 'purchase_date',
  'purchase_price', 'notes',
];

function importContacts(rows, mapping, ownerId, uploadType) {
  const db = getDb();
  let inserted = 0;
  let skipped = 0;
  const errors = [];

  // Record the upload
  const uploadResult = db.prepare(
    'INSERT INTO csv_uploads (filename, upload_type, row_count, uploaded_by) VALUES (?, ?, ?, ?)'
  ).run('csv_import', uploadType, rows.length, ownerId);

  const insertStmt = db.prepare(
    `INSERT INTO contacts (owner_id, first_name, last_name, email, phone, organization, title,
     district, city, state, zip, property_address, purchase_date, purchase_price, notes,
     phone_source, email_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertMany = db.transaction((rows) => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const contact = {};
        for (const [csvCol, dbField] of Object.entries(mapping)) {
          if (CONTACT_FIELDS.includes(dbField) && row[csvCol] != null) {
            contact[dbField] = String(row[csvCol]).trim();
          }
        }

        // Skip entirely empty rows
        const hasData = Object.values(contact).some(v => v && v.length > 0);
        if (!hasData) {
          skipped++;
          continue;
        }

        // Parse purchase_price as number
        if (contact.purchase_price) {
          const cleaned = contact.purchase_price.replace(/[$,]/g, '');
          contact.purchase_price = parseFloat(cleaned) || null;
        }

        insertStmt.run(
          ownerId,
          contact.first_name || null,
          contact.last_name || null,
          contact.email || null,
          contact.phone || null,
          contact.organization || null,
          contact.title || null,
          contact.district || null,
          contact.city || null,
          contact.state || null,
          contact.zip || null,
          contact.property_address || null,
          contact.purchase_date || null,
          contact.purchase_price || null,
          contact.notes || null,
          contact.phone ? 'csv' : null,
          contact.email ? 'csv' : null
        );
        inserted++;
      } catch (err) {
        errors.push({ row: i + 1, error: err.message });
        skipped++;
      }
    }
  });

  insertMany(rows);

  return { inserted, skipped, errors, uploadId: uploadResult.lastInsertRowid };
}

function importCrmlsProperties(rows, mapping, ownerId) {
  const db = getDb();
  let inserted = 0;
  let skipped = 0;
  const errors = [];

  const uploadResult = db.prepare(
    'INSERT INTO csv_uploads (filename, upload_type, row_count, uploaded_by) VALUES (?, ?, ?, ?)'
  ).run('crmls_import', 'crmls', rows.length, ownerId);

  const insertStmt = db.prepare(
    `INSERT INTO crmls_properties (property_address, city, state, zip, sale_date, sale_price, csv_upload_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const CRMLS_FIELDS = ['property_address', 'street_number', 'street_name', 'city', 'state', 'zip', 'sale_date', 'sale_price'];

  const insertMany = db.transaction((rows) => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const prop = {};
        for (const [csvCol, dbField] of Object.entries(mapping)) {
          if (CRMLS_FIELDS.includes(dbField) && row[csvCol] != null) {
            prop[dbField] = String(row[csvCol]).trim();
          }
        }

        // Concatenate street_number + street_name into property_address if needed
        if (!prop.property_address && (prop.street_number || prop.street_name)) {
          prop.property_address = [prop.street_number, prop.street_name].filter(Boolean).join(' ');
        }

        if (!prop.property_address) {
          skipped++;
          continue;
        }

        // Expand city abbreviations
        if (prop.city) {
          prop.city = expandCity(prop.city);
        }

        if (prop.sale_price) {
          const cleaned = prop.sale_price.replace(/[$,]/g, '');
          prop.sale_price = parseFloat(cleaned) || null;
        }

        insertStmt.run(
          prop.property_address,
          prop.city || null,
          prop.state || null,
          prop.zip || null,
          prop.sale_date || null,
          prop.sale_price || null,
          uploadResult.lastInsertRowid
        );
        inserted++;
      } catch (err) {
        errors.push({ row: i + 1, error: err.message });
        skipped++;
      }
    }
  });

  insertMany(rows);

  return { inserted, skipped, errors, uploadId: uploadResult.lastInsertRowid };
}

const CRMLS_COLUMN_ALIASES = {
  propertyaddress: 'property_address',
  property_address: 'property_address',
  address: 'property_address',
  streetaddress: 'property_address',
  streetnumber: 'street_number',
  street_number: 'street_number',
  streetno: 'street_number',
  houseno: 'street_number',
  housenumber: 'street_number',
  streetname: 'street_name',
  street_name: 'street_name',
  streetdir: 'street_name',
  saledate: 'sale_date',
  sale_date: 'sale_date',
  closedate: 'sale_date',
  closingdate: 'sale_date',
  closeofescrow: 'sale_date',
  saleprice: 'sale_price',
  sale_price: 'sale_price',
  closeprice: 'sale_price',
  closingprice: 'sale_price',
  price: 'sale_price',
  city: 'city',
  state: 'state',
  zip: 'zip',
  zipcode: 'zip',
  zip_code: 'zip',
};

function suggestCrmlsMapping(headers) {
  const suggestions = {};
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (CRMLS_COLUMN_ALIASES[normalized]) {
      suggestions[header] = CRMLS_COLUMN_ALIASES[normalized];
    }
  }
  return suggestions;
}

module.exports = { parseFile, suggestMapping, suggestCrmlsMapping, importContacts, importCrmlsProperties, CONTACT_FIELDS };
