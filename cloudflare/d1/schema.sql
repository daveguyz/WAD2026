-- =====================================================================
--  CampusPulse  |  cloudflare/d1/schema.sql
--  Same relational design as database/schema.sql, written for
--  Cloudflare D1 (SQLite dialect) so the app can run on Cloudflare.
--
--  MySQL -> SQLite differences handled here:
--    AUTO_INCREMENT      -> INTEGER PRIMARY KEY AUTOINCREMENT
--    ENUM(...)           -> TEXT + CHECK (... IN (...))
--    TIMESTAMP DEFAULT   -> TEXT DEFAULT (datetime('now','+2 hours'))  (Namibia, UTC+2)
--    ON UPDATE CURRENT_TIMESTAMP -> trigger
--  D1 always enforces foreign keys.
-- =====================================================================

DROP VIEW  IF EXISTS v_event_overview;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS contact_messages;
DROP TABLE IF EXISTS registrations;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS venues;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  user_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name       TEXT NOT NULL CHECK (length(full_name) <= 100),
  student_number  TEXT UNIQUE,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  faculty         TEXT,
  phone           TEXT,
  role            TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now','+2 hours'))
);

CREATE TABLE categories (
  category_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE CHECK (length(name) <= 50),
  description   TEXT,
  colour        TEXT NOT NULL DEFAULT '#0B3D91'
);

CREATE TABLE venues (
  venue_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE CHECK (length(name) <= 100),
  location    TEXT,
  capacity    INTEGER CHECK (capacity IS NULL OR capacity > 0)
);

CREATE TABLE events (
  event_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL CHECK (length(title) <= 120),
  summary         TEXT NOT NULL CHECK (length(summary) <= 200),
  description     TEXT NOT NULL,
  category_id     INTEGER NOT NULL REFERENCES categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  venue_id        INTEGER NOT NULL REFERENCES venues(venue_id)        ON UPDATE CASCADE ON DELETE RESTRICT,
  organiser_id    INTEGER NOT NULL REFERENCES users(user_id)          ON UPDATE CASCADE ON DELETE CASCADE,
  start_datetime  TEXT NOT NULL,
  end_datetime    TEXT NOT NULL,
  capacity        INTEGER NOT NULL DEFAULT 50 CHECK (capacity > 0),
  is_free         INTEGER NOT NULL DEFAULT 1 CHECK (is_free IN (0,1)),
  ticket_price    REAL NOT NULL DEFAULT 0 CHECK (ticket_price >= 0),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now','+2 hours')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now','+2 hours')),
  CHECK (end_datetime > start_datetime)
);
CREATE INDEX idx_events_start  ON events (start_datetime);
CREATE INDEX idx_events_status ON events (status);

CREATE TRIGGER trg_events_updated AFTER UPDATE ON events
BEGIN
  UPDATE events SET updated_at = datetime('now','+2 hours') WHERE event_id = NEW.event_id;
END;

CREATE TABLE registrations (
  registration_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(user_id)   ON UPDATE CASCADE ON DELETE CASCADE,
  event_id         INTEGER NOT NULL REFERENCES events(event_id) ON UPDATE CASCADE ON DELETE CASCADE,
  registered_at    TEXT NOT NULL DEFAULT (datetime('now','+2 hours')),
  UNIQUE (user_id, event_id)
);

CREATE TABLE contact_messages (
  message_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  subject      TEXT NOT NULL,
  message      TEXT NOT NULL,
  is_read      INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  created_at   TEXT NOT NULL DEFAULT (datetime('now','+2 hours'))
);

-- Server-side sessions (Workers have no memory between requests)
CREATE TABLE sessions (
  session_id   TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  expires_at   INTEGER NOT NULL            -- unix ms
);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- Brute-force protection for login
CREATE TABLE login_attempts (
  attempt_key  TEXT PRIMARY KEY,           -- ip|email
  count        INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0  -- unix ms
);

CREATE VIEW v_event_overview AS
SELECT  e.event_id, e.title, e.status, e.start_datetime, e.capacity,
        c.name AS category, v.name AS venue, u.full_name AS organiser,
        (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.event_id) AS registered
FROM    events e
JOIN    categories c ON c.category_id = e.category_id
JOIN    venues     v ON v.venue_id    = e.venue_id
JOIN    users      u ON u.user_id     = e.organiser_id;
