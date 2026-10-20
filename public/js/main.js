/* =====================================================================
   CampusPulse  |  js/main.js
   Shared JavaScript loaded on every page:
   - API helper (fetch wrapper)
   - session / auth state and header rendering
   - mobile navigation toggle
   - toast notifications
   - formatting helpers and the reusable event-card renderer
   ===================================================================== */
'use strict';

const CP = (function () {
  // ---------- constants & state -------------------------------------
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let currentUser = null;          // object | null
  let userReady = null;            // Promise resolved once /api/auth/me returns

  // Inline SVG icons (decorative, aria-hidden)
  const ICONS = {
    calendar: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    clock: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    pin: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    user: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    users: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    tag: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/></svg>',
    ticket: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z"/><path d="M13 7v12" stroke-dasharray="2 2"/></svg>'
  };

  // ---------- helpers ------------------------------------------------
  /** Escape text before inserting into HTML (prevents XSS). */
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Parse 'YYYY-MM-DD HH:MM:SS' from MySQL as local time. */
  function parseDate(str) {
    if (!str) return null;
    const [d, t = '00:00:00'] = String(str).split(/[ T]/);
    const [y, m, day] = d.split('-').map(Number);
    const [h, min] = t.split(':').map(Number);
    return new Date(y, m - 1, day, h, min);
  }

  const pad = n => String(n).padStart(2, '0');

  function formatDate(str) {
    const d = parseDate(str);
    return d ? `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
  }
  function formatTime(str) {
    const d = parseDate(str);
    return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
  }
  function formatDateTime(str) { return `${formatDate(str)} · ${formatTime(str)}`; }
  function formatPrice(isFree, price) {
    return Number(isFree) ? 'Free' : 'N$ ' + Number(price).toFixed(2);
  }
  /** For <input type="datetime-local"> */
  function toInputDateTime(str) {
    const d = parseDate(str);
    return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
  }
  function initials(name) {
    return String(name || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  }
  function isPast(event) { return parseDate(event.end_datetime) < new Date(); }

  function getParam(name) { return new URLSearchParams(window.location.search).get(name); }

  function debounce(fn, wait = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
  }

  // ---------- API ----------------------------------------------------
  /**
   * Fetch wrapper: sends/receives JSON, includes the session cookie,
   * throws an Error carrying the server's message and field errors.
   */
  async function api(url, { method = 'GET', body } = {}) {
    const options = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, options);
    } catch (e) {
      throw Object.assign(new Error('Network error - is the server running?'), { status: 0 });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed (' + res.status + ')');
      err.status = res.status;
      err.fields = data.errors || {};
      throw err;
    }
    return data;
  }

  // ---------- toast notifications -----------------------------------
  function toast(message, type = 'info', ms = 3500) {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.setAttribute('role', 'status');
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 300); }, ms);
  }

  // ---------- auth / header -----------------------------------------
  async function loadUser() {
    try {
      const data = await api('/api/auth/me');
      currentUser = data.user;
    } catch (e) {
      currentUser = null;
    }
    renderAuthArea();
    return currentUser;
  }

  function renderAuthArea() {
    const area = document.getElementById('nav-auth');
    if (!area) return;
    area.innerHTML = '';
    if (currentUser) {
      const adminLink = currentUser.role === 'admin'
        ? '<a class="btn btn-ghost btn-sm" href="/admin/index.html">Admin</a>' : '';
      area.innerHTML = `
        ${adminLink}
        <a class="nav-user" href="/dashboard.html" title="My dashboard">
          <span class="avatar">${escapeHtml(initials(currentUser.full_name))}</span>
          <span class="name">${escapeHtml(currentUser.full_name.split(' ')[0])}</span>
        </a>
        <button type="button" class="btn btn-outline btn-sm" id="logout-btn">Log out</button>`;
      document.getElementById('logout-btn').addEventListener('click', logout);
    } else {
      area.innerHTML = `
        <a class="btn btn-ghost btn-sm" href="/login.html">Log in</a>
        <a class="btn btn-primary btn-sm" href="/register.html">Sign up</a>`;
    }
    // Show/hide elements that depend on login state
    document.querySelectorAll('[data-auth="in"]').forEach(el => el.classList.toggle('hidden', !currentUser));
    document.querySelectorAll('[data-auth="out"]').forEach(el => el.classList.toggle('hidden', !!currentUser));
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      toast('You have been logged out.', 'success');
      setTimeout(() => { window.location.href = '/index.html'; }, 500);
    } catch (e) { toast(e.message, 'error'); }
  }

  /** Redirect to login if no session (client-side; the server also protects pages). */
  async function requireUser() {
    const user = await userReady;
    if (!user) window.location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search);
    return user;
  }

  // ---------- navigation --------------------------------------------
  function initNav() {
    const header = document.querySelector('.site-header');
    const toggle = document.querySelector('.nav-toggle');
    if (toggle && header) {
      toggle.addEventListener('click', () => {
        const open = header.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', String(open));
      });
    }
    // Highlight the current page in the nav
    const path = location.pathname === '/' ? '/index.html' : location.pathname;
    document.querySelectorAll('.main-nav a').forEach(a => {
      if (a.getAttribute('href') === path) {
        a.classList.add('active');
        a.setAttribute('aria-current', 'page');
      }
    });
    // Current year in footer
    document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
  }

  // ---------- event card renderer -----------------------------------
  function eventCard(ev) {
    const d = parseDate(ev.start_datetime);
    const reg = Number(ev.registered) || 0;
    const cap = Number(ev.capacity) || 1;
    const pct = Math.min(100, Math.round((reg / cap) * 100));
    const full = reg >= cap;
    const article = document.createElement('article');
    article.className = 'event-card';
    article.style.setProperty('--cat', ev.category_colour || '#0b2a5b');
    article.innerHTML = `
      <div class="banner">
        <time class="date-block" datetime="${escapeHtml(ev.start_datetime)}">
          <span class="day">${d.getDate()}</span>
          <span class="month">${MONTHS[d.getMonth()]}</span>
        </time>
        <span class="badge badge-category">${escapeHtml(ev.category)}</span>
      </div>
      <div class="body">
        <h3><a href="/event.html?id=${ev.event_id}">${escapeHtml(ev.title)}</a></h3>
        <ul class="meta">
          <li>${ICONS.clock}${escapeHtml(formatDate(ev.start_datetime))}, ${formatTime(ev.start_datetime)}</li>
          <li>${ICONS.pin}${escapeHtml(ev.venue)}</li>
        </ul>
        <p class="summary">${escapeHtml(ev.summary)}</p>
        <div>
          <div class="flex-between text-small"><span>${reg} / ${cap} going</span><span>${full ? 'Fully booked' : pct + '%'}</span></div>
          <div class="progress${full ? ' full' : ''}"><span></span></div>
        </div>
      </div>
      <div class="foot">
        <span class="price${Number(ev.is_free) ? '' : ' paid'}">${formatPrice(ev.is_free, ev.ticket_price)}</span>
        <a class="btn btn-sm btn-outline" href="/event.html?id=${ev.event_id}">View details</a>
      </div>`;
    article.querySelector('.progress span').style.width = pct + '%';
    return article;
  }

  function emptyState(message, actionHtml = '') {
    return `<div class="empty-state">
      <img src="/images/empty.svg" alt="" width="160" height="120">
      <p>${escapeHtml(message)}</p>${actionHtml}</div>`;
  }

  // ---------- boot ---------------------------------------------------
  document.addEventListener('DOMContentLoaded', initNav);
  userReady = loadUser();

  return {
    api, toast, escapeHtml, parseDate, formatDate, formatTime, formatDateTime, formatPrice,
    toInputDateTime, initials, isPast, getParam, debounce, eventCard, emptyState, requireUser,
    ICONS, MONTHS,
    get user() { return currentUser; },
    ready: () => userReady
  };
})();
