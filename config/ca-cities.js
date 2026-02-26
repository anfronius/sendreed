/**
 * California city abbreviation to full name mapping.
 * Cleared — city mappings are now managed in the database via the city_mappings table.
 * Admin manages mappings through the Realist Lookup page GUI.
 */
const CA_CITY_MAP = {};

/**
 * Expand a city abbreviation to its full name.
 * Returns the original value if no match found.
 */
function expandCity(city) {
  if (!city) return city;
  const trimmed = city.trim();
  const upper = trimmed.toUpperCase();
  if (CA_CITY_MAP[upper]) {
    return CA_CITY_MAP[upper];
  }
  return trimmed;
}

module.exports = { CA_CITY_MAP, expandCity };
