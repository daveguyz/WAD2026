# CampusPulse – NUST Campus Connect

**WAD621S Web Application Development – Group Project 2026**

CampusPulse is a dynamic web application that solves a real problem for NUST students: campus events (club meetings, workshops, career fairs, sports, cultural days) are advertised across scattered WhatsApp groups, posters and emails, so students miss them and organisers can't tell how many people will attend. CampusPulse centralises every event in one place where students can **discover, register for, and host** events, while Student Affairs administrators **moderate and manage** all data.

---

## 1. Tech stack

| Layer | Technology |
|---|---|
| Client side | Semantic HTML5, external CSS3 (Flexbox, Grid, media queries – **no Bootstrap**), vanilla JavaScript (ES2020) |
| Server side | Node.js 18+ with Express 4 (REST API + static file server) |
| Database | MySQL 8 / MariaDB 10.4+ (relational, InnoDB, foreign keys) |
| Security | bcrypt password hashing, express-session (HttpOnly cookies), Helmet security headers / CSP, prepared statements |

---

## 2. Running the project (Windows + XAMPP)

1. **Install** [Node.js LTS](https://nodejs.org) and [XAMPP](https://www.apachefriends.org).
2. Open the XAMPP Control Panel and **start MySQL**.
3. Open a terminal in this project folder and install dependencies:
   ```bash
   npm install
   ```
4. Create your environment file:
   ```bash
   copy .env.example .env        # Windows
   cp .env.example .env          # macOS / Linux
   ```
   XAMPP's default is user `root` with an empty password, which `.env.example` already uses.
5. **Create the database** and sample data (runs `database/schema.sql` then `database/seed.sql`):
   ```bash
   npm run setup-db
   ```
   *Alternative:* open phpMyAdmin → Import → `database/schema.sql`, then import `database/seed.sql`.
6. **Start the server:**
   ```bash
   npm start
   ```
7. Open **http://localhost:3000**

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@nust.na` | `Admin@123` |
| Student | `200000@nust.na` | `Student@123` |
| Student | `200001@nust.na` | `Student@123` |

Seed event dates are relative to the day you run `npm run setup-db`, so the demo always has upcoming events. Re-run it before the presentation to reset all data.

---

## 3. Project structure

```
campuspulse/
├── server.js               # Express app: security, sessions, page guards, routes, errors
├── package.json
├── .env.example            # configuration template
├── config/db.js            # MySQL connection pool
├── middleware/auth.js      # requireLogin / requireAdmin / protectPage
├── utils/validate.js       # server-side validation helpers
├── routes/
│   ├── auth.js             # register, login, logout, me, profile, password
│   ├── events.js           # list/search/filter, details, create, RSVP
│   ├── me.js               # dashboard data, edit/delete own events
│   ├── public.js           # categories, venues, stats, contact form
│   └── admin.js            # admin CRUD: events, users, categories, venues, messages
├── database/
│   ├── schema.sql          # CREATE DATABASE + all tables, constraints, indexes, view
│   ├── seed.sql            # sample data
│   └── setup.js            # npm run setup-db
├── public/                 # client side (served statically)
│   ├── index.html          # Home
│   ├── about.html          # About / information + team + FAQ
│   ├── events.html         # Data listing + search & filtering
│   ├── event.html          # Details page + register/cancel
│   ├── register.html       # Registration page
│   ├── login.html          # Login page
│   ├── dashboard.html      # User dashboard (bookings, my events, profile)
│   ├── submit-event.html   # Data-entry form (create / edit event)
│   ├── contact.html        # Contact page + form
│   ├── 404.html
│   ├── admin/index.html    # Administration panel
│   ├── css/style.css       # main stylesheet
│   ├── css/admin.css       # admin layout
│   ├── js/                 # main.js, validation.js + one script per page
│   └── images/             # logo and illustrations (SVG)
└── docs/
    ├── ERD.svg / ERD.png   # entity relationship diagram
    ├── wireframes/         # low-fidelity wireframes (SVG + PNG)
    └── screenshots/        # screenshots of the running system
```

---

## 4. How the requirements are met

### User-interface pages
| Required | Page |
|---|---|
| Home page | `index.html` – hero search, live stats, upcoming events, categories, how-it-works |
| About / Information | `about.html` – problem, solution, values, team table, FAQ (`<details>`) |
| Registration | `register.html` – live validation, password strength meter, student-email auto-fill |
| Login | `login.html` – "remember my email", redirect back to the requested page |
| User dashboard | `dashboard.html` – summary cards, bookings, hosted events, profile & password forms |
| Data listing | `events.html` – grid / table views, pagination |
| Details page | `event.html` – full info, live countdown, seats bar, register / cancel, related events |
| Search / filtering | keyword search (debounced), category, venue, date range, price, sort, category chips; filters kept in the URL |
| Data-entry form | `submit-event.html` – host an event (also edit mode) |
| Contact | `contact.html` – contact details, office hours table, message form stored in DB |
| **Admin section** | `admin/index.html` – stats + chart; approve / reject / add / edit / delete events; view attendees; manage users (role, delete); CRUD categories and venues; read / delete contact messages |

### HTML
Semantic elements (`header`, `nav`, `main`, `section`, `article`, `aside`, `footer`, `figure`, `address`, `time`, `details`, `dialog`, `template`), heading hierarchy, ordered/unordered lists, links, images with `alt`, accessible tables (`caption`, `thead`, `scope`), forms with `fieldset`/`legend`/`label`, and many control types (text, email, tel, password, number, datetime-local, search, select, textarea, radio, checkbox, color, hidden). ARIA attributes for tabs, live regions, and the mobile menu; a skip link.

### CSS
Single external stylesheet organised in sections; CSS custom properties (design tokens); element, class, ID, attribute, pseudo-class (`:hover`, `:focus-visible`, `:nth-child`), pseudo-element (`::before`, `::after`, `::backdrop`) and combinator selectors; box model (stat cards); Flexbox (nav, cards, toolbars); CSS Grid (layouts, card grids, admin layout); transitions and keyframe animations; three breakpoints (1024px, 860px, 600px) plus a print stylesheet.

### JavaScript
Variables, data types, arrays (`map`, `filter`, `forEach`, `find`), objects, functions/closures (module pattern), DOM creation and manipulation, event handling (click, input, change, submit, blur, keydown), reusable form validation library, async `fetch` with error handling, debouncing, `requestAnimationFrame` counters, `setInterval` countdown, URL parameters, `history.replaceState`, `<template>` cloning, `<dialog>` modals, `localStorage` (email only) and the Clipboard API.

### Server side
Form processing (JSON), server-side validation, database communication through a connection pool, authentication with sessions, and full **CRUD**: retrieval (`SELECT` with `JOIN`s, sub-queries, filters, pagination), insertion, updating and deletion.

---

## 5. Database design (summary)

Six tables in third normal form – see `docs/ERD.png`.

* **users** – students and admins (`role` ENUM). Unique email and student number.
* **categories**, **venues** – lookup tables so names are stored once.
* **events** – core entity; FKs to category, venue and organiser (user). `status` drives the moderation workflow (pending → approved / rejected / cancelled). `CHECK` constraints ensure end > start and price ≥ 0.
* **registrations** – associative entity resolving the many-to-many between users and events. `UNIQUE(user_id, event_id)` stops double booking.
* **contact_messages** – optional FK to users (`ON DELETE SET NULL`).
* View **v_event_overview** for reporting; indexes on `start_datetime` and `status`.

Referential actions: deleting a user cascades to their events and registrations; categories/venues use `RESTRICT` so they cannot be deleted while events still use them.

---

## 6. Security implementation

| Threat | Mitigation |
|---|---|
| Password theft | bcrypt hashing (cost 10); hashes never sent to the client |
| SQL injection | every query uses `?` placeholders (prepared statements) |
| XSS | user content inserted with `textContent` or `escapeHtml()`; strict Content-Security-Policy (no inline scripts) via Helmet |
| Session hijacking | HttpOnly, SameSite=Lax cookies, `secure` in production, 2-hour expiry, session ID regenerated at login (prevents fixation) |
| CSRF | SameSite cookies + API only accepts `application/json` bodies |
| Brute-force login | lockout for 10 minutes after 5 failed attempts per IP + email; generic error message |
| Broken access control | `requireLogin` / `requireAdmin` on every API route; `protectPage` guards dashboard and admin HTML **on the server**; users can only edit/delete their own events; admins can't demote/delete themselves |
| Invalid data | validation on both client and server; DB constraints (UNIQUE, FK, CHECK, ENUM) |
| Open redirect | login `next` parameter must be a same-site path |
| Information leakage | central error handler logs details server-side, returns generic messages |

---

## 7. REST API overview

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | public |
| GET | `/api/auth/me` | public |
| PUT | `/api/auth/profile`, `/api/auth/password` | logged in |
| GET | `/api/events?q=&category=&venue=&when=&price=&sort=&page=` | public |
| GET | `/api/events/:id` | public (approved) / owner / admin |
| POST | `/api/events` | logged in |
| POST / DELETE | `/api/events/:id/register` | logged in |
| GET | `/api/me/summary`, `/api/me/registrations`, `/api/me/events` | logged in |
| PUT / DELETE | `/api/me/events/:id` | owner |
| GET | `/api/categories`, `/api/venues`, `/api/stats` | public |
| POST | `/api/contact` | public |
| GET | `/api/admin/stats`, `/api/admin/events`, `/api/admin/users`, `/api/admin/messages` | admin |
| POST / PUT / DELETE | `/api/admin/events[/:id]`, `/api/admin/categories[/:id]`, `/api/admin/venues[/:id]` | admin |
| PATCH | `/api/admin/events/:id/status`, `/api/admin/users/:id/role`, `/api/admin/messages/:id` | admin |
| DELETE | `/api/admin/users/:id`, `/api/admin/messages/:id` | admin |

---

## 8. Team

| Name | Student number | Role |
|---|---|---|
| Dawid /Howoseb | [Student No.] | Team lead & back end |
| [Member name] | [Student No.] | Front end (HTML/CSS) |
| [Member name] | [Student No.] | JavaScript & UI |
| [Member name] | [Student No.] | Database & testing |
