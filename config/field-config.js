/**
 * Role-specific field configuration for contacts.
 * Defines which DB columns are visible and how they're labeled per role.
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

// Fields shown as columns in the contacts table (excludes name fields which are combined)
var TABLE_FIELDS = {
  nonprofit: ['email', 'phone', 'organization', 'title', 'district', 'city', 'state'],
  realestate: ['email', 'phone', 'property_address', 'purchase_date', 'purchase_price', 'city', 'state'],
};

/**
 * Get the visible contact fields for a role.
 * In Phase 3, this will check the field_visibility DB table for overrides.
 */
function getVisibleFields(role) {
  return ROLE_FIELDS[role] ? ROLE_FIELDS[role].contacts : ALL_CONTACT_FIELDS;
}

/**
 * Get the table column fields for a role (excludes first_name/last_name which are combined into "Name").
 */
function getTableFields(role) {
  return TABLE_FIELDS[role] || TABLE_FIELDS.realestate;
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
