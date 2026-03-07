/**
 * Structured logger for real estate pipeline actions.
 * Outputs JSON to stdout for Render log viewer filterability.
 */

function logAction(action, details) {
  var entry = {
    timestamp: new Date().toISOString(),
    level: 'info',
    action: action
  };
  if (details) {
    var keys = Object.keys(details);
    for (var i = 0; i < keys.length; i++) {
      entry[keys[i]] = details[keys[i]];
    }
  }
  try {
    console.log(JSON.stringify(entry));
  } catch (_) {
    // Never throw from logger
  }
}

module.exports = { logAction };
