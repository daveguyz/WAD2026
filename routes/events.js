/**
 * routes/events.js
 * Public event listing / details, event submission and event registration (RSVP).
 * Base path: /api/events
 */
const express = require('express');
const db = require('../config/db');
const { requireLogin } = require('../middleware/auth');
const { validateEvent, toInt, clean } = require('../utils/validate');

const router = express.Router();

// Shared SELECT used by listing and details
const EVENT_SELECT = `
  SELECT e.event_id, e.title, e.summary, e.description, e.start_datetime, e.end_datetime,
         e.capacity, e.is_free, e.ticket_price, e.status, e.created_at, e.organiser_id,
         e.category_id, c.name AS category, c.colour AS category_colour,
         e.venue_id, v.name AS venue, v.location AS venue_location,
         u.full_name AS organiser,
         (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.event_id) AS registered
  FROM events e
  JOIN categories c ON c.category_id = e.category_id
  JOIN venues v     ON v.venue_id    = e.venue_id
  JOIN users u      ON u.user_id     = e.organiser_id`;

// GET /api/events  - search, filter, sort and paginate approved events
router.get('/', async (req, res, next) => {
  try {
    const where = ["e.status = 'approved'"];
    const params = [];

    const q = clean(req.query.q);
    if (q) {
      where.push('(e.title LIKE ? OR e.summary LIKE ? OR e.description LIKE ? OR v.name LIKE ?)');
      const like = '%' + q + '%';
      params.push(like, like, like, like);
    }
    const category = toInt(req.query.category);
    if (category) { where.push('e.category_id = ?'); params.push(category); }

    const venue = toInt(req.query.venue);
    if (venue) { where.push('e.venue_id = ?'); params.push(venue); }

    if (req.query.price === 'free') where.push('e.is_free = 1');
    if (req.query.price === 'paid') where.push('e.is_free = 0');

    switch (req.query.when) {
      case 'past':  where.push('e.end_datetime < NOW()'); break;
      case 'week':  where.push('e.end_datetime >= NOW() AND e.start_datetime < NOW() + INTERVAL 7 DAY'); break;
      case 'month': where.push('e.end_datetime >= NOW() AND e.start_datetime < NOW() + INTERVAL 30 DAY'); break;
      case 'all':   break;
      default:      where.push('e.end_datetime >= NOW()');   // upcoming
    }

    const sorts = {
      date_asc: 'e.start_datetime ASC',
      date_desc: 'e.start_datetime DESC',
      popular: 'registered DESC, e.start_datetime ASC',
      title: 'e.title ASC'
    };
    const order = sorts[req.query.sort] || sorts.date_asc;

    const limit = Math.min(Math.max(toInt(req.query.limit) || 9, 1), 50);
    const page = Math.max(toInt(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;

    const whereSql = ' WHERE ' + where.join(' AND ');
    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total FROM events e JOIN venues v ON v.venue_id = e.venue_id ${whereSql}`, params);
    const [rows] = await db.query(
      `${EVENT_SELECT} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);

    const total = countRows[0].total;
    res.json({ events: rows, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
  } catch (err) { next(err); }
});

// GET /api/events/:id  - event details
router.get('/:id', async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid event id.' });

    const [rows] = await db.query(`${EVENT_SELECT} WHERE e.event_id = ?`, [id]);
    const event = rows[0];
    const user = req.session.user;
    // Unapproved events are only visible to their organiser and to admins
    const canSee = event && (event.status === 'approved' ||
      (user && (user.role === 'admin' || user.user_id === event.organiser_id)));
    if (!canSee) return res.status(404).json({ error: 'Event not found.' });

    let isRegistered = false;
    if (user) {
      const [r] = await db.query('SELECT 1 FROM registrations WHERE user_id = ? AND event_id = ?', [user.user_id, id]);
      isRegistered = r.length > 0;
    }
    // Related events: same category, upcoming
    const [related] = await db.query(
      `${EVENT_SELECT} WHERE e.status = 'approved' AND e.category_id = ? AND e.event_id <> ?
       AND e.end_datetime >= NOW() ORDER BY e.start_datetime LIMIT 3`, [event.category_id, id]);

    res.json({ event, isRegistered, related });
  } catch (err) { next(err); }
});

// POST /api/events  - submit a new event (students: pending, admin: approved)
router.post('/', requireLogin, async (req, res, next) => {
  try {
    const { errors, data } = validateEvent(req.body);
    if (Date.parse(req.body.start_datetime) < Date.now()) errors.start_datetime = 'Start must be in the future.';
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', errors });

    const status = req.session.user.role === 'admin' ? 'approved' : 'pending';
    const [result] = await db.query(
      `INSERT INTO events (title, summary, description, category_id, venue_id, organiser_id,
        start_datetime, end_datetime, capacity, is_free, ticket_price, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.title, data.summary, data.description, data.category_id, data.venue_id,
       req.session.user.user_id, data.start_datetime, data.end_datetime, data.capacity,
       data.is_free, data.ticket_price, status]);

    res.status(201).json({
      message: status === 'approved' ? 'Event published.' : 'Event submitted! An administrator will review it shortly.',
      event_id: result.insertId, status
    });
  } catch (err) { next(err); }
});

// POST /api/events/:id/register  - RSVP to an event
router.post('/:id/register', requireLogin, async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    const [rows] = await db.query(
      `SELECT e.event_id, e.capacity, e.status, e.end_datetime < NOW() AS is_past,
              (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.event_id) AS registered
       FROM events e WHERE e.event_id = ?`, [id]);
    const ev = rows[0];
    if (!ev || ev.status !== 'approved') return res.status(404).json({ error: 'Event not found.' });
    if (ev.is_past) return res.status(400).json({ error: 'This event has already ended.' });
    if (ev.registered >= ev.capacity) return res.status(409).json({ error: 'Sorry, this event is fully booked.' });

    try {
      await db.query('INSERT INTO registrations (user_id, event_id) VALUES (?, ?)', [req.session.user.user_id, id]);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'You are already registered for this event.' });
      throw e;
    }
    res.status(201).json({ message: 'You are registered! See you there.' });
  } catch (err) { next(err); }
});

// DELETE /api/events/:id/register  - cancel RSVP
router.delete('/:id/register', requireLogin, async (req, res, next) => {
  try {
    const [result] = await db.query('DELETE FROM registrations WHERE user_id = ? AND event_id = ?',
      [req.session.user.user_id, toInt(req.params.id)]);
    if (!result.affectedRows) return res.status(404).json({ error: 'You were not registered for this event.' });
    res.json({ message: 'Your registration has been cancelled.' });
  } catch (err) { next(err); }
});

module.exports = { router, EVENT_SELECT };
