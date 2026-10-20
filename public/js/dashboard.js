/* CampusPulse | js/dashboard.js
   User dashboard: summary counters, bookings, hosted events, profile & password forms. */
'use strict';

let hostedEvents = [];

document.addEventListener('DOMContentLoaded', async () => {
  const user = await CP.requireUser();
  if (!user) return;

  renderHeader(user);
  initTabs();
  initModal();
  initProfileForms(user);
  loadSummary();
  loadBookings();
  loadHosted();
});

function renderHeader(user) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  document.getElementById('dash-avatar').textContent = CP.initials(user.full_name);
  document.getElementById('dash-greeting').textContent = `${greeting}, ${user.full_name.split(' ')[0]}!`;
  document.getElementById('dash-sub').textContent =
    [user.student_number ? 'Student no. ' + user.student_number : 'Administrator', user.faculty].filter(Boolean).join(' · ');
}

// ---------------- tabs (accessible: arrow keys move between tabs) ----
function initTabs() {
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const activate = tab => {
    tabs.forEach(t => {
      const selected = t === tab;
      t.classList.toggle('active', selected);
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
    });
    history.replaceState(null, '', '#' + tab.id.replace('tab-', ''));
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        next.focus();
        activate(next);
      }
    });
  });
  const fromHash = document.getElementById('tab-' + location.hash.slice(1));
  if (fromHash) activate(fromHash);
}

// ---------------- confirm modal --------------------------------------
let confirmAction = null;
function initModal() {
  const modal = document.getElementById('confirm-modal');
  modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.close()));
  document.getElementById('confirm-yes').addEventListener('click', async () => {
    modal.close();
    if (confirmAction) await confirmAction();
  });
}
function askConfirm(text, action) {
  document.getElementById('confirm-text').textContent = text;
  confirmAction = action;
  document.getElementById('confirm-modal').showModal();
}

// ---------------- data -----------------------------------------------
async function loadSummary() {
  try {
    const s = await CP.api('/api/me/summary');
    document.querySelectorAll('[data-sum]').forEach(el => { el.textContent = s[el.dataset.sum]; });
  } catch (e) { CP.toast(e.message, 'error'); }
}

async function loadBookings() {
  const list = document.getElementById('bookings-list');
  try {
    const { events } = await CP.api('/api/me/registrations');
    document.getElementById('count-bookings').textContent = events.length;
    if (!events.length) {
      list.innerHTML = CP.emptyState("You haven't registered for any events yet.", '<a class="btn btn-primary" href="/events.html">Find an event</a>');
      return;
    }
    list.innerHTML = '';
    events.forEach(ev => {
      const d = CP.parseDate(ev.start_datetime);
      const past = CP.isPast(ev);
      const item = document.createElement('article');
      item.className = 'list-item' + (past ? ' past' : '');
      item.innerHTML = `
        <time class="date-block" datetime="${CP.escapeHtml(ev.start_datetime)}"><span class="day">${d.getDate()}</span><span class="month">${CP.MONTHS[d.getMonth()]}</span></time>
        <div>
          <h3><a href="/event.html?id=${ev.event_id}">${CP.escapeHtml(ev.title)}</a></h3>
          <p>${CP.formatTime(ev.start_datetime)} · ${CP.escapeHtml(ev.venue)} · ${CP.escapeHtml(ev.category)}</p>
        </div>
        <div class="actions flex">${past
          ? '<span class="badge">Attended</span>'
          : `<a class="btn btn-sm btn-outline" href="/event.html?id=${ev.event_id}">View</a>
             <button type="button" class="btn btn-sm btn-ghost" data-cancel="${ev.event_id}">Cancel</button>`}
        </div>`;
      list.appendChild(item);
    });
    list.querySelectorAll('[data-cancel]').forEach(btn => btn.addEventListener('click', () => {
      askConfirm('Cancel your registration? Your seat will be given to someone else.', async () => {
        try {
          const res = await CP.api(`/api/events/${btn.dataset.cancel}/register`, { method: 'DELETE' });
          CP.toast(res.message, 'success');
          loadBookings();
          loadSummary();
        } catch (e) { CP.toast(e.message, 'error'); }
      });
    }));
  } catch (e) {
    list.innerHTML = `<div class="alert alert-error">${CP.escapeHtml(e.message)}</div>`;
  }
}

async function loadHosted() {
  const body = document.getElementById('hosted-body');
  try {
    const { events } = await CP.api('/api/me/events');
    hostedEvents = events;
    document.getElementById('count-hosted').textContent = events.length;
    if (!events.length) {
      body.innerHTML = '<tr><td colspan="5" class="text-center text-muted">You have not hosted any events yet. <a href="/submit-event.html">Host one now</a>.</td></tr>';
      return;
    }
    body.innerHTML = '';
    events.forEach(ev => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><a class="cell-title" href="/event.html?id=${ev.event_id}">${CP.escapeHtml(ev.title)}</a><div class="cell-sub">${CP.escapeHtml(ev.venue)}</div></td>
        <td>${CP.escapeHtml(CP.formatDate(ev.start_datetime))}<div class="cell-sub">${CP.formatTime(ev.start_datetime)}</div></td>
        <td><span class="badge badge-${ev.status}">${ev.status}</span></td>
        <td>${ev.registered} / ${ev.capacity}</td>
        <td><div class="actions">
          <a class="btn btn-sm btn-outline" href="/submit-event.html?edit=${ev.event_id}">Edit</a>
          <button type="button" class="btn btn-sm btn-danger" data-delete="${ev.event_id}">Delete</button>
        </div></td>`;
      body.appendChild(tr);
    });
    body.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', () => {
      const ev = hostedEvents.find(x => String(x.event_id) === btn.dataset.delete);
      askConfirm(`Delete "${ev.title}"? All registrations for it will also be removed.`, async () => {
        try {
          const res = await CP.api('/api/me/events/' + ev.event_id, { method: 'DELETE' });
          CP.toast(res.message, 'success');
          loadHosted();
          loadSummary();
        } catch (e) { CP.toast(e.message, 'error'); }
      });
    }));
  } catch (e) {
    body.innerHTML = `<tr><td colspan="5"><div class="alert alert-error">${CP.escapeHtml(e.message)}</div></td></tr>`;
  }
}

// ---------------- profile & password ---------------------------------
function initProfileForms(user) {
  const pf = document.getElementById('profile-form');
  pf.elements.full_name.value = user.full_name;
  pf.elements.phone.value = user.phone || '';
  pf.elements.faculty.value = user.faculty || '';
  document.getElementById('p-student_number').value = user.student_number || '-';
  document.getElementById('p-email').value = user.email;

  const pv = FormValidator(pf, {
    full_name: [rules.required('Enter your full name.'), rules.minLength(3)],
    phone: [rules.phone()],
    faculty: [rules.required('Select your faculty.')]
  });
  pf.addEventListener('submit', async e => {
    e.preventDefault();
    if (!pv.validateAll()) return;
    await withLoading(pf.querySelector('[type="submit"]'), 'Saving...', async () => {
      try {
        const res = await CP.api('/api/auth/profile', { method: 'PUT', body: formToObject(pf) });
        CP.toast(res.message, 'success');
        renderHeader(res.user);
      } catch (err) { CP.toast(err.message, 'error'); pv.showServerErrors(err.fields); }
    });
  });

  const pwf = document.getElementById('password-form');
  const pwv = FormValidator(pwf, {
    current_password: [rules.required('Enter your current password.')],
    new_password: [rules.required('Enter a new password.'), rules.strongPassword()],
    confirm_new: [rules.required('Confirm the new password.'), rules.matches('new_password', 'Passwords do not match.')]
  });
  pwf.addEventListener('submit', async e => {
    e.preventDefault();
    if (!pwv.validateAll()) return;
    await withLoading(pwf.querySelector('[type="submit"]'), 'Updating...', async () => {
      try {
        const { current_password, new_password } = formToObject(pwf);
        const res = await CP.api('/api/auth/password', { method: 'PUT', body: { current_password, new_password } });
        CP.toast(res.message, 'success');
        pwv.reset();
      } catch (err) { CP.toast(err.message, 'error'); pwv.showServerErrors(err.fields); }
    });
  });
}
