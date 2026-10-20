/**
 * routes/auth.js
 * Registration, login, logout, current-user and profile endpoints.
 * Base path: /api/auth
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { requireLogin } = require('../middleware/auth');
const { EMAIL_RE, STUDENT_NO_RE, PHONE_RE, PASSWORD_RE, clean } = require('../utils/validate');

const router = express.Router();

// ---- very small in-memory brute-force protection for login ----------
const attempts = new Map(); // key: ip|email -> { count, until }
const MAX_ATTEMPTS = 5;
const LOCK_MS = 10 * 60 * 1000;

function isLocked(key) {
  const a = attempts.get(key);
  if (a && a.until && a.until > Date.now()) return true;
  if (a && a.until && a.until <= Date.now()) attempts.delete(key);
  return false;
}
function recordFailure(key) {
  const a = attempts.get(key) || { count: 0, until: 0 };
  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) a.until = Date.now() + LOCK_MS;
  attempts.set(key, a);
}

// Only expose safe fields - never the password hash
function publicUser(u) {
  return {
    user_id: u.user_id, full_name: u.full_name, student_number: u.student_number,
    email: u.email, faculty: u.faculty, phone: u.phone, role: u.role, created_at: u.created_at
  };
}

// POST /api/auth/register ----------------------------------------------
router.post('/register', async (req, res, next) => {
  try {
    const full_name = clean(req.body.full_name);
    const student_number = clean(req.body.student_number);
    const email = clean(req.body.email || '').toLowerCase();
    const faculty = clean(req.body.faculty);
    const phone = clean(req.body.phone) || null;
    const password = req.body.password || '';
    const confirm = req.body.confirm_password || '';

    const errors = {};
    if (!full_name || full_name.length < 3 || full_name.length > 100) errors.full_name = 'Enter your full name (3-100 characters).';
    if (!STUDENT_NO_RE.test(student_number || '')) errors.student_number = 'Student number must be exactly 9 digits.';
    if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
    if (!faculty) errors.faculty = 'Select your faculty.';
    if (phone && !PHONE_RE.test(phone.replace(/\s/g, ''))) errors.phone = 'Enter a valid Namibian phone number.';
    if (!PASSWORD_RE.test(password)) errors.password = 'Password needs 8+ characters with upper case, lower case and a number.';
    if (password !== confirm) errors.confirm_password = 'Passwords do not match.';
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', errors });

    const [existing] = await db.query(
      'SELECT email, student_number FROM users WHERE email = ? OR student_number = ?',
      [email, student_number]
    );
    if (existing.length) {
      const dup = {};
      if (existing.some(r => r.email === email)) dup.email = 'This email is already registered.';
      if (existing.some(r => r.student_number === student_number)) dup.student_number = 'This student number is already registered.';
      return res.status(409).json({ error: 'Account already exists.', errors: dup });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      `INSERT INTO users (full_name, student_number, email, password_hash, faculty, phone, role)
       VALUES (?, ?, ?, ?, ?, ?, 'student')`,
      [full_name, student_number, email, hash, faculty, phone]
    );

    const [rows] = await db.query('SELECT * FROM users WHERE user_id = ?', [result.insertId]);
    // Regenerate session ID on login to prevent session fixation
    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.user = publicUser(rows[0]);
      res.status(201).json({ message: 'Account created successfully.', user: req.session.user });
    });
  } catch (err) { next(err); }
});

// POST /api/auth/login -------------------------------------------------
router.post('/login', async (req, res, next) => {
  try {
    const email = clean(req.body.email || '').toLowerCase();
    const password = req.body.password || '';
    const key = req.ip + '|' + email;

    if (!email || !password) return res.status(422).json({ error: 'Email and password are required.' });
    if (isLocked(key)) return res.status(429).json({ error: 'Too many failed attempts. Try again in 10 minutes.' });

    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    const ok = user && await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      recordFailure(key);
      // Generic message: do not reveal whether the email exists
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    attempts.delete(key);
    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.user = publicUser(user);
      res.json({ message: 'Welcome back, ' + user.full_name.split(' ')[0] + '!', user: req.session.user });
    });
  } catch (err) { next(err); }
});

// POST /api/auth/logout ------------------------------------------------
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('cp.sid');
    res.json({ message: 'You have been logged out.' });
  });
});

// GET /api/auth/me  - who is logged in? -------------------------------
router.get('/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

// PUT /api/auth/profile - update own profile ---------------------------
router.put('/profile', requireLogin, async (req, res, next) => {
  try {
    const full_name = clean(req.body.full_name);
    const faculty = clean(req.body.faculty);
    const phone = clean(req.body.phone) || null;
    const errors = {};
    if (!full_name || full_name.length < 3) errors.full_name = 'Enter your full name.';
    if (!faculty) errors.faculty = 'Select your faculty.';
    if (phone && !PHONE_RE.test(phone.replace(/\s/g, ''))) errors.phone = 'Enter a valid Namibian phone number.';
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', errors });

    await db.query('UPDATE users SET full_name = ?, faculty = ?, phone = ? WHERE user_id = ?',
      [full_name, faculty, phone, req.session.user.user_id]);
    const [rows] = await db.query('SELECT * FROM users WHERE user_id = ?', [req.session.user.user_id]);
    req.session.user = publicUser(rows[0]);
    res.json({ message: 'Profile updated.', user: req.session.user });
  } catch (err) { next(err); }
});

// PUT /api/auth/password - change own password ------------------------
router.put('/password', requireLogin, async (req, res, next) => {
  try {
    const { current_password = '', new_password = '' } = req.body;
    if (!PASSWORD_RE.test(new_password)) {
      return res.status(422).json({ error: 'New password needs 8+ characters with upper case, lower case and a number.',
        errors: { new_password: 'Too weak.' } });
    }
    const [rows] = await db.query('SELECT password_hash FROM users WHERE user_id = ?', [req.session.user.user_id]);
    if (!rows.length || !(await bcrypt.compare(current_password, rows[0].password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect.', errors: { current_password: 'Incorrect.' } });
    }
    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hash, req.session.user.user_id]);
    res.json({ message: 'Password changed.' });
  } catch (err) { next(err); }
});

module.exports = router;
