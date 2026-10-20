/* =====================================================================
   CampusPulse | js/admin.js
   Administration panel: overview stats, events CRUD + approval,
   users (role / delete), categories CRUD, venues CRUD, contact inbox.
   ===================================================================== */
'use strict';

const Admin = {
  categories: [],
  venues: [],
  events: [],
  users: [],
  confirmAction: null
};

const SECTION_TITLES = {
  overview: 'Overview', events: 'Manage events', users: 'Manage users',
  categories: 'Categories', venues: 'Venues', messages: 'Contact messages'
};

document.addEventListener('DOMContentLoaded', async () => {
  const user = await CP.ready();
  if (!user || user.role !== 'admin') { window.location.href = '/login.html?next=/admin/index.html'; return; }

  document.getElementById('admin-name').textContent = user.full_name;
  document.getElementById('admin-avatar').textContent = CP.initials(user.full_name);
  document.getElementById('admin-logout').addEventListener('click', async () => {
    await CP.api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/index.html';
  });

  initNavigation();
  initModals();
  initEventForm();
  initCategoryForm();
  initVenueForm();

  document.getElementById('events-search').addEventListener('input', CP.debounce(loadEvents, 300));
  document.getElementById('events-status').addEventListener('change', loadEvents);
  document.getElementById('users-search').addEventListener('input', CP.debounce(loadUsers, 300));

  await loadLookups();
  showSection(location.hash.slice(1) || 'overview');
});

// ------------------------------------------------------------ navigation
function initNavigation() {
  document.querySelectorAll('[data-section]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      if (link.dataset.status) document.getElementById('events-status').value = link.dataset.status;
      showSection(link.dataset.section);
      document.getElementById('admin-sidebar').classList.remove('open');
    });
  });
  const menuBtn = document.getElementById('admin-menu-btn');
  menuBtn.addEventListener('click', () => {
    const open = document.getElementById('admin-sidebar').classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
}

function showSection(name) {
  if (!SECTION_TITLES[name]) name = 'overview';
  document.querySelectorAll('.admin-section').forEach(s => { s.hidden = s.id !== 'section-' + name; });
  document.querySelectorAll('.admin-sidebar [data-section]').forEach(a => a.classList.toggle('active', a.dataset.section === name));
  document.getElementById('section-title').textContent = SECTION_TITLES[name];
  history.replaceState(null, '', '#' + name);
  const loaders = { overview: loadOverview, events: loadEvents, users: loadUsers, categories: loadCategories, venues: loadVenues, messages: loadMessages };
  loaders[name]();
}

// ---------------------------------------------------------------- modals
function initModals() {
  document.querySelectorAll('dialog.modal').forEach(d => {
    d.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => d.close()));
    d.addEventListener('click', e => { if (e.target === d) d.close(); }); // click backdrop to close
  });
  document.getElementById('confirm-yes').addEventListener('click', async () => {
    document.getElementById('confirm-modal').close();
    if (Admin.confirmAction) await Admin.confirmAction();
  });
}

function confirmDelete(text, action) {
  document.getElementById('confirm-text').textContent = text;
  Admin.confirmAction = action;
  document.getElementById('confirm-modal').showModal();
}

async function run(promise, after) {
  try {
    const res = await promise;
    CP.toast(res.message, 'success');
    if (after) await after();
    refreshPills();
    return true;
  } catch (e) {
    CP.toast(e.message, 'error');
    return false;
  }
}

// --------------------------------------------------------------- lookups
async function loadLookups() {
  const [{ categories }, { venues }] = await Promise.all([CP.api('/api/categories'), CP.api('/api/venues')]);
  Admin.categories = categories;
  Admin.venues = venues;
  const catSel = document.getElementById('ae-category');
  const venSel = document.getElementById('ae-venue');
  catSel.innerHTML = '<option value="">Choose...</option>';
  venSel.innerHTML = '<option value="">Choose...</option>';
  categories.forEach(c => catSel.add(new Option(c.name, c.category_id)));
  venues.forEach(v => venSel.add(new Option(v.name, v.venue_id)));
}

async function refreshPills() {
  try {
    const { totals } = await CP.api('/api/admin/stats');
    setPill('pending-pill', totals.pending);
    setPill('unread-pill', totals.unread);
  } catch (e) { /* ignore */ }
}
function setPill(id, n) {
  const pill = document.getElementById(id);
  pill.textContent = n;
  pill.hidden = Number(n) === 0;
}

// -------------------------------------------------------------- overview
async function loadOverview() {
  try {
    const { totals, byCategory, top } = await CP.api('/api/admin/stats');
    document.querySelectorAll('[data-total]').forEach(el => { el.textContent = totals[el.dataset.total]; });
    setPill('pending-pill', totals.pending);
    setPill('unread-pill', totals.unread);

    // Bar chart (pure CSS + DOM)
    const max = Math.max(...byCategory.map(c => c.total), 1);
    const bars = document.getElementById('category-bars');
    bars.innerHTML = '';
    byCategory.forEach(c => {
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML = `<span>${CP.escapeHtml(c.name)}</span><div class="bar-track"><div class="bar-fill"></div></div><strong>${c.total}</strong>`;
      const fill = row.querySelector('.bar-fill');
      fill.style.setProperty('--cat', c.colour);
      fill.style.width = '0%';
      bars.appendChild(row);
      requestAnimationFrame(() => { fill.style.width = (c.total / max) * 100 + '%'; });
    });

    const topList = document.getElementById('top-events');
    topList.innerHTML = top.map(t =>
      `<li><a href="/event.html?id=${t.event_id}">${CP.escapeHtml(t.title)}</a><br><span>${t.registered} of ${t.capacity} seats booked</span></li>`).join('');

    const { events } = await CP.api('/api/admin/events?status=pending');
    const pending = document.getElementById('pending-list');
    pending.innerHTML = events.length ? '' : '<p class="text-muted mb-0">Nothing waiting. Nice work!</p>';
    events.slice(0, 5).forEach(ev => {
      const row = document.createElement('div');
      row.className = 'list-item';
      const d = CP.parseDate(ev.start_datetime);
      row.innerHTML = `
        <time class="date-block"><span class="day">${d.getDate()}</span><span class="month">${CP.MONTHS[d.getMonth()]}</span></time>
        <div><h3><a href="/event.html?id=${ev.event_id}">${CP.escapeHtml(ev.title)}</a></h3><p>by ${CP.escapeHtml(ev.organiser)} · ${CP.escapeHtml(ev.category)}</p></div>
        <div class="actions flex">
          <button class="btn btn-sm btn-success" type="button" data-approve>Approve</button>
          <button class="btn btn-sm btn-outline" type="button" data-reject>Reject</button>
        </div>`;
      row.querySelector('[data-approve]').addEventListener('click', () => setStatus(ev.event_id, 'approved', loadOverview));
      row.querySelector('[data-reject]').addEventListener('click', () => setStatus(ev.event_id, 'rejected', loadOverview));
      pending.appendChild(row);
    });
  } catch (e) { CP.toast(e.message, 'error'); }
}

// ---------------------------------------------------------------- events
async function loadEvents() {
  const body = document.getElementById('events-body');
  const params = new URLSearchParams();
  const q = document.getElementById('events-search').value.trim();
  const status = document.getElementById('events-status').value;
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  try {
    const { events } = await CP.api('/api/admin/events?' + params);
    Admin.events = events;
    body.innerHTML = events.length ? '' : '<tr><td colspan="6" class="text-center text-muted">No events found.</td></tr>';
    events.forEach(ev => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><a class="cell-title" href="/event.html?id=${ev.event_id}">${CP.escapeHtml(ev.title)}</a><div class="cell-sub">by ${CP.escapeHtml(ev.organiser)}</div></td>
        <td>${CP.escapeHtml(CP.formatDate(ev.start_datetime))}<div class="cell-sub">${CP.formatTime(ev.start_datetime)} · ${CP.escapeHtml(ev.venue)}</div></td>
        <td><span class="badge badge-category">${CP.escapeHtml(ev.category)}</span></td>
        <td><button type="button" class="btn btn-sm btn-ghost" data-act="attendees">${ev.registered} / ${ev.capacity}</button></td>
        <td><span class="badge badge-${ev.status}">${ev.status}</span></td>
        <td><div class="actions">
          ${ev.status !== 'approved' ? '<button type="button" class="btn btn-sm btn-success" data-act="approve">Approve</button>' : ''}
          ${ev.status === 'pending' ? '<button type="button" class="btn btn-sm btn-outline" data-act="reject">Reject</button>' : ''}
          <button type="button" class="btn btn-sm btn-outline" data-act="edit">Edit</button>
          <button type="button" class="btn btn-sm btn-danger" data-act="delete">Delete</button>
        </div></td>`;
      tr.querySelector('.badge-category').style.setProperty('--cat', ev.category_colour);
      tr.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => eventAction(btn.dataset.act, ev)));
      body.appendChild(tr);
    });
  } catch (e) {
    body.innerHTML = `<tr><td colspan="6"><div class="alert alert-error">${CP.escapeHtml(e.message)}</div></td></tr>`;
  }
}

function eventAction(action, ev) {
  switch (action) {
    case 'approve': return setStatus(ev.event_id, 'approved', loadEvents);
    case 'reject': return setStatus(ev.event_id, 'rejected', loadEvents);
    case 'edit': return openEventModal(ev);
    case 'attendees': return showAttendees(ev);
    case 'delete':
      return confirmDelete(`Delete "${ev.title}" and its ${ev.registered} registration(s)? This cannot be undone.`,
        () => run(CP.api('/api/admin/events/' + ev.event_id, { method: 'DELETE' }), loadEvents));
    default: return null;
  }
}

function setStatus(id, status, after) {
  return run(CP.api(`/api/admin/events/${id}/status`, { method: 'PATCH', body: { status } }), after);
}

async function showAttendees(ev) {
  const modal = document.getElementById('attendees-modal');
  const body = document.getElementById('attendees-body');
  document.getElementById('attendees-title').textContent = 'Attendees: ' + ev.title;
  body.innerHTML = '<div class="loader"></div>';
  modal.showModal();
  try {
    const { registrations } = await CP.api(`/api/admin/events/${ev.event_id}/registrations`);
    if (!registrations.length) { body.innerHTML = '<p class="text-muted">No one has registered yet.</p>'; return; }
    body.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th scope="col">#</th><th scope="col">Name</th><th scope="col">Student no.</th><th scope="col">Email</th><th scope="col">Registered</th></tr></thead>
      <tbody>${registrations.map((r, i) => `<tr><td>${i + 1}</td><td>${CP.escapeHtml(r.full_name)}</td><td>${CP.escapeHtml(r.student_number || '-')}</td>
        <td>${CP.escapeHtml(r.email)}</td><td>${CP.escapeHtml(CP.formatDate(r.registered_at))}</td></tr>`).join('')}</tbody></table></div>
      <p class="text-small text-muted mt-1">${registrations.length} attendee(s)</p>`;
  } catch (e) { body.innerHTML = `<div class="alert alert-error">${CP.escapeHtml(e.message)}</div>`; }
}

let eventValidator;
function initEventForm() {
  const form = document.getElementById('admin-event-form');
  eventValidator = FormValidator(form, {
    title: [rules.required(), rules.minLength(5)],
    summary: [rules.required(), rules.minLength(10)],
    description: [rules.required(), rules.minLength(20)],
    category_id: [rules.required('Choose a category.')],
    venue_id: [rules.required('Choose a venue.')],
    start_datetime: [rules.required()],
    end_datetime: [rules.required(), rules.after('start_datetime')],
    capacity: [rules.required(), rules.number(1, 5000)],
    ticket_price: [rules.number(0, 10000)]
  });
  document.getElementById('add-event-btn').addEventListener('click', () => openEventModal(null));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!eventValidator.validateAll()) return;
    const data = formToObject(form);
    data.ticket_price = Number(data.ticket_price) || 0;
    data.is_free = data.ticket_price === 0;
    const id = data.event_id;
    delete data.event_id;
    try {
      const res = id
        ? await CP.api('/api/admin/events/' + id, { method: 'PUT', body: data })
        : await CP.api('/api/admin/events', { method: 'POST', body: data });
      CP.toast(res.message, 'success');
      document.getElementById('event-modal').close();
      loadEvents();
      refreshPills();
    } catch (err) {
      CP.toast(err.message, 'error');
      eventValidator.showServerErrors(err.fields);
    }
  });
}

function openEventModal(ev) {
  const form = document.getElementById('admin-event-form');
  eventValidator.reset();
  document.getElementById('event-modal-title').textContent = ev ? 'Edit event' : 'Add event';
  form.elements.event_id.value = ev ? ev.event_id : '';
  if (ev) {
    form.elements.title.value = ev.title;
    form.elements.summary.value = ev.summary;
    form.elements.description.value = ev.description;
    form.elements.category_id.value = ev.category_id;
    form.elements.venue_id.value = ev.venue_id;
    form.elements.start_datetime.value = CP.toInputDateTime(ev.start_datetime);
    form.elements.end_datetime.value = CP.toInputDateTime(ev.end_datetime);
    form.elements.capacity.value = ev.capacity;
    form.elements.ticket_price.value = Number(ev.is_free) ? 0 : ev.ticket_price;
    form.elements.status.value = ev.status;
  } else {
    form.elements.capacity.value = 50;
    form.elements.ticket_price.value = 0;
    form.elements.status.value = 'approved';
  }
  document.getElementById('event-modal').showModal();
}

// ----------------------------------------------------------------- users
async function loadUsers() {
  const body = document.getElementById('users-body');
  const q = document.getElementById('users-search').value.trim();
  try {
    const { users } = await CP.api('/api/admin/users' + (q ? '?q=' + encodeURIComponent(q) : ''));
    Admin.users = users;
    body.innerHTML = users.length ? '' : '<tr><td colspan="6" class="text-center text-muted">No users found.</td></tr>';
    users.forEach(u => {
      const isMe = u.user_id === CP.user.user_id;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><div class="flex-center"><span class="avatar">${CP.escapeHtml(CP.initials(u.full_name))}</span>
          <div><div class="cell-title">${CP.escapeHtml(u.full_name)}${isMe ? ' (you)' : ''}</div><div class="cell-sub">${CP.escapeHtml(u.email)}</div></div></div></td>
        <td>${CP.escapeHtml(u.student_number || '-')}</td>
        <td>${CP.escapeHtml(u.faculty || '-')}</td>
        <td><span class="cell-sub">${u.registrations} bookings · ${u.events} events</span></td>
        <td>
          <label class="visually-hidden" for="role-${u.user_id}">Role for ${CP.escapeHtml(u.full_name)}</label>
          <select id="role-${u.user_id}" ${isMe ? 'disabled' : ''}>
            <option value="student"${u.role === 'student' ? ' selected' : ''}>Student</option>
            <option value="admin"${u.role === 'admin' ? ' selected' : ''}>Admin</option>
          </select>
        </td>
        <td>${isMe ? '' : '<button type="button" class="btn btn-sm btn-danger">Delete</button>'}</td>`;
      if (!isMe) {
        tr.querySelector('select').addEventListener('change', e =>
          run(CP.api(`/api/admin/users/${u.user_id}/role`, { method: 'PATCH', body: { role: e.target.value } }), loadUsers));
        tr.querySelector('.btn-danger').addEventListener('click', () =>
          confirmDelete(`Delete ${u.full_name}? Their ${u.events} event(s) and ${u.registrations} booking(s) will also be removed.`,
            () => run(CP.api('/api/admin/users/' + u.user_id, { method: 'DELETE' }), loadUsers)));
      }
      body.appendChild(tr);
    });
  } catch (e) {
    body.innerHTML = `<tr><td colspan="6"><div class="alert alert-error">${CP.escapeHtml(e.message)}</div></td></tr>`;
  }
}

// ------------------------------------------------------------ categories
async function loadCategories() {
  const body = document.getElementById('categories-body');
  try {
    await loadLookups();
    body.innerHTML = '';
    Admin.categories.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="colour-swatch" title="${CP.escapeHtml(c.colour)}"></span></td>
        <td class="cell-title">${CP.escapeHtml(c.name)}</td>
        <td>${CP.escapeHtml(c.description || '')}</td>
        <td>${c.upcoming}</td>
        <td><div class="actions"><button type="button" class="btn btn-sm btn-outline" data-edit>Edit</button>
          <button type="button" class="btn btn-sm btn-danger" data-del>Delete</button></div></td>`;
      tr.querySelector('.colour-swatch').style.setProperty('--cat', c.colour);
      tr.querySelector('[data-edit]').addEventListener('click', () => openCategoryModal(c));
      tr.querySelector('[data-del]').addEventListener('click', () => confirmDelete(`Delete category "${c.name}"?`,
        () => run(CP.api('/api/admin/categories/' + c.category_id, { method: 'DELETE' }), loadCategories)));
      body.appendChild(tr);
    });
  } catch (e) { CP.toast(e.message, 'error'); }
}

let categoryValidator;
function initCategoryForm() {
  const form = document.getElementById('category-form');
  categoryValidator = FormValidator(form, { name: [rules.required('Enter a name.'), rules.minLength(2), rules.maxLength(50)] });
  document.getElementById('add-category-btn').addEventListener('click', () => openCategoryModal(null));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!categoryValidator.validateAll()) return;
    const data = formToObject(form);
    const id = data.category_id;
    delete data.category_id;
    const ok = await run(id
      ? CP.api('/api/admin/categories/' + id, { method: 'PUT', body: data })
      : CP.api('/api/admin/categories', { method: 'POST', body: data }), loadCategories);
    if (ok) document.getElementById('category-modal').close();
  });
}
function openCategoryModal(c) {
  const form = document.getElementById('category-form');
  categoryValidator.reset();
  document.getElementById('category-modal-title').textContent = c ? 'Edit category' : 'Add category';
  form.elements.category_id.value = c ? c.category_id : '';
  form.elements.name.value = c ? c.name : '';
  form.elements.description.value = c ? c.description || '' : '';
  form.elements.colour.value = c ? c.colour.toLowerCase() : '#0b3d91';
  document.getElementById('category-modal').showModal();
}

// ---------------------------------------------------------------- venues
async function loadVenues() {
  const body = document.getElementById('venues-body');
  try {
    await loadLookups();
    body.innerHTML = '';
    Admin.venues.forEach(v => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="cell-title">${CP.escapeHtml(v.name)}</td>
        <td>${CP.escapeHtml(v.location || '-')}</td>
        <td>${v.capacity ?? '-'}</td>
        <td><div class="actions"><button type="button" class="btn btn-sm btn-outline" data-edit>Edit</button>
          <button type="button" class="btn btn-sm btn-danger" data-del>Delete</button></div></td>`;
      tr.querySelector('[data-edit]').addEventListener('click', () => openVenueModal(v));
      tr.querySelector('[data-del]').addEventListener('click', () => confirmDelete(`Delete venue "${v.name}"?`,
        () => run(CP.api('/api/admin/venues/' + v.venue_id, { method: 'DELETE' }), loadVenues)));
      body.appendChild(tr);
    });
  } catch (e) { CP.toast(e.message, 'error'); }
}

let venueValidator;
function initVenueForm() {
  const form = document.getElementById('venue-form');
  venueValidator = FormValidator(form, {
    name: [rules.required('Enter a name.'), rules.minLength(2)],
    capacity: [v => (v === '' ? '' : rules.number(1, 100000)(v))]
  });
  document.getElementById('add-venue-btn').addEventListener('click', () => openVenueModal(null));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!venueValidator.validateAll()) return;
    const data = formToObject(form);
    const id = data.venue_id;
    delete data.venue_id;
    const ok = await run(id
      ? CP.api('/api/admin/venues/' + id, { method: 'PUT', body: data })
      : CP.api('/api/admin/venues', { method: 'POST', body: data }), loadVenues);
    if (ok) document.getElementById('venue-modal').close();
  });
}
function openVenueModal(v) {
  const form = document.getElementById('venue-form');
  venueValidator.reset();
  document.getElementById('venue-modal-title').textContent = v ? 'Edit venue' : 'Add venue';
  form.elements.venue_id.value = v ? v.venue_id : '';
  form.elements.name.value = v ? v.name : '';
  form.elements.location.value = v ? v.location || '' : '';
  form.elements.capacity.value = v && v.capacity ? v.capacity : '';
  document.getElementById('venue-modal').showModal();
}

// -------------------------------------------------------------- messages
async function loadMessages() {
  const list = document.getElementById('messages-list');
  try {
    const { messages } = await CP.api('/api/admin/messages');
    list.innerHTML = messages.length ? '' : CP.emptyState('No messages yet.');
    messages.forEach(m => {
      const card = document.createElement('article');
      card.className = 'message-card' + (Number(m.is_read) ? '' : ' unread');
      card.innerHTML = `
        <header>
          <div><strong>${CP.escapeHtml(m.subject)}</strong><div class="cell-sub">From ${CP.escapeHtml(m.name)} &lt;<a href="mailto:${CP.escapeHtml(m.email)}">${CP.escapeHtml(m.email)}</a>&gt;</div></div>
          <time class="cell-sub">${CP.escapeHtml(CP.formatDateTime(m.created_at))}</time>
        </header>
        <p>${CP.escapeHtml(m.message)}</p>
        <div class="actions flex">
          <a class="btn btn-sm btn-primary" href="mailto:${CP.escapeHtml(m.email)}?subject=${encodeURIComponent('Re: ' + m.subject)}">Reply</a>
          <button type="button" class="btn btn-sm btn-outline" data-read>${Number(m.is_read) ? 'Mark unread' : 'Mark read'}</button>
          <button type="button" class="btn btn-sm btn-danger" data-del>Delete</button>
        </div>`;
      card.querySelector('[data-read]').addEventListener('click', () =>
        run(CP.api('/api/admin/messages/' + m.message_id, { method: 'PATCH', body: { is_read: !Number(m.is_read) } }), loadMessages));
      card.querySelector('[data-del]').addEventListener('click', () => confirmDelete('Delete this message?',
        () => run(CP.api('/api/admin/messages/' + m.message_id, { method: 'DELETE' }), loadMessages)));
      list.appendChild(card);
    });
  } catch (e) {
    list.innerHTML = `<div class="alert alert-error">${CP.escapeHtml(e.message)}</div>`;
  }
}
