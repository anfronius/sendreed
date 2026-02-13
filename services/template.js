const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

const VARIABLES_BY_ROLE = {
  nonprofit: [
    'first_name', 'last_name', 'title', 'district', 'city', 'state',
    'organization', 'email', 'phone'
  ],
  realestate: [
    'first_name', 'last_name', 'property_address', 'city', 'state',
    'purchase_date', 'purchase_price', 'years', 'email', 'phone'
  ],
  admin: [
    'first_name', 'last_name', 'title', 'district', 'city', 'state',
    'organization', 'email', 'phone', 'property_address',
    'purchase_date', 'purchase_price', 'years'
  ],
};

function getAvailableVariables(role) {
  return VARIABLES_BY_ROLE[role] || VARIABLES_BY_ROLE.admin;
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
    if (varName === 'years' && contact.purchase_date) {
      const purchaseYear = new Date(contact.purchase_date).getFullYear();
      const currentYear = new Date().getFullYear();
      const years = currentYear - purchaseYear;
      return years > 0 ? String(years) : '';
    }
    const val = contact[varName];
    return val != null ? String(val) : '';
  });
}

module.exports = { render, extractVariables, getAvailableVariables, VARIABLE_REGEX };
