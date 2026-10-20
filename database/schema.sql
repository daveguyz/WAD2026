-- =====================================================================
--  CampusPulse  |  NUST Campus Connect - Events & Clubs Hub
--  WAD621S Group Project 2026
--  File: database/schema.sql
--  Purpose: Creates the relational database and all tables.
--  DBMS: MySQL 8.x / MariaDB 10.4+ (e.g. XAMPP)
-- =====================================================================

DROP DATABASE IF EXISTS campuspulse;
CREATE DATABASE campuspulse
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE campuspulse;

-- ---------------------------------------------------------------------
-- 1. USERS  - students and administrators
-- ---------------------------------------------------------------------
CREATE TABLE users (
  user_id         INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  full_name       VARCHAR(100)     NOT NULL,
  student_number  VARCHAR(12)      NULL,
  email           VARCHAR(150)     NOT NULL,
  password_hash   VARCHAR(255)     NOT NULL,
  faculty         VARCHAR(100)     NULL,
  phone           VARCHAR(20)      NULL,
  role            ENUM('student','admin') NOT NULL DEFAULT 'student',
  created_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_users PRIMARY KEY (user_id),
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT uq_users_student_number UNIQUE (student_number)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. CATEGORIES  - type of event (Academic, Sports, Clubs ...)
-- ---------------------------------------------------------------------
CREATE TABLE categories (
  category_id   INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  name          VARCHAR(50)    NOT NULL,
  description   VARCHAR(255)   NULL,
  colour        CHAR(7)        NOT NULL DEFAULT '#0B3D91',
  CONSTRAINT pk_categories PRIMARY KEY (category_id),
  CONSTRAINT uq_categories_name UNIQUE (name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. VENUES  - places on / around NUST campus
-- ---------------------------------------------------------------------
CREATE TABLE venues (
  venue_id    INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100)   NOT NULL,
  location    VARCHAR(150)   NULL,
  capacity    INT UNSIGNED   NULL,
  CONSTRAINT pk_venues PRIMARY KEY (venue_id),
  CONSTRAINT uq_venues_name UNIQUE (name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. EVENTS  - core entity. Students submit (pending), admin approves.
-- ---------------------------------------------------------------------
CREATE TABLE events (
  event_id        INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  title           VARCHAR(120)   NOT NULL,
  summary         VARCHAR(200)   NOT NULL,
  description     TEXT           NOT NULL,
  category_id     INT UNSIGNED   NOT NULL,
  venue_id        INT UNSIGNED   NOT NULL,
  organiser_id    INT UNSIGNED   NOT NULL,
  start_datetime  DATETIME       NOT NULL,
  end_datetime    DATETIME       NOT NULL,
  capacity        INT UNSIGNED   NOT NULL DEFAULT 50,
  is_free         TINYINT(1)     NOT NULL DEFAULT 1,
  ticket_price    DECIMAL(8,2)   NOT NULL DEFAULT 0.00,
  status          ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT pk_events PRIMARY KEY (event_id),
  CONSTRAINT fk_events_category  FOREIGN KEY (category_id)  REFERENCES categories(category_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_events_venue     FOREIGN KEY (venue_id)     REFERENCES venues(venue_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_events_organiser FOREIGN KEY (organiser_id) REFERENCES users(user_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_events_dates CHECK (end_datetime > start_datetime),
  CONSTRAINT chk_events_price CHECK (ticket_price >= 0)
) ENGINE=InnoDB;

CREATE INDEX idx_events_start  ON events (start_datetime);
CREATE INDEX idx_events_status ON events (status);

-- ---------------------------------------------------------------------
-- 5. REGISTRATIONS  - associative entity (M:N between users and events)
-- ---------------------------------------------------------------------
CREATE TABLE registrations (
  registration_id  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED  NOT NULL,
  event_id         INT UNSIGNED  NOT NULL,
  registered_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_registrations PRIMARY KEY (registration_id),
  CONSTRAINT uq_registrations_user_event UNIQUE (user_id, event_id),
  CONSTRAINT fk_reg_user  FOREIGN KEY (user_id)  REFERENCES users(user_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_reg_event FOREIGN KEY (event_id) REFERENCES events(event_id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. CONTACT_MESSAGES  - submitted through the Contact page
-- ---------------------------------------------------------------------
CREATE TABLE contact_messages (
  message_id   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED  NULL,
  name         VARCHAR(100)  NOT NULL,
  email        VARCHAR(150)  NOT NULL,
  subject      VARCHAR(150)  NOT NULL,
  message      TEXT          NOT NULL,
  is_read      TINYINT(1)    NOT NULL DEFAULT 0,
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_contact_messages PRIMARY KEY (message_id),
  CONSTRAINT fk_msg_user FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Helpful view: events with names and live registration counts
-- ---------------------------------------------------------------------
CREATE VIEW v_event_overview AS
SELECT  e.event_id, e.title, e.status, e.start_datetime, e.capacity,
        c.name  AS category, v.name AS venue, u.full_name AS organiser,
        (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.event_id) AS registered
FROM    events e
JOIN    categories c ON c.category_id = e.category_id
JOIN    venues     v ON v.venue_id    = e.venue_id
JOIN    users      u ON u.user_id     = e.organiser_id;
