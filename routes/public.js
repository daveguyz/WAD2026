/**
 * routes/public.js
 * Lookup data (categories, venues), home-page statistics and the contact form.
 * Base path: /api
 */
const express = require('express');
const db = require('../config/db');
const { EMAIL_RE, clean } = require('../utils/validate');

const router = express.Router();

// GET /api/categories
router.get('/categories', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*, (SELECT COUNT(*) FROM events e WHERE e.category_id = c.category_id
                     AND e.status = 'approved' AND e.end_datetime >= NOW()) AS upcoming
       FROM categories c ORDER BY c.name`);
    res.json({ categories: rows });
  } catch (err) { next(err); }
});

// GET /api/venues
router.get('/venues', async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM venues ORDER BY name');
    res.json({ venues: rows });
  } catch (err) { next(err); }
});

// GET /api/stats - numbers shown on the home page
router.get('/stats', async (req, res, next) => {
  try {
    const [[row]] = await db.query(
      `SELECT (SELECT COUNT(*) FROM events WHERE status='approved' AND end_datetime >= NOW()) AS upcoming_events,
              (SELECT COUNT(*) FROM users WHERE role='student') AS students,
              (SELECT COUNT(*) FROM registrations) AS registrations,
              (SELECT COUNT(*) FROM categories) AS categories`);
    res.json(row);
  } catch (err) { next(err); }
});

// POST /api/contact - contact form
router.post('/contact', async (req, res, next) => {
  try {
    const name = clean(req.body.name);
    const email = clean(req.body.email || '').toLowerCase();
    const subject = clean(req.body.subject);
    const message = clean(req.body.message);
    const errors = {};
    if (!name || name.length < 2 || name.length > 100) errors.name = 'Enter your name.';
    if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
    if (!subject || subject.length > 150) errors.subject = 'Choose or enter a subject.';
    if (!message || message.length < 10 || message.length > 2000) errors.message = 'Message must be 10-2000 characters.';
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', errors });

    const userId = req.session.user ? req.session.user.user_id : null;
    await db.query('INSERT INTO contact_messages (user_id, name, email, subject, message) VALUES (?, ?, ?, ?, ?)',
      [userId, name, email, subject, message]);
    res.status(201).json({ message: 'Thank you! Your message has been sent. We reply within 2 working days.' });
  } catch (err) { next(err); }
});

module.exports = router;
