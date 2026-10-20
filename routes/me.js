/**
 * routes/me.js
 * Data for the logged-in user's dashboard.
 * Base path: /api/me   (all routes require login)
 */
const express = require('express');
const db = require('../config/db');
const { requireLogin } = require('../middleware/auth');
const { validateEvent, toInt } = require('../utils/validate');
const { EVENT_SELECT } = require('./events');

const router = express.Router();
router.use(requireLogin);

// GET /api/me/summary - dashboard counters
router.get('/summary', async (req, res, next) => {
  try {
    const uid = req.session.user.user_id;
    const [[row]] = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM registrations r JOIN events e ON e.event_id = r.event_id
            WHERE r.user_id = ? AND e.end_datetime >= NOW()) AS upcoming,
         (SELECT COUNT(*) FROM registrations r JOIN events e ON e.event_id = r.event_id
            WHERE r.user_id = ? AND e.end_datetime < NOW()) AS attended,
         (SELECT COUNT(*) FROM events WHERE organiser_id = ?) AS submitted,
         (SELECT COUNT(*) FROM events WHERE organiser_id = ? AND status = 'pending') AS pending`,
      [uid, uid, uid, uid]);
    res.json(row);
  } catch (err) { next(err); }
});

// GET /api/me/registrations - events I registered for
router.get('/registrations', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `${EVENT_SELECT}
       JOIN registrations reg ON reg.event_id = e.event_id AND reg.user_id = ?
       ORDER BY (e.end_datetime < NOW()), e.start_datetime`, [req.session.user.user_id]);
    res.json({ events: rows });
  } catch (err) { next(err); }
});

// GET /api/me/events - events I submitted
router.get('/events', async (req, res, next) => {
  try {
    const [rows] = await db.query(`${EVENT_SELECT} WHERE e.organiser_id = ? ORDER BY e.created_at DESC`,
      [req.session.user.user_id]);
    res.json({ events: rows });
  } catch (err) { next(err); }
});

// PUT /api/me/events/:id - edit my own event (goes back to pending for review)
router.put('/events/:id', async (req, res, next) => {
  try {
    const id = toInt(req.params.id);
    const [own] = await db.query('SELECT status FROM events WHERE event_id = ? AND organiser_id = ?',
      [id, req.session.user.user_id]);
    if (!own.length) return res.status(404).json({ error: 'Event not found.' });

    const { errors, data } = validateEvent(req.body);
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', errors });

    const status = req.session.user.role === 'admin' ? own[0].status : 'pending';
    await db.query(
      `UPDATE events SET title=?, summary=?, description=?, category_id=?, venue_id=?, start_datetime=?,
         end_datetime=?, capacity=?, is_free=?, ticket_price=?, status=? WHERE event_id=?`,
      [data.title, data.summary, data.description, data.category_id, data.venue_id, data.start_datetime,
       data.end_datetime, data.capacity, data.is_free, data.ticket_price, status, id]);
    res.json({ message: status === 'pending' ? 'Event updated and sent for review.' : 'Event updated.' });
  } catch (err) { next(err); }
});

// DELETE /api/me/events/:id - delete my own event
router.delete('/events/:id', async (req, res, next) => {
  try {
    const [result] = await db.query('DELETE FROM events WHERE event_id = ? AND organiser_id = ?',
      [toInt(req.params.id), req.session.user.user_id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Event not found.' });
    res.json({ message: 'Event deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
