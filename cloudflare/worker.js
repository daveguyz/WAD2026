/**
 * CampusPulse - NUST Campus Connect
 * cloudflare/worker.js  |  Cloudflare Workers version of the back end
 *
 * Runs the same REST API as server.js (Express + MySQL) but on Cloudflare:
 *   - Cloudflare Workers  -> server-side code
 *   - Cloudflare D1       -> relational database (SQLite dialect)
 *   - Workers Static Assets -> serves the unchanged front end in ../public
 *
 * The front end calls the same /api/... endpoints, so no HTML/CSS/JS changes are needed.
 * Server-side validation is shared with the Express version (../utils/validate.js).
 */
import validate from '../utils/validate.js';

const { EMAIL_RE, STUDENT_NO_RE, PHONE_RE, PASSWORD_RE, clean, toInt, validateEvent } = validate;

// Namibia is UTC+2 all year. Event times are stored as local time strings.
const NOW = "datetime('now','+2 hours')";
const SESSION_MS = 1000 * 60 * 60 * 2;       // 2 hours
const MAX_ATTEMPTS = 5;
const LOCK_MS = 10 * 60 * 1000;
const PBKDF2_ITERATIONS = 100000;
const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// ======================================================================
// HTTP helpers
// ======================================================================
class HttpError extends Error {
  constructor(status, message, errors) { super(message); this.status = status; this.errors = errors; }
}
const fail = (status, message, errors) => { throw new HttpError(status, message, errors); };
const hasErrors = e => Object.keys(e).length > 0;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; " +
    "font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; form-action 'self'; " +
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin'
};
function withSecurity(response) {
  const res = new Response(response.body, response);
  Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

function parseCookies(req) {
  const out = {};
  (req.headers.get('Cookie') || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function sessionCookie(id, maxAgeSec) {
  return `cp.sid=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

// ======================================================================
// Password hashing: PBKDF2-SHA256 via the Web Crypto API (built into Workers)
// Format: pbkdf2$<iterations>$<salt b64>$<hash b64>
// ======================================================================
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}
async function verifyPassword(password, stored) {
  const [scheme, iter, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'pbkdf2') return false;
  const actual = new Uint8Array(await pbkdf2(password, unb64(saltB64), Number(iter)));
  const expected = unb64(hashB64);
  if (actual.length !== expected.length) return false;
  let diff = 0;                                   // constant-time comparison
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
function randomId() {
  return b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]));
}

// ======================================================================
// Database helpers (D1). All queries use ? placeholders (prepared statements).
// ======================================================================
const all = async (db, sql, params = []) => (await db.prepare(sql).bind(...params).all()).results;
const first = (db, sql, params = []) => db.prepare(sql).bind(...params).first();
const run = async (db, sql, params = []) => (await db.prepare(sql).bind(...params).run()).meta;

const isUnique = e => /UNIQUE constraint failed/i.test(e.message || '');
const isForeignKey = e => /FOREIGN KEY constraint failed/i.test(e.message || '');

function publicUser(u) {
  return {
    user_id: u.user_id, full_name: u.full_name, student_number: u.student_number,
    email: u.email, faculty: u.faculty, phone: u.phone, role: u.role, created_at: u.created_at
  };
}

async function loadSession(req, env) {
  const sid = parseCookies(req)['cp.sid'];
  if (!sid) return null;
  const row = await first(env.DB,
    `SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.user_id = s.user_id
     WHERE s.session_id = ? AND s.expires_at > ?`, [sid, Date.now()]);
  if (!row) return null;
  // sliding expiry: extend when less than half the lifetime is left
  if (row.expires_at - Date.now() < SESSION_MS / 2) {
    await run(env.DB, 'UPDATE sessions SET expires_at = ? WHERE session_id = ?', [Date.now() + SESSION_MS, sid]);
  }
  return { id: sid, user: publicUser(row) };
}

async function startSession(env, userId) {
  const id = randomId();                          // new ID on every login (no session fixation)
  await run(env.DB, 'DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);
  await run(env.DB, 'INSERT INTO sessions (session_id, user_id, expires_at) VALUES (?, ?, ?)', [id, userId, Date.now() + SESSION_MS]);
  return sessionCookie(id, SESSION_MS / 1000);
}

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

// ======================================================================
// Route handlers. ctx = { req, env, url, params, body, session, user }
// ======================================================================
const requireLogin = ctx => { if (!ctx.user) fail(401, 'Please log in to continue.'); };
const requireAdmin = ctx => {
  requireLogin(ctx);
  if (ctx.user.role !== 'admin') fail(403, 'Administrator access required.');
};

// ---------------------------------------------------------------- AUTH
async function register({ env, body }) {
  const full_name = clean(body.full_name);
  const student_number = clean(body.student_number);
  const email = clean(body.email || '').toLowerCase();
  const faculty = clean(body.faculty);
  const phone = clean(body.phone) || null;
  const password = body.password || '';
  const errors = {};
  if (!full_name || full_name.length < 3 || full_name.length > 100) errors.full_name = 'Enter your full name (3-100 characters).';
  if (!STUDENT_NO_RE.test(student_number || '')) errors.student_number = 'Student number must be exactly 9 digits.';
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
  if (!faculty) errors.faculty = 'Select your faculty.';
  if (phone && !PHONE_RE.test(phone.replace(/\s/g, ''))) errors.phone = 'Enter a valid Namibian phone number.';
  if (!PASSWORD_RE.test(password)) errors.password = 'Password needs 8+ characters with upper case, lower case and a number.';
  if (password !== (body.confirm_password || '')) errors.confirm_password = 'Passwords do not match.';
  if (hasErrors(errors)) fail(422, 'Please fix the highlighted fields.', errors);

  const existing = await all(env.DB, 'SELECT email, student_number FROM users WHERE email = ? OR student_number = ?', [email, student_number]);
  if (existing.length) {
    const dup = {};
    if (existing.some(r => r.email === email)) dup.email = 'This email is already registered.';
    if (existing.some(r => r.student_number === student_number)) dup.student_number = 'This student number is already registered.';
    fail(409, 'Account already exists.', dup);
  }
  const meta = await run(env.DB,
    `INSERT INTO users (full_name, student_number, email, password_hash, faculty, phone, role) VALUES (?, ?, ?, ?, ?, ?, 'student')`,
    [full_name, student_number, email, await hashPassword(password), faculty, phone]);
  const user = await first(env.DB, 'SELECT * FROM users WHERE user_id = ?', [meta.last_row_id]);
  return json({ message: 'Account created successfully.', user: publicUser(user) }, 201,
    { 'Set-Cookie': await startSession(env, user.user_id) });
}

async function login({ req, env, body }) {
  const email = clean(body.email || '').toLowerCase();
  const password = body.password || '';
  if (!email || !password) fail(422, 'Email and password are required.');

  const key = (req.headers.get('CF-Connecting-IP') || 'local') + '|' + email;
  const attempt = await first(env.DB, 'SELECT * FROM login_attempts WHERE attempt_key = ?', [key]);
  if (attempt && attempt.locked_until > Date.now()) fail(429, 'Too many failed attempts. Try again in 10 minutes.');

  const user = await first(env.DB, 'SELECT * FROM users WHERE email = ?', [email]);
  const ok = user && await verifyPassword(password, user.password_hash);
  if (!ok) {
    const count = (attempt && attempt.locked_until <= Date.now() && attempt.locked_until !== 0 ? 0 : attempt?.count || 0) + 1;
    const locked = count >= MAX_ATTEMPTS ? Date.now() + LOCK_MS : 0;
    await run(env.DB, `INSERT INTO login_attempts (attempt_key, count, locked_until) VALUES (?, ?, ?)
      ON CONFLICT(attempt_key) DO UPDATE SET count = excluded.count, locked_until = excluded.locked_until`, [key, count, locked]);
    fail(401, 'Incorrect email or password.');   // generic: don't reveal whether the email exists
  }
  await run(env.DB, 'DELETE FROM login_attempts WHERE attempt_key = ?', [key]);
  return json({ message: 'Welcome back, ' + user.full_name.split(' ')[0] + '!', user: publicUser(user) }, 200,
    { 'Set-Cookie': await startSession(env, user.user_id) });
}

async function logout({ env, session }) {
  if (session) await run(env.DB, 'DELETE FROM sessions WHERE session_id = ?', [session.id]);
  return json({ message: 'You have been logged out.' }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}

const me = ({ user }) => json({ user: user || null });

async function updateProfile(ctx) {
  requireLogin(ctx);
  const { env, body, user } = ctx;
  const full_name = clean(body.full_name);
  const faculty = clean(body.faculty);
  const phone = clean(body.phone) || null;
  const errors = {};
  if (!full_name || full_name.length < 3) errors.full_name = 'Enter your full name.';
  if (!faculty) errors.faculty = 'Select your faculty.';
  if (phone && !PHONE_RE.test(phone.replace(/\s/g, ''))) errors.phone = 'Enter a valid Namibian phone number.';
  if (hasErrors(errors)) fail(422, 'Please fix the highlighted fields.', errors);
  await run(env.DB, 'UPDATE users SET full_name = ?, faculty = ?, phone = ? WHERE user_id = ?', [full_name, faculty, phone, user.user_id]);
  const row = await first(env.DB, 'SELECT * FROM users WHERE user_id = ?', [user.user_id]);
  return json({ message: 'Profile updated.', user: publicUser(row) });
}

async function changePassword(ctx) {
  requireLogin(ctx);
  const { env, body, user } = ctx;
  if (!PASSWORD_RE.test(body.new_password || '')) {
    fail(422, 'New password needs 8+ characters with upper case, lower case and a number.', { new_password: 'Too weak.' });
  }
  const row = await first(env.DB, 'SELECT password_hash FROM users WHERE user_id = ?', [user.user_id]);
  if (!row || !(await verifyPassword(body.current_password || '', row.password_hash))) {
    fail(401, 'Current password is incorrect.', { current_password: 'Incorrect.' });
  }
  await run(env.DB, 'UPDATE users SET password_hash = ? WHERE user_id = ?', [await hashPassword(body.new_password), user.user_id]);
  // sign out other devices
  await run(env.DB, 'DELETE FROM sessions WHERE user_id = ? AND session_id <> ?', [user.user_id, ctx.session.id]);
  return json({ message: 'Password changed.' });
}

// -------------------------------------------------------------- EVENTS
async function listEvents({ env, url }) {
  const q = url.searchParams;
  const where = ["e.status = 'approved'"];
  const params = [];
  const search = clean(q.get('q'));
  if (search) {
    where.push('(e.title LIKE ? OR e.summary LIKE ? OR e.description LIKE ? OR v.name LIKE ?)');
    const like = '%' + search + '%';
    params.push(like, like, like, like);
  }
  const category = toInt(q.get('category'));
  if (category) { where.push('e.category_id = ?'); params.push(category); }
  const venue = toInt(q.get('venue'));
  if (venue) { where.push('e.venue_id = ?'); params.push(venue); }
  if (q.get('price') === 'free') where.push('e.is_free = 1');
  if (q.get('price') === 'paid') where.push('e.is_free = 0');
  switch (q.get('when')) {
    case 'past': where.push(`e.end_datetime < ${NOW}`); break;
    case 'week': where.push(`e.end_datetime >= ${NOW} AND e.start_datetime < datetime('now','+2 hours','+7 days')`); break;
    case 'month': where.push(`e.end_datetime >= ${NOW} AND e.start_datetime < datetime('now','+2 hours','+30 days')`); break;
    case 'all': break;
    default: where.push(`e.end_datetime >= ${NOW}`);
  }
  const sorts = {
    date_asc: 'e.start_datetime ASC', date_desc: 'e.start_datetime DESC',
    popular: 'registered DESC, e.start_datetime ASC', title: 'e.title ASC'
  };
  const order = sorts[q.get('sort')] || sorts.date_asc;
  const limit = Math.min(Math.max(toInt(q.get('limit')) || 9, 1), 50);
  const page = Math.max(toInt(q.get('page')) || 1, 1);
  const whereSql = ' WHERE ' + where.join(' AND ');

  const countRow = await first(env.DB, `SELECT COUNT(*) AS total FROM events e JOIN venues v ON v.venue_id = e.venue_id ${whereSql}`, params);
  const rows = await all(env.DB, `${EVENT_SELECT} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  const total = countRow.total;
  return json({ events: rows, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
}

async function getEvent({ env, params, user }) {
  const id = toInt(params.id);
  if (!id) fail(400, 'Invalid event id.');
  const event = await first(env.DB, `${EVENT_SELECT} WHERE e.event_id = ?`, [id]);
  const canSee = event && (event.status === 'approved' || (user && (user.role === 'admin' || user.user_id === event.organiser_id)));
  if (!canSee) fail(404, 'Event not found.');
  const isRegistered = user
    ? !!(await first(env.DB, 'SELECT 1 AS x FROM registrations WHERE user_id = ? AND event_id = ?', [user.user_id, id]))
    : false;
  const related = await all(env.DB,
    `${EVENT_SELECT} WHERE e.status = 'approved' AND e.category_id = ? AND e.event_id <> ? AND e.end_datetime >= ${NOW}
     ORDER BY e.start_datetime LIMIT 3`, [event.category_id, id]);
  return json({ event, isRegistered, related });
}

async function createEvent(ctx) {
  requireLogin(ctx);
  const { env, body, user } = ctx;
  const { errors, data } = validateEvent(body);
  if (Date.parse(body.start_datetime) < Date.now()) errors.start_datetime = 'Start must be in the future.';
  if (hasErrors(errors)) fail(422, 'Please fix the highlighted fields.', errors);
  const status = user.role === 'admin' ? 'approved' : 'pending';
  const meta = await run(env.DB,
    `INSERT INTO events (title, summary, description, category_id, venue_id, organiser_id, start_datetime, end_datetime,
       capacity, is_free, ticket_price, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.title, data.summary, data.description, data.category_id, data.venue_id, user.user_id,
     data.start_datetime, data.end_datetime, data.capacity, data.is_free, data.ticket_price, status]);
  return json({
    message: status === 'approved' ? 'Event published.' : 'Event submitted! An administrator will review it shortly.',
    event_id: meta.last_row_id, status
  }, 201);
}

async function registerForEvent(ctx) {
  requireLogin(ctx);
  const { env, params, user } = ctx;
  const id = toInt(params.id);
  const ev = await first(env.DB,
    `SELECT e.event_id, e.capacity, e.status, e.end_datetime < ${NOW} AS is_past,
            (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.event_id) AS registered
     FROM events e WHERE e.event_id = ?`, [id]);
  if (!ev || ev.status !== 'approved') fail(404, 'Event not found.');
  if (ev.is_past) fail(400, 'This event has already ended.');
  if (ev.registered >= ev.capacity) fail(409, 'Sorry, this event is fully booked.');
  try {
    await run(env.DB, 'INSERT INTO registrations (user_id, event_id) VALUES (?, ?)', [user.user_id, id]);
  } catch (e) {
    if (isUnique(e)) fail(409, 'You are already registered for this event.');
    throw e;
  }
  return json({ message: 'You are registered! See you there.' }, 201);
}

async function cancelRegistration(ctx) {
  requireLogin(ctx);
  const meta = await run(ctx.env.DB, 'DELETE FROM registrations WHERE user_id = ? AND event_id = ?', [ctx.user.user_id, toInt(ctx.params.id)]);
  if (!meta.changes) fail(404, 'You were not registered for this event.');
  return json({ message: 'Your registration has been cancelled.' });
}

// ------------------------------------------------------------------ ME
async function mySummary(ctx) {
  requireLogin(ctx);
  const uid = ctx.user.user_id;
  const row = await first(ctx.env.DB,
    `SELECT
       (SELECT COUNT(*) FROM registrations r JOIN events e ON e.event_id = r.event_id WHERE r.user_id = ? AND e.end_datetime >= ${NOW}) AS upcoming,
       (SELECT COUNT(*) FROM registrations r JOIN events e ON e.event_id = r.event_id WHERE r.user_id = ? AND e.end_datetime < ${NOW}) AS attended,
       (SELECT COUNT(*) FROM events WHERE organiser_id = ?) AS submitted,
       (SELECT COUNT(*) FROM events WHERE organiser_id = ? AND status = 'pending') AS pending`, [uid, uid, uid, uid]);
  return json(row);
}

async function myRegistrations(ctx) {
  requireLogin(ctx);
  const rows = await all(ctx.env.DB,
    `${EVENT_SELECT} JOIN registrations reg ON reg.event_id = e.event_id AND reg.user_id = ?
     ORDER BY (e.end_datetime < ${NOW}), e.start_datetime`, [ctx.user.user_id]);
  return json({ events: rows });
}

async function myEvents(ctx) {
  requireLogin(ctx);
  const rows = await all(ctx.env.DB, `${EVENT_SELECT} WHERE e.organiser_id = ? ORDER BY e.created_at DESC, e.event_id DESC`, [ctx.user.user_id]);
  return json({ events: rows });
}

async function updateMyEvent(ctx) {
  requireLogin(ctx);
  const { env, params, body, user } = ctx;
  const id = toInt(params.id);
  const own = await first(env.DB, 'SELECT status FROM events WHERE event_id = ? AND organiser_id = ?', [id, user.user_id]);
  if (!own) fail(404, 'Event not found.');
  const { errors, data } = validateEvent(body);
  if (hasErrors(errors)) fail(422, 'Please fix the highlighted fields.', errors);
  const status = user.role === 'admin' ? own.status : 'pending';
  await run(env.DB,
    `UPDATE events SET title=?, summary=?, description=?, category_id=?, venue_id=?, start_datetime=?, end_datetime=?,
       capacity=?, is_free=?, ticket_price=?, status=? WHERE event_id=?`,
    [data.title, data.summary, data.description, data.category_id, data.venue_id, data.start_datetime, data.end_datetime,
     data.capacity, data.is_free, data.ticket_price, status, id]);
  return json({ message: status === 'pending' ? 'Event updated and sent for review.' : 'Event updated.' });
}

async function deleteMyEvent(ctx) {
  requireLogin(ctx);
  const meta = await run(ctx.env.DB, 'DELETE FROM events WHERE event_id = ? AND organiser_id = ?', [toInt(ctx.params.id), ctx.user.user_id]);
  if (!meta.changes) fail(404, 'Event not found.');
  return json({ message: 'Event deleted.' });
}

// -------------------------------------------------------------- PUBLIC
async function categories({ env }) {
  const rows = await all(env.DB,
    `SELECT c.*, (SELECT COUNT(*) FROM events e WHERE e.category_id = c.category_id
                   AND e.status = 'approved' AND e.end_datetime >= ${NOW}) AS upcoming
     FROM categories c ORDER BY c.name`);
  return json({ categories: rows });
}
const venues = async ({ env }) => json({ venues: await all(env.DB, 'SELECT * FROM venues ORDER BY name') });

async function stats({ env }) {
  return json(await first(env.DB,
    `SELECT (SELECT COUNT(*) FROM events WHERE status='approved' AND end_datetime >= ${NOW}) AS upcoming_events,
            (SELECT COUNT(*) FROM users WHERE role='student') AS students,
            (SELECT COUNT(*) FROM registrations) AS registrations,
            (SELECT COUNT(*) FROM categories) AS categories`));
}

async function contact({ env, body, user }) {
  const name = clean(body.name);
  const email = clean(body.email || '').toLowerCase();
  const subject = clean(body.subject);
  const message = clean(body.message);
  const errors = {};
  if (!name || name.length < 2 || name.length > 100) errors.name = 'Enter your name.';
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
  if (!subject || subject.length > 150) errors.subject = 'Choose or enter a subject.';
  if (!message || message.length < 10 || message.length > 2000) errors.message = 'Message must be 10-2000 characters.';
  if (hasErrors(errors)) fail(422, 'Please fix the highlighted fields.', errors);
  await run(env.DB, 'INSERT INTO contact_messages (user_id, name, email, subject, message) VALUES (?, ?, ?, ?, ?)',
    [user ? user.user_id : null, name, email, subject, message]);
  return json({ message: 'Thank you! Your message has been sent. We reply within 2 working days.' }, 201);
}

async function health({ env }) {
  try { await first(env.DB, 'SELECT 1 AS ok'); return json({ ok: true, db: 'connected' }); }
  catch (e) { return json({ ok: false, db: 'unavailable' }, 500); }
}

// --------------------------------------------------------------- ADMIN
async function adminStats(ctx) {
  requireAdmin(ctx);
  const db = ctx.env.DB;
  const totals = await first(db,
    `SELECT (SELECT COUNT(*) FROM events) AS events,
            (SELECT COUNT(*) FROM events WHERE status='pending') AS pending,
            (SELECT COUNT(*) FROM users) AS users,
            (SELECT COUNT(*) FROM registrations) AS registrations,
            (SELECT COUNT(*) FROM contact_messages WHERE is_read = 0) AS unread`);
  const byCategory = await all(db,
    `SELECT c.name, c.colour, COUNT(e.event_id) AS total FROM categories c
     LEFT JOIN events e ON e.category_id = c.category_id GROUP BY c.category_id ORDER BY total DESC, c.name`);
  const top = await all(db, 'SELECT event_id, title, registered, capacity FROM v_event_overview ORDER BY registered DESC LIMIT 5');
  return json({ totals, byCategory, top });
}

async function adminEvents(ctx) {
  requireAdmin(ctx);
  const q = ctx.url.searchParams;
  const where = [];
  const params = [];
  if (STATUSES.includes(q.get('status'))) { where.push('e.status = ?'); params.push(q.get('status')); }
  const search = clean(q.get('q'));
  if (search) { where.push('(e.title LIKE ? OR u.full_name LIKE ?)'); params.push('%' + search + '%', '%' + search + '%'); }
  const rows = await all(ctx.env.DB,
    `${EVENT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY CASE e.status WHEN 'pending' THEN 1 WHEN 'approved' THEN 2 WHEN 'rejected' THEN 3 ELSE 4 END,
              e.start_datetime DESC`, params);
  return json({ events: rows });
}

async function adminSaveEvent(ctx) {
  requireAdmin(ctx);
  const { env, body, params, user } = ctx;
  const { errors, data } = validateEvent(body);
  const status = STATUSES.includes(body.status) ? body.status : 'approved';
  if (hasErrors(errors)) fail(422, 'Please fix the highlighted fields.', errors);
  if (params.id) {
    const meta = await run(env.DB,
      `UPDATE events SET title=?, summary=?, description=?, category_id=?, venue_id=?, start_datetime=?, end_datetime=?,
         capacity=?, is_free=?, ticket_price=?, status=? WHERE event_id=?`,
      [data.title, data.summary, data.description, data.category_id, data.venue_id, data.start_datetime, data.end_datetime,
       data.capacity, data.is_free, data.ticket_price, status, toInt(params.id)]);
    if (!meta.changes) fail(404, 'Event not found.');
    return json({ message: 'Event updated.' });
  }
  const meta = await run(env.DB,
    `INSERT INTO events (title, summary, description, category_id, venue_id, organiser_id, start_datetime, end_datetime,
       capacity, is_free, ticket_price, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [data.title, data.summary, data.description, data.category_id, data.venue_id, user.user_id, data.start_datetime,
     data.end_datetime, data.capacity, data.is_free, data.ticket_price, status]);
  return json({ message: 'Event created.', event_id: meta.last_row_id }, 201);
}

async function adminEventStatus(ctx) {
  requireAdmin(ctx);
  const status = ctx.body.status;
  if (!STATUSES.includes(status)) fail(422, 'Invalid status.');
  const meta = await run(ctx.env.DB, 'UPDATE events SET status = ? WHERE event_id = ?', [status, toInt(ctx.params.id)]);
  if (!meta.changes) fail(404, 'Event not found.');
  return json({ message: 'Event marked as ' + status + '.' });
}

async function adminDeleteEvent(ctx) {
  requireAdmin(ctx);
  const meta = await run(ctx.env.DB, 'DELETE FROM events WHERE event_id = ?', [toInt(ctx.params.id)]);
  if (!meta.changes) fail(404, 'Event not found.');
  return json({ message: 'Event deleted.' });
}

async function adminEventRegistrations(ctx) {
  requireAdmin(ctx);
  const rows = await all(ctx.env.DB,
    `SELECT r.registration_id, r.registered_at, u.user_id, u.full_name, u.student_number, u.email, u.faculty
     FROM registrations r JOIN users u ON u.user_id = r.user_id WHERE r.event_id = ? ORDER BY r.registered_at`, [toInt(ctx.params.id)]);
  return json({ registrations: rows });
}

async function adminUsers(ctx) {
  requireAdmin(ctx);
  const search = clean(ctx.url.searchParams.get('q'));
  const params = [];
  let where = '';
  if (search) {
    where = 'WHERE u.full_name LIKE ? OR u.email LIKE ? OR u.student_number LIKE ?';
    params.push('%' + search + '%', '%' + search + '%', '%' + search + '%');
  }
  const rows = await all(ctx.env.DB,
    `SELECT u.user_id, u.full_name, u.student_number, u.email, u.faculty, u.phone, u.role, u.created_at,
            (SELECT COUNT(*) FROM registrations r WHERE r.user_id = u.user_id) AS registrations,
            (SELECT COUNT(*) FROM events e WHERE e.organiser_id = u.user_id) AS events
     FROM users u ${where} ORDER BY u.created_at DESC, u.user_id DESC`, params);
  return json({ users: rows });
}

async function adminUserRole(ctx) {
  requireAdmin(ctx);
  const id = toInt(ctx.params.id);
  const role = ctx.body.role;
  if (!['student', 'admin'].includes(role)) fail(422, 'Invalid role.');
  if (id === ctx.user.user_id) fail(400, 'You cannot change your own role.');
  const meta = await run(ctx.env.DB, 'UPDATE users SET role = ? WHERE user_id = ?', [role, id]);
  if (!meta.changes) fail(404, 'User not found.');
  return json({ message: 'Role updated to ' + role + '.' });
}

async function adminDeleteUser(ctx) {
  requireAdmin(ctx);
  const id = toInt(ctx.params.id);
  if (id === ctx.user.user_id) fail(400, 'You cannot delete your own account.');
  const meta = await run(ctx.env.DB, 'DELETE FROM users WHERE user_id = ?', [id]);
  if (!meta.changes) fail(404, 'User not found.');
  return json({ message: 'User deleted (with their events and registrations).' });
}

function lookupCrud(table, idCol, label, validator, columns) {
  const placeholders = columns.map(() => '?').join(', ');
  const sets = columns.map(c => `${c} = ?`).join(', ');
  return {
    async create(ctx) {
      requireAdmin(ctx);
      const { data, errors } = validator(ctx.body);
      if (hasErrors(errors)) fail(422, 'Please fix the highlighted fields.', errors);
      try {
        const meta = await run(ctx.env.DB, `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, columns.map(c => data[c]));
        return json({ message: `${label} added.`, [idCol]: meta.last_row_id }, 201);
      } catch (e) { if (isUnique(e)) fail(409, `That ${label.toLowerCase()} already exists.`); throw e; }
    },
    async update(ctx) {
      requireAdmin(ctx);
      const { data, errors } = validator(ctx.body);
      if (hasErrors(errors)) fail(422, 'Please fix the highlighted fields.', errors);
      try {
        const meta = await run(ctx.env.DB, `UPDATE ${table} SET ${sets} WHERE ${idCol} = ?`, [...columns.map(c => data[c]), toInt(ctx.params.id)]);
        if (!meta.changes) fail(404, `${label} not found.`);
        return json({ message: `${label} updated.` });
      } catch (e) { if (isUnique(e)) fail(409, `That ${label.toLowerCase()} already exists.`); throw e; }
    },
    async remove(ctx) {
      requireAdmin(ctx);
      try {
        const meta = await run(ctx.env.DB, `DELETE FROM ${table} WHERE ${idCol} = ?`, [toInt(ctx.params.id)]);
        if (!meta.changes) fail(404, `${label} not found.`);
        return json({ message: `${label} deleted.` });
      } catch (e) {
        if (isForeignKey(e)) fail(409, `This ${label.toLowerCase()} still has events. Move or delete them first.`);
        throw e;
      }
    }
  };
}

const categoryCrud = lookupCrud('categories', 'category_id', 'Category', body => {
  const data = { name: clean(body.name), description: clean(body.description) || null, colour: clean(body.colour) || '#0B3D91' };
  const errors = {};
  if (!data.name || data.name.length < 2 || data.name.length > 50) errors.name = 'Name must be 2-50 characters.';
  if (!HEX_RE.test(data.colour)) errors.colour = 'Colour must be a hex value like #0B3D91.';
  return { data, errors };
}, ['name', 'description', 'colour']);

const venueCrud = lookupCrud('venues', 'venue_id', 'Venue', body => {
  const data = { name: clean(body.name), location: clean(body.location) || null, capacity: toInt(body.capacity) };
  const errors = {};
  if (!data.name || data.name.length < 2 || data.name.length > 100) errors.name = 'Name must be 2-100 characters.';
  if (data.capacity !== null && (data.capacity < 1 || data.capacity > 100000)) errors.capacity = 'Capacity must be positive.';
  return { data, errors };
}, ['name', 'location', 'capacity']);

async function adminMessages(ctx) {
  requireAdmin(ctx);
  return json({ messages: await all(ctx.env.DB, 'SELECT * FROM contact_messages ORDER BY is_read, created_at DESC, message_id DESC') });
}
async function adminMessageRead(ctx) {
  requireAdmin(ctx);
  const isRead = ctx.body.is_read ? 1 : 0;
  const meta = await run(ctx.env.DB, 'UPDATE contact_messages SET is_read = ? WHERE message_id = ?', [isRead, toInt(ctx.params.id)]);
  if (!meta.changes) fail(404, 'Message not found.');
  return json({ message: isRead ? 'Marked as read.' : 'Marked as unread.' });
}
async function adminDeleteMessage(ctx) {
  requireAdmin(ctx);
  const meta = await run(ctx.env.DB, 'DELETE FROM contact_messages WHERE message_id = ?', [toInt(ctx.params.id)]);
  if (!meta.changes) fail(404, 'Message not found.');
  return json({ message: 'Message deleted.' });
}

// ======================================================================
// Router
// ======================================================================
const ROUTES = [
  ['POST', '/api/auth/register', register],
  ['POST', '/api/auth/login', login],
  ['POST', '/api/auth/logout', logout],
  ['GET', '/api/auth/me', me],
  ['PUT', '/api/auth/profile', updateProfile],
  ['PUT', '/api/auth/password', changePassword],

  ['GET', '/api/events', listEvents],
  ['POST', '/api/events', createEvent],
  ['GET', '/api/events/:id', getEvent],
  ['POST', '/api/events/:id/register', registerForEvent],
  ['DELETE', '/api/events/:id/register', cancelRegistration],

  ['GET', '/api/me/summary', mySummary],
  ['GET', '/api/me/registrations', myRegistrations],
  ['GET', '/api/me/events', myEvents],
  ['PUT', '/api/me/events/:id', updateMyEvent],
  ['DELETE', '/api/me/events/:id', deleteMyEvent],

  ['GET', '/api/categories', categories],
  ['GET', '/api/venues', venues],
  ['GET', '/api/stats', stats],
  ['POST', '/api/contact', contact],
  ['GET', '/api/health', health],

  ['GET', '/api/admin/stats', adminStats],
  ['GET', '/api/admin/events', adminEvents],
  ['POST', '/api/admin/events', adminSaveEvent],
  ['PUT', '/api/admin/events/:id', adminSaveEvent],
  ['PATCH', '/api/admin/events/:id/status', adminEventStatus],
  ['DELETE', '/api/admin/events/:id', adminDeleteEvent],
  ['GET', '/api/admin/events/:id/registrations', adminEventRegistrations],
  ['GET', '/api/admin/users', adminUsers],
  ['PATCH', '/api/admin/users/:id/role', adminUserRole],
  ['DELETE', '/api/admin/users/:id', adminDeleteUser],
  ['POST', '/api/admin/categories', categoryCrud.create],
  ['PUT', '/api/admin/categories/:id', categoryCrud.update],
  ['DELETE', '/api/admin/categories/:id', categoryCrud.remove],
  ['POST', '/api/admin/venues', venueCrud.create],
  ['PUT', '/api/admin/venues/:id', venueCrud.update],
  ['DELETE', '/api/admin/venues/:id', venueCrud.remove],
  ['GET', '/api/admin/messages', adminMessages],
  ['PATCH', '/api/admin/messages/:id', adminMessageRead],
  ['DELETE', '/api/admin/messages/:id', adminDeleteMessage]
].map(([method, path, handler]) => ({
  method,
  handler,
  regex: new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '/?$')
}));

async function handleApi(req, env, url) {
  try {
    // CSRF defence-in-depth: state-changing requests with a body must be JSON
    const ct = req.headers.get('Content-Type') || '';
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && ct && !ct.includes('application/json')) {
      return json({ error: 'Requests must be sent as JSON.' }, 415);
    }
    let params = null;
    let pathMatched = false;
    const route = ROUTES.find(r => {
      const m = url.pathname.match(r.regex);
      if (m) pathMatched = true;
      if (m && r.method === req.method) { params = m.groups || {}; return true; }
      return false;
    });
    if (!route) return json({ error: pathMatched ? 'Method not allowed.' : 'API endpoint not found.' }, pathMatched ? 405 : 404);

    let body = {};
    if (ct.includes('application/json')) {
      const text = await req.text();
      if (text.length > 50 * 1024) return json({ error: 'Request too large.' }, 413);
      if (text) {
        try { body = JSON.parse(text); } catch (e) { return json({ error: 'Malformed JSON.' }, 400); }
      }
      if (typeof body !== 'object' || body === null) body = {};
    }
    const session = await loadSession(req, env);
    return await route.handler({ req, env, url, params, body, session, user: session ? session.user : null });
  } catch (err) {
    if (err instanceof HttpError) {
      return json(err.errors ? { error: err.message, errors: err.errors } : { error: err.message }, err.status);
    }
    console.error('[error]', err.message);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}

// Pages that need a logged-in user (checked on the server before the HTML is sent)
const PROTECTED_PAGES = { '/dashboard.html': 'student', '/submit-event.html': 'student' };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) return withSecurity(await handleApi(req, env, url));

    // Directory URLs -> index.html  (/ and /admin/)
    if (url.pathname === '/admin') return Response.redirect(url.origin + '/admin/', 302);
    let assetPath = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;

    const needsAdmin = assetPath.startsWith('/admin/');
    const needsLogin = needsAdmin || PROTECTED_PAGES[assetPath];
    if (needsLogin) {
      const session = await loadSession(req, env);
      if (!session) return Response.redirect(url.origin + '/login.html?next=' + encodeURIComponent(url.pathname), 302);
      if (needsAdmin && session.user.role !== 'admin') return Response.redirect(url.origin + '/dashboard.html', 302);
    }

    const assetUrl = new URL(assetPath + url.search, url.origin);
    let res = await env.ASSETS.fetch(new Request(assetUrl, req));
    if (res.status === 404) {
      const notFound = await env.ASSETS.fetch(new Request(new URL('/404.html', url.origin), req));
      res = new Response(notFound.body, { status: 404, headers: notFound.headers });
    }
    return withSecurity(res);
  }
};
