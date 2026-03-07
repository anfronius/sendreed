const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

const VARIABLES_BY_ROLE = {
  nonprofit: [
    'first_name', 'last_name', 'title', 'district', 'city', 'state',
    'organization', 'email', 'phone'
  ],
  realestate: [
    'first_name', 'last_name', 'property_address', 'city', 'state',
    'purchase_date', 'purchase_price', 'years_since_purchase', 'email', 'phone'
  ],
  admin: [
    'first_name', 'last_name', 'title', 'district', 'city', 'state',
    'organization', 'email', 'phone', 'property_address',
    'purchase_date', 'purchase_price', 'years_since_purchase'
  ],
};

// Map of variable names to field_visibility field names
const VARIABLE_TO_FIELD_MAP = {
  first_name: 'first_name',
  last_name: 'last_name',
  title: 'title',
  district: 'district',
  city: 'city',
  state: 'state',
  organization: 'organization',
  email: 'email',
  phone: 'phone',
  property_address: 'property_address',
  purchase_date: 'purchase_date',
  purchase_price: 'purchase_price',
  years_since_purchase: 'years_since_purchase',
};

function getAvailableVariables(role) {
  var baseVariables = VARIABLES_BY_ROLE[role] || VARIABLES_BY_ROLE.admin;

  // Filter by field visibility for non-admin roles
  if (role !== 'admin') {
    try {
      var fieldConfig = require('../config/field-config');
      var visibleFields = fieldConfig.getVisibleFields(role);

      // Filter variables to only include those whose corresponding field is visible
      return baseVariables.filter(function(varName) {
        var fieldName = VARIABLE_TO_FIELD_MAP[varName];
        // If no mapping exists or field is visible, include the variable
        return !fieldName || visibleFields.includes(fieldName);
      });
    } catch (e) {
      // If field config fails, return base variables
      return baseVariables;
    }
  }

  return baseVariables;
}

function extractVariables(templateStr) {
  const vars = new Set();
  let match;
  while ((match = VARIABLE_REGEX.exec(templateStr)) !== null) {
    vars.add(match[1]);
  }
  return Array.from(vars);
}

function render(templateStr, contact) {
  if (!templateStr) return '';
  return templateStr.replace(VARIABLE_REGEX, (full, varName) => {
    // Support both 'years_since_purchase' and legacy 'years' variable name
    if (varName === 'years' || varName === 'years_since_purchase') {
      // Use pre-calculated value if available, otherwise calculate from purchase_date
      if (contact.years_since_purchase != null) {
        return String(contact.years_since_purchase);
      }
      if (contact.purchase_date) {
        const today = new Date();
        const purchaseDate = new Date(contact.purchase_date);
        const years = Math.floor((today - purchaseDate) / (365.25 * 24 * 60 * 60 * 1000));
        return years > 0 ? String(years) : '';
      }
      return '';
    }
    const val = contact[varName];
    return val != null ? String(val) : '';
  });
}

module.exports = { render, extractVariables, getAvailableVariables, VARIABLE_REGEX };
