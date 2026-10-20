/**
 * CampusPulse - NUST Campus Connect
 * server.js  |  Application entry point (Node.js + Express)
 *
 * Responsibilities:
 *  - security headers, sessions, JSON body parsing
 *  - server-side protection of private HTML pages
 *  - serves the static front-end (public/)
 *  - mounts the REST API (routes/)
 *  - central error handling
 */
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');

const db = require('./config/db');
const { protectPage } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const { router: eventRoutes } = require('./routes/events');
const meRoutes = require('./routes/me');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

if (isProd) app.set('trust proxy', 1);

// ---- Security headers (Content-Security-Policy, X-Frame-Options, ...)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: isProd ? [] : null
    }
  }
}));

// ---- Body parsing (size-limited)
app.use(express.json({ limit: '50kb' }));

// ---- Sessions: server-side session, ID in an HttpOnly cookie
app.use(session({
  name: 'cp.sid',
  secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,          // not readable from JavaScript (mitigates XSS cookie theft)
    sameSite: 'lax',         // not sent on cross-site POSTs (mitigates CSRF)
    secure: isProd,          // HTTPS only in production
    maxAge: 1000 * 60 * 60 * 2 // 2 hours
  }
}));

// ---- CSRF defence-in-depth: state-changing API calls must be JSON.
// HTML forms on other sites always send a form content-type and cannot send
// application/json without a CORS preflight, which this server never approves.
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      req.headers['content-type'] && !req.is('application/json')) {
    return res.status(415).json({ error: 'Requests must be sent as JSON.' });
  }
  next();
});

// ---- Server-side page protection (runs BEFORE static files are served)
app.get(['/dashboard.html', '/submit-event.html'], protectPage('student'));
app.get(['/admin', '/admin/', '/admin/*'], protectPage('admin'));

// ---- REST API
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/me', meRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);

app.get('/api/health', async (req, res) => {
  try { await db.query('SELECT 1'); res.json({ ok: true, db: 'connected' }); }
  catch (e) { res.status(500).json({ ok: false, db: 'unavailable' }); }
});

// Unknown API route
app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));

// ---- Static front-end
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ---- 404 page
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

// ---- Central error handler: log details, return a generic message
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[error]', err.code || '', err.message);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON.' });
  const dbDown = ['ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR'].includes(err.code);
  res.status(dbDown ? 503 : 500).json({
    error: dbDown ? 'Database unavailable. Is MySQL running?' : 'Something went wrong. Please try again.'
  });
});

app.listen(PORT, () => {
  console.log(`CampusPulse running at http://localhost:${PORT}`);
});
