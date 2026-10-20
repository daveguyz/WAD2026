/* CampusPulse | js/event.js
   Details page: loads one event, fills the <template>, live countdown, register / cancel. */
'use strict';

let current = null;       // { event, isRegistered, related }
let countdownTimer = null;

document.addEventListener('DOMContentLoaded', loadEvent);

async function loadEvent() {
  const root = document.getElementById('event-root');
  const id = CP.getParam('id');
  if (!id || !/^\d+$/.test(id)) {
    root.innerHTML = '<div class="container section">' + CP.emptyState('No event selected.', '<a class="btn btn-primary" href="/events.html">Browse events</a>') + '</div>';
    return;
  }
  try {
    await CP.ready();                         // know who is logged in first
    current = await CP.api('/api/events/' + id);
    render();
  } catch (e) {
    root.innerHTML = '<div class="container section">' +
      CP.emptyState(e.status === 404 ? 'Sorry, this event does not exist or is not published yet.' : e.message,
        '<a class="btn btn-primary" href="/events.html">Browse events</a>') + '</div>';
  }
}

function render() {
  const { event: ev, related } = current;
  const root = document.getElementById('event-root');
  const tpl = document.getElementById('event-template').content.cloneNode(true);
  const set = (field, text) => tpl.querySelectorAll(`[data-field="${field}"]`).forEach(el => { el.textContent = text; });

  document.title = ev.title + ' | CampusPulse';
  set('crumb', ev.title);
  set('category', ev.category);
  set('category-name', ev.category);
  set('title', ev.title);
  set('summary', ev.summary);
  set('description', ev.description);
  set('organiser', ev.organiser);
  set('org-initials', CP.initials(ev.organiser));
  set('date', CP.formatDate(ev.start_datetime));
  set('time', `${CP.formatTime(ev.start_datetime)} - ${CP.formatTime(ev.end_datetime)}`);
  set('venue', ev.venue);
  set('venue-location', ev.venue_location || '');
  set('price', CP.formatPrice(ev.is_free, ev.ticket_price));

  const status = tpl.querySelector('[data-field="status"]');
  if (ev.status === 'approved') status.remove();
  else { status.textContent = ev.status; status.classList.add('badge-' + ev.status); }

  // Icons for the info list
  tpl.querySelectorAll('[data-icon]').forEach(li => li.insertAdjacentHTML('afterbegin', CP.ICONS[li.dataset.icon]));

  tpl.querySelector('.event-hero').style.setProperty('--cat', ev.category_colour);
  tpl.querySelector('.badge-category').style.setProperty('--cat', 'rgba(255,255,255,0.2)');

  root.innerHTML = '';
  root.appendChild(tpl);

  updateSeats();
  renderRegisterArea();
  startCountdown();

  // Related events
  const relatedGrid = document.getElementById('related-grid');
  if (related.length) related.slice(0, 2).forEach(r => relatedGrid.appendChild(CP.eventCard(r)));
  else document.getElementById('related-wrap').remove();

  document.getElementById('share-btn').addEventListener('click', copyLink);
}

function updateSeats() {
  const ev = current.event;
  const reg = Number(ev.registered);
  const cap = Number(ev.capacity);
  const left = Math.max(cap - reg, 0);
  document.querySelector('[data-field="seats"]').textContent = `${reg} registered · ${left} seat${left === 1 ? '' : 's'} left`;
  const bar = document.querySelector('[data-field="progress"]');
  bar.style.width = Math.min(100, (reg / cap) * 100) + '%';
  bar.parentElement.classList.toggle('full', left === 0);
}

function renderRegisterArea() {
  const area = document.getElementById('register-area');
  const ev = current.event;
  const user = CP.user;
  const full = Number(ev.registered) >= Number(ev.capacity);
  area.innerHTML = '';

  if (CP.isPast(ev)) {
    area.innerHTML = '<div class="alert alert-info">This event has ended.</div>';
  } else if (ev.status !== 'approved') {
    area.innerHTML = `<div class="alert alert-info">This event is <strong>${CP.escapeHtml(ev.status)}</strong> and not open for registration yet.</div>`;
  } else if (!user) {
    area.innerHTML = `<a class="btn btn-primary btn-block" href="/login.html?next=${encodeURIComponent(location.pathname + location.search)}">Log in to register</a>
      <p class="text-small text-muted text-center mt-1">No account? <a href="/register.html">Sign up free</a></p>`;
  } else if (current.isRegistered) {
    area.innerHTML = `<div class="alert alert-success">You're registered for this event.</div>
      <button type="button" class="btn btn-outline btn-block" id="cancel-btn">Cancel registration</button>`;
    document.getElementById('cancel-btn').addEventListener('click', cancelRegistration);
  } else if (full) {
    area.innerHTML = '<button type="button" class="btn btn-block" disabled>Fully booked</button>';
  } else {
    area.innerHTML = '<button type="button" class="btn btn-accent btn-block" id="register-btn">Register for this event</button>';
    document.getElementById('register-btn').addEventListener('click', register);
  }
}

async function register(e) {
  await withLoadingBtn(e.target, 'Registering...', async () => {
    const res = await CP.api(`/api/events/${current.event.event_id}/register`, { method: 'POST' });
    current.isRegistered = true;
    current.event.registered = Number(current.event.registered) + 1;
    CP.toast(res.message, 'success');
  });
}

async function cancelRegistration(e) {
  if (!window.confirm('Cancel your registration for this event?')) return;
  await withLoadingBtn(e.target, 'Cancelling...', async () => {
    const res = await CP.api(`/api/events/${current.event.event_id}/register`, { method: 'DELETE' });
    current.isRegistered = false;
    current.event.registered = Math.max(Number(current.event.registered) - 1, 0);
    CP.toast(res.message, 'success');
  });
}

async function withLoadingBtn(btn, label, task) {
  btn.disabled = true;
  btn.textContent = label;
  try { await task(); } catch (err) { CP.toast(err.message, 'error'); }
  updateSeats();
  renderRegisterArea();
}

function startCountdown() {
  const box = document.getElementById('countdown');
  const start = CP.parseDate(current.event.start_datetime);
  clearInterval(countdownTimer);
  const tick = () => {
    const diff = start - new Date();
    if (diff <= 0) { box.remove(); clearInterval(countdownTimer); return; }
    const parts = {
      d: Math.floor(diff / 86400000),
      h: Math.floor(diff / 3600000) % 24,
      m: Math.floor(diff / 60000) % 60,
      s: Math.floor(diff / 1000) % 60
    };
    Object.entries(parts).forEach(([k, v]) => { box.querySelector(`[data-cd="${k}"]`).textContent = v; });
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.href);
    CP.toast('Link copied - share it with your friends!', 'success');
  } catch (e) {
    CP.toast('Copy this link: ' + location.href);
  }
}
