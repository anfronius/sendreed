const express = require('express');
const session = require('express-session');
const path = require('path');
const { getDb } = require('./db/init');
const { flashMiddleware } = require('./middleware/auth');
const { csrfMiddleware } = require('./middleware/csrf');
const { trimBody } = require('./middleware/validate');

const app = express();
const PORT = process.env.PORT || 3000;

const { recoverStaleCampaigns } = require('./services/email');
const { startCronJobs } = require('./services/cron');

// Ensure data directory exists
const dataDir = process.env.DATA_DIR || __dirname;
const fs = require('fs');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });

// Initialize database
getDb();

// Recover any campaigns stuck in 'sending' state from a previous crash
recoverStaleCampaigns();

// Start cron jobs (daily anniversary/holiday checks + morning digest)
startCronJobs();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Trim whitespace from form inputs
app.use(trimBody);

// Sessions
const SQLiteStore = require('connect-sqlite3')(session);
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: dataDir,
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// Flash messages + CSRF
app.use(flashMiddleware);
app.use(csrfMiddleware);

// Health check (no auth)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/admin', require('./routes/admin'));
app.use('/contacts', require('./routes/contacts'));
app.use('/campaign', require('./routes/campaign'));
app.use('/api', require('./routes/api'));
app.use('/realestate', require('./routes/realestate'));

// Root redirect
app.get('/', (req, res) => {
  res.redirect(req.session.user ? '/dashboard' : '/auth/login');
});

// 404
app.use((req, res) => {
  res.status(404).render('error', { status: 404, message: 'Page not found.', user: null, flash: {}, csrfToken: '' });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).render('error', { status: 500, message: 'Internal server error.', user: null, flash: {}, csrfToken: '' });
});

app.listen(PORT, () => {
  console.log(`SendReed running on http://localhost:${PORT}`);
});
