/**
 * Seed preset US holidays for the current year and next year.
 * Idempotent — checks for existing holidays before inserting.
 *
 * Usage: node scripts/seed-holidays.js
 */

const path = require('path');
// Set DATA_DIR if not already set so getDb can find the database
if (!process.env.DATA_DIR) {
  process.env.DATA_DIR = path.join(__dirname, '..');
}
const { getDb } = require('../db/init');

/**
 * Calculate Easter Sunday using the Anonymous Gregorian algorithm.
 */
function calculateEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/**
 * Calculate Labor Day: first Monday in September.
 */
function calculateLaborDay(year) {
  const sept1 = new Date(year, 8, 1); // September 1
  const dayOfWeek = sept1.getDay();
  const offset = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
  return 1 + offset;
}

/**
 * Calculate Thanksgiving: fourth Thursday in November.
 */
function calculateThanksgiving(year) {
  const nov1 = new Date(year, 10, 1); // November 1
  const dayOfWeek = nov1.getDay();
  const firstThursday = dayOfWeek <= 4 ? 4 - dayOfWeek + 1 : 11 - dayOfWeek + 4 + 1;
  return firstThursday + 21; // 4th Thursday = first + 21
}

function getHolidaysForYear(year) {
  const easter = calculateEaster(year);
  const laborDay = calculateLaborDay(year);
  const thanksgiving = calculateThanksgiving(year);

  const pad = (n) => String(n).padStart(2, '0');

  return [
    { name: "New Year's Day", date: `${year}-01-01` },
    { name: "Valentine's Day", date: `${year}-02-14` },
    { name: 'Easter', date: `${year}-${pad(easter.month)}-${pad(easter.day)}` },
    { name: 'Independence Day', date: `${year}-07-04` },
    { name: 'Labor Day', date: `${year}-09-${pad(laborDay)}` },
    { name: 'Halloween', date: `${year}-10-31` },
    { name: 'Thanksgiving', date: `${year}-11-${pad(thanksgiving)}` },
    { name: 'Christmas', date: `${year}-12-25` },
  ];
}

function seedHolidays() {
  const db = getDb();
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1];

  const checkStmt = db.prepare('SELECT id FROM holidays WHERE name = ? AND date = ?');
  const insertStmt = db.prepare(
    'INSERT INTO holidays (name, date, is_preset, owner_id) VALUES (?, ?, 1, NULL)'
  );

  let inserted = 0;
  let skipped = 0;

  const seed = db.transaction(() => {
    for (const year of years) {
      const holidays = getHolidaysForYear(year);
      for (const h of holidays) {
        const existing = checkStmt.get(h.name, h.date);
        if (existing) {
          skipped++;
          continue;
        }
        insertStmt.run(h.name, h.date);
        inserted++;
      }
    }
  });

  seed();
  console.log(`Seeded ${inserted} holiday(s), skipped ${skipped} existing.`);
}

// Export for use by routes, and also run directly
module.exports = { seedHolidays, getHolidaysForYear, calculateEaster, calculateLaborDay, calculateThanksgiving };

// Run if called directly
if (require.main === module) {
  seedHolidays();
  process.exit(0);
}
