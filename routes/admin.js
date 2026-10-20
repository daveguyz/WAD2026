/**
 * routes/admin.js
 * Administration API: full CRUD on events, categories and venues;
 * user management; contact message inbox; dashboard statistics.
 * Base path: /api/admin   (all routes require an admin session)
 */
const express = require('express');
const db = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const { validateEvent, toInt, clean } = require('../utils/validate');
const { EVENT_SELECT } = require('./events');

const router = express.Router();
router.use(requireAdmin);

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// ---------------------------------------------------------------- STATS
router.get('/stats', async (req, res, next) => {
  try {
    const [[totals]] = await db.query(
      `SELECT (SELECT COUNT(*) FROM events) AS events,
              (SELECT COUNT(*) FROM events WHERE status='pending') AS pending,
              (SELECT COUNT(*) FROM users) AS users,
              (SELECT COUNT(*) FROM registrations) AS registrations,
              (SELECT COUNT(*) FROM contact_messages WHERE is_read = 0) AS unread`);
    const [byCategory] = await db.query(
      `SELECT c.name, c.colour, COUNT(e.event_id) AS total
       FROM categories c LEFT JOIN events e ON e.category_id = c.category_id
       GROUP BY c.category_id ORDER BY total DESC, c.name`);
    const [top] = await db.query(
      'SELECT event_id, title, registered, capacity FROM v_event_overview ORDER BY registered DESC LIMIT 5');
    res.json({ totals, byCategory, top });
  } catch (err) { next(err); }
});

// --------------------------------------------------------------- EVENTS
router.get('/events', async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    if (['pending', 'approved', 'rejected', 'cancelled'].includes(req.query.status)) {
      where.push('e.status = ?'); params.push(req.query.status);
    }
    const q = clean(req.query.q);
    if (q) { where.push('(e.title LIKE ? OR u.full_name LIKE ?)'); params.push('%' + q + '%', '%' + q + '%'); }
    const sql = `${EVENT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY FIELD(e.status,'pending','approved','rejected','cancelled'), e.start_datetime DESC`;
    const [rows] = await db.query(sql, params);
    res.json({ events: rows });
  } catch (err) { next(err); }
});

router.post('/events', async (req, res, next) => {
  try {
    const { errors, data } = validateEvent(req.body);
    const status = ['pending', 'approved', 'rejected', 'cancelled'].includes(req.body.status) ? req.body.status : 'approved';
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', errors });
    const [r] = await db.query(
      `INSERT INTO events (title, summary, description, category_id, venue_id, organiser_id, start_datetime,
         end_datetime, capacity, is_free, ticket_price, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [data.title, data.summary, data.description, data.category_id, data.venue_id, req.session.user.user_id,
       data.start_datetime, data.end_datetime, data.capacity, data.is_free, data.ticket_price, status]);
    res.status(201).json({ message: 'Event created.', event_id: r.insertId });
  } catch (err) { next(err); }
});

router.put('/events/:id', async (req, res, next) => {
  try {
    const { errors, data } = validateEvent(req.body);
    const status = ['pending', 'approved', 'rejected', 'cancelled'].includes(req.body.status) ? req.body.status : 'approved';
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', errors });
    const [r] = await db.query(
      `UPDATE events SET title=?, summary=?, description=?, category_id=?, venue_id=?, start_datetime=?,
         end_datetime=?, capacity=?, is_free=?, ticket_price=?, status=? WHERE event_id=?`,
      [data.title, data.summary, data.description, data.category_id, data.venue_id, data.start_datetime,
       data.end_datetime, data.capacity, data.is_free, data.ticket_price, status, toInt(req.params.id)]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Event not found.' });
    res.json({ message: 'Event updated.' });
  } catch (err) { next(err); }
});

// PATCH /api/admin/events/:id/status  - approve / reject / cancel
router.patch('/events/:id/status', async (req, res, next) => {
  try {
    const status = req.body.status;
    if (!['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
      return res.status(422).json({ error: 'Invalid status.' });
    }
    const [r] = await db.query('UPDATE events SET status = ? WHERE event_id = ?', [status, toInt(req.params.id)]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Event not found.' });
    res.json({ message: 'Event marked as ' + status + '.' });
  } catch (err) { next(err); }
});

router.delete('/events/:id', async (req, res, next) => {
  try {
    const [r] = await db.query('DELETE FROM events WHERE event_id = ?', [toInt(req.params.id)]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Event not found.' });
    res.json({ message: 'Event deleted.' });
  } catch (err) { next(err); }
});

// Attendee list for an event
router.get('/events/:id/registrations', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT r.registration_id, r.registered_at, u.user_id, u.full_name, u.student_number, u.email, u.faculty
       FROM registrations r JOIN users u ON u.user_id = r.user_id
       WHERE r.event_id = ? ORDER BY r.registered_at`, [toInt(req.params.id)]);
    res.json({ registrations: rows });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- USERS
router.get('/users', async (req, res, next) => {
  try {
    const q = clean(req.query.q);
    const params = [];
    let where = '';
    if (q) {
      where = 'WHERE u.full_name LIKE ? OR u.email LIKE ? OR u.student_number LIKE ?';
      params.push('%' + q + '%', '%' + q + '%', '%' + q + '%');
    }
    const [rows] = await db.query(
      `SELECT u.user_id, u.full_name, u.student_number, u.email, u.faculty, u.phone, u.role, u.created_at,
              (SELECT COUNT(*) FROM registrations r WHERE r.user_id = u.user_id) AS registrations,
              (SELECT COUNT(*) FROM events e WHERE e.organiser_id = u.user_id) AS events
       FROM users u ${where} ORDER BY u.created_at DESC`, params);
    res.json({ users: rows });
  } catch (err) { next(err); }
});

router.patch('/users/:id/role', async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    const role = req.body.role;
    if (!['student', 'admin'].includes(role)) return res.status(422).json({ error: 'Invalid role.' });
    if (id === req.session.user.user_id) return res.status(400).json({ error: 'You cannot change your own role.' });
    const [r] = await db.query('UPDATE users SET role = ? WHERE user_id = ?', [role, id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: 'Role updated to ' + role + '.' });
  } catch (err) { next(err); }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (id === req.session.user.user_id) return res.status(400).json({ error: 'You cannot delete your own account.' });
    const [r] = await db.query('DELETE FROM users WHERE user_id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: 'User deleted (with their events and registrations).' });
  } catch (err) { next(err); }
});

// ----------------------------------------------------------- CATEGORIES
function validateCategory(body) {
  const data = { name: clean(body.name), description: clean(body.description) || null, colour: clean(body.colour) || '#0B3D91' };
  const errors = {};
  if (!data.name || data.name.length < 2 || data.name.length > 50) errors.name = 'Name must be 2-50 characters.';
  if (!HEX_RE.test(data.colour)) errors.colour = 'Colour must be a hex value like #0B3D91.';
  return { data, errors };
}

router.post('/categories', async (req, res, next) => {
  try {
    const { data, errors } = validateCategory(req.body);
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', errors });
    const [r] = await db.query('INSERT INTO categories (name, description, colour) VALUES (?, ?, ?)',
      [data.name, data.description, data.colour]);
    res.status(201).json({ message: 'Category added.', category_id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That category already exists.' });
    next(err);
  }
});

router.put('/categories/:id', async (req, res, next) => {
  try {
    const { data, errors } = validateCategory(req.body);
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', errors });
    const [r] = await db.query('UPDATE categories SET name=?, description=?, colour=? WHERE category_id=?',
      [data.name, data.description, data.colour, toInt(req.params.id)]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Category not found.' });
    res.json({ message: 'Category updated.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That category already exists.' });
    next(err);
  }
});

router.delete('/categories/:id', async (req, res, next) => {
  try {
    const [r] = await db.query('DELETE FROM categories WHERE category_id = ?', [toInt(req.params.id)]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Category not found.' });
    res.json({ message: 'Category deleted.' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'This category still has events. Move or delete them first.' });
    }
    next(err);
  }
});

// --------------------------------------------------------------- VENUES
function validateVenue(body) {
  const data = { name: clean(body.name), location: clean(body.location) || null, capacity: toInt(body.capacity) };
  const errors = {};
  if (!data.name || data.name.length < 2 || data.name.length > 100) errors.name = 'Name must be 2-100 characters.';
  if (data.capacity !== null && (data.capacity < 1 || data.capacity > 100000)) errors.capacity = 'Capacity must be positive.';
  return { data, errors };
}

router.post('/venues', async (req, res, next) => {
  try {
    const { data, errors } = validateVenue(req.body);
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', errors });
    const [r] = await db.query('INSERT INTO venues (name, location, capacity) VALUES (?, ?, ?)',
      [data.name, data.location, data.capacity]);
    res.status(201).json({ message: 'Venue added.', venue_id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That venue already exists.' });
    next(err);
  }
});

router.put('/venues/:id', async (req, res, next) => {
  try {
    const { data, errors } = validateVenue(req.body);
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', errors });
    const [r] = await db.query('UPDATE venues SET name=?, location=?, capacity=? WHERE venue_id=?',
      [data.name, data.location, data.capacity, toInt(req.params.id)]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Venue not found.' });
    res.json({ message: 'Venue updated.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That venue already exists.' });
    next(err);
  }
});

router.delete('/venues/:id', async (req, res, next) => {
  try {
    const [r] = await db.query('DELETE FROM venues WHERE venue_id = ?', [toInt(req.params.id)]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Venue not found.' });
    res.json({ message: 'Venue deleted.' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'This venue still has events. Move or delete them first.' });
    }
    next(err);
  }
});

// ------------------------------------------------------------- MESSAGES
router.get('/messages', async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM contact_messages ORDER BY is_read, created_at DESC');
    res.json({ messages: rows });
  } catch (err) { next(err); }
});

router.patch('/messages/:id', async (req, res, next) => {
  try {
    const isRead = req.body.is_read ? 1 : 0;
    const [r] = await db.query('UPDATE contact_messages SET is_read = ? WHERE message_id = ?', [isRead, toInt(req.params.id)]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Message not found.' });
    res.json({ message: isRead ? 'Marked as read.' : 'Marked as unread.' });
  } catch (err) { next(err); }
});

router.delete('/messages/:id', async (req, res, next) => {
  try {
    const [r] = await db.query('DELETE FROM contact_messages WHERE message_id = ?', [toInt(req.params.id)]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Message not found.' });
    res.json({ message: 'Message deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
