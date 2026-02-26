/**
 * Role-specific field configuration for contacts.
 * Defines which DB columns are visible and how they're labeled per role.
 * Checks field_visibility DB table for admin overrides.
 */

var ALL_CONTACT_FIELDS = [
  'first_name', 'last_name', 'email', 'phone', 'organization', 'title',
  'district', 'city', 'state', 'zip', 'property_address', 'purchase_date',
  'purchase_price', 'notes',
];

var ROLE_FIELDS = {
  nonprofit: {
    contacts: ['first_name', 'last_name', 'email', 'phone', 'organization', 'title', 'district', 'city', 'state', 'zip', 'notes'],
  },
  realestate: {
    contacts: ['first_name', 'last_name', 'email', 'phone', 'property_address', 'purchase_date', 'purchase_price', 'city', 'state', 'zip', 'notes'],
  },
};

var LABEL_MAP = {
  first_name: 'First Name',
  last_name: 'Last Name',
  email: 'Email',
  phone: 'Phone',
  organization: 'Organization',
  title: 'Title',
  district: 'District',
  city: 'City',
  state: 'State',
  zip: 'Zip',
  property_address: 'Property Address',
  purchase_date: 'Close Date',
  purchase_price: 'Close Price',
  notes: 'Notes',
};

var EMPTY_PLACEHOLDER = {
  first_name: 'Add first name',
  last_name: 'Add last name',
  email: 'Add email',
  phone: 'Add phone',
  organization: 'Add org',
  title: 'Add title',
  district: 'Add district',
  city: 'Add city',
  state: 'Add state',
  zip: 'Add zip',
  property_address: 'Add address',
  purchase_date: 'Add date',
  purchase_price: 'Add price',
  notes: 'Add notes',
};

/**
 * Get the visible contact fields for a role, checking DB for admin overrides.
 * Falls back to hardcoded defaults if no DB entries exist.
 */
function getVisibleFields(role) {
  try {
    var { getDb } = require('../db/init');
    var db = getDb();
    var rows = db.prepare(
      'SELECT field_name FROM field_visibility WHERE role = ? AND visible = 1 ORDER BY display_order'
    ).all(role);
    if (rows.length > 0) {
      return rows.map(function(r) { return r.field_name; });
    }
  } catch (e) {
    // DB not initialized yet (e.g., during startup seeding); fall back to defaults
  }
  return ROLE_FIELDS[role] ? ROLE_FIELDS[role].contacts : ALL_CONTACT_FIELDS;
}

/**
 * Get the table column fields for a role (excludes first_name/last_name which are combined into "Name").
 */
function getTableFields(role) {
  var visible = getVisibleFields(role);
  return visible.filter(function(f) {
    return f !== 'first_name' && f !== 'last_name';
  });
}

function getLabel(field) {
  return LABEL_MAP[field] || field;
}

function getPlaceholder(field) {
  return EMPTY_PLACEHOLDER[field] || 'Add ' + field;
}

module.exports = {
  ALL_CONTACT_FIELDS,
  ROLE_FIELDS,
  LABEL_MAP,
  EMPTY_PLACEHOLDER,
  getVisibleFields,
  getTableFields,
  getLabel,
  getPlaceholder,
};
