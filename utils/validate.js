/**
 * utils/validate.js
 * Server-side validation helpers. Client-side validation improves usability,
 * but the server never trusts the browser, so every input is checked again here.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const STUDENT_NO_RE = /^\d{9}$/;
const PHONE_RE = /^(\+?264|0)\d{8,9}$/;
// min 8 chars, at least one upper, one lower, one digit
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const clean = v => (typeof v === 'string' ? v.trim() : v);

function isValidDate(v) {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}

// Convert '2026-10-20T14:00' (HTML datetime-local) to MySQL '2026-10-20 14:00:00'
function toMysqlDateTime(v) {
  const s = String(v).replace('T', ' ');
  return s.length === 16 ? s + ':00' : s.slice(0, 19);
}

function toInt(v) {
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

/** Validates an event payload. Returns { errors, data } */
function validateEvent(body) {
  const errors = {};
  const data = {
    title: clean(body.title),
    summary: clean(body.summary),
    description: clean(body.description),
    category_id: toInt(body.category_id),
    venue_id: toInt(body.venue_id),
    start_datetime: body.start_datetime,
    end_datetime: body.end_datetime,
    capacity: toInt(body.capacity),
    is_free: body.is_free === true || body.is_free === '1' || body.is_free === 1 || body.is_free === 'true' ? 1 : 0,
    ticket_price: Number(body.ticket_price || 0)
  };

  if (!data.title || data.title.length < 5 || data.title.length > 120) errors.title = 'Title must be 5-120 characters.';
  if (!data.summary || data.summary.length < 10 || data.summary.length > 200) errors.summary = 'Summary must be 10-200 characters.';
  if (!data.description || data.description.length < 20) errors.description = 'Description must be at least 20 characters.';
  if (!data.category_id) errors.category_id = 'Choose a category.';
  if (!data.venue_id) errors.venue_id = 'Choose a venue.';
  if (!isValidDate(data.start_datetime)) errors.start_datetime = 'Enter a valid start date and time.';
  if (!isValidDate(data.end_datetime)) errors.end_datetime = 'Enter a valid end date and time.';
  if (!errors.start_datetime && !errors.end_datetime &&
      Date.parse(data.end_datetime) <= Date.parse(data.start_datetime)) {
    errors.end_datetime = 'End must be after the start.';
  }
  if (!data.capacity || data.capacity < 1 || data.capacity > 5000) errors.capacity = 'Capacity must be between 1 and 5000.';
  if (data.is_free) data.ticket_price = 0;
  else if (Number.isNaN(data.ticket_price) || data.ticket_price <= 0 || data.ticket_price > 10000) {
    errors.ticket_price = 'Enter a ticket price greater than N$0.';
  }

  if (!errors.start_datetime) data.start_datetime = toMysqlDateTime(data.start_datetime);
  if (!errors.end_datetime) data.end_datetime = toMysqlDateTime(data.end_datetime);
  return { errors, data };
}

module.exports = { EMAIL_RE, STUDENT_NO_RE, PHONE_RE, PASSWORD_RE, clean, toInt, validateEvent };
