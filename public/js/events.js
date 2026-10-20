/* CampusPulse | js/events.js
   Listing page: search, filters, category chips, sorting, grid/table view, pagination.
   Filters are kept in the URL so results can be bookmarked and shared. */
'use strict';

const state = { q: '', category: '', venue: '', when: 'upcoming', price: '', sort: 'date_asc', page: 1, view: 'grid' };
const FILTER_KEYS = ['q', 'category', 'venue', 'when', 'price', 'sort', 'page'];
let lastEvents = [];

document.addEventListener('DOMContentLoaded', async () => {
  readStateFromUrl();
  await loadLookups();
  writeStateToForm();
  bindEvents();
  loadEvents();
});

function readStateFromUrl() {
  const params = new URLSearchParams(location.search);
  FILTER_KEYS.forEach(key => { if (params.has(key)) state[key] = params.get(key); });
  state.page = Number(state.page) || 1;
}

function writeStateToUrl() {
  const params = new URLSearchParams();
  FILTER_KEYS.forEach(key => {
    const defaults = { when: 'upcoming', sort: 'date_asc', page: 1 };
    if (state[key] !== '' && String(state[key]) !== String(defaults[key] ?? '')) params.set(key, state[key]);
  });
  const qs = params.toString();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
}

function writeStateToForm() {
  document.getElementById('f-q').value = state.q;
  document.getElementById('f-category').value = state.category;
  document.getElementById('f-venue').value = state.venue;
  document.getElementById('f-when').value = state.when;
  document.getElementById('f-price').value = state.price;
  document.getElementById('f-sort').value = state.sort;
  highlightChip();
}

async function loadLookups() {
  try {
    const [{ categories }, { venues }] = await Promise.all([CP.api('/api/categories'), CP.api('/api/venues')]);
    const catSelect = document.getElementById('f-category');
    const venueSelect = document.getElementById('f-venue');
    const chips = document.getElementById('category-chips');

    chips.appendChild(makeChip('All', ''));
    categories.forEach(c => {
      catSelect.add(new Option(c.name, c.category_id));
      chips.appendChild(makeChip(c.name, String(c.category_id)));
    });
    venues.forEach(v => venueSelect.add(new Option(v.name, v.venue_id)));
  } catch (e) {
    CP.toast('Could not load filters: ' + e.message, 'error');
  }
}

function makeChip(label, value) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chip';
  btn.textContent = label;
  btn.dataset.value = value;
  btn.addEventListener('click', () => {
    state.category = value;
    state.page = 1;
    document.getElementById('f-category').value = value;
    highlightChip();
    loadEvents();
  });
  return btn;
}

function highlightChip() {
  document.querySelectorAll('#category-chips .chip').forEach(chip => {
    const active = chip.dataset.value === String(state.category);
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-pressed', String(active));
  });
}

function bindEvents() {
  const form = document.getElementById('filter-form');
  form.addEventListener('submit', e => e.preventDefault());

  // Search as you type (debounced so we don't hit the server on every key)
  document.getElementById('f-q').addEventListener('input', CP.debounce(e => {
    state.q = e.target.value.trim();
    state.page = 1;
    loadEvents();
  }, 350));

  // Selects
  [['f-category', 'category'], ['f-venue', 'venue'], ['f-when', 'when'], ['f-price', 'price'], ['f-sort', 'sort']]
    .forEach(([id, key]) => {
      document.getElementById(id).addEventListener('change', e => {
        state[key] = e.target.value;
        state.page = 1;
        if (key === 'category') highlightChip();
        loadEvents();
      });
    });

  document.getElementById('clear-filters').addEventListener('click', () => {
    Object.assign(state, { q: '', category: '', venue: '', when: 'upcoming', price: '', sort: 'date_asc', page: 1 });
    writeStateToForm();
    loadEvents();
  });

  // Grid / table view toggle
  document.querySelectorAll('.view-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      document.querySelectorAll('.view-toggle button').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });
      render(lastEvents);
    });
  });
}

async function loadEvents() {
  writeStateToUrl();
  const grid = document.getElementById('event-grid');
  const count = document.getElementById('result-count');
  grid.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  const params = new URLSearchParams({ limit: 9 });
  FILTER_KEYS.forEach(k => { if (state[k] !== '') params.set(k, state[k]); });

  try {
    const data = await CP.api('/api/events?' + params.toString());
    lastEvents = data.events;
    count.textContent = data.total === 0
      ? 'No events found'
      : `Showing ${data.events.length} of ${data.total} event${data.total === 1 ? '' : 's'}`;
    render(data.events);
    renderPagination(data.page, data.pages);
  } catch (e) {
    grid.innerHTML = `<div class="alert alert-error">${CP.escapeHtml(e.message)}</div>`;
    count.textContent = '';
  }
}

function render(events) {
  const grid = document.getElementById('event-grid');
  const tableWrap = document.getElementById('event-table-wrap');
  const tbody = document.getElementById('event-table-body');
  const isGrid = state.view === 'grid';
  grid.classList.toggle('hidden', !isGrid && events.length > 0);
  tableWrap.classList.toggle('hidden', isGrid || events.length === 0);
  grid.innerHTML = '';
  tbody.innerHTML = '';

  if (!events.length) {
    grid.classList.remove('hidden');
    grid.innerHTML = CP.emptyState('No events match your filters. Try a different search.',
      '<button class="btn btn-outline" type="button" id="empty-clear">Clear filters</button>');
    document.getElementById('empty-clear').addEventListener('click', () => document.getElementById('clear-filters').click());
    return;
  }

  if (isGrid) {
    events.forEach(ev => grid.appendChild(CP.eventCard(ev)));
  } else {
    events.forEach(ev => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><a class="cell-title" href="/event.html?id=${ev.event_id}">${CP.escapeHtml(ev.title)}</a></td>
        <td><span class="badge badge-category">${CP.escapeHtml(ev.category)}</span></td>
        <td>${CP.escapeHtml(CP.formatDate(ev.start_datetime))}<div class="cell-sub">${CP.formatTime(ev.start_datetime)}</div></td>
        <td>${CP.escapeHtml(ev.venue)}</td>
        <td>${ev.registered} / ${ev.capacity}</td>
        <td>${CP.formatPrice(ev.is_free, ev.ticket_price)}</td>
        <td><a class="btn btn-sm btn-outline" href="/event.html?id=${ev.event_id}">View</a></td>`;
      tr.querySelector('.badge').style.setProperty('--cat', ev.category_colour);
      tbody.appendChild(tr);
    });
  }
}

function renderPagination(page, pages) {
  const nav = document.getElementById('pagination');
  nav.innerHTML = '';
  if (pages <= 1) return;
  const addBtn = (label, target, opts = {}) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.disabled = !!opts.disabled;
    if (opts.active) { b.classList.add('active'); b.setAttribute('aria-current', 'page'); }
    if (opts.aria) b.setAttribute('aria-label', opts.aria);
    b.addEventListener('click', () => {
      state.page = target;
      loadEvents();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    nav.appendChild(b);
  };
  addBtn('‹', page - 1, { disabled: page === 1, aria: 'Previous page' });
  for (let i = 1; i <= pages; i++) addBtn(String(i), i, { active: i === page });
  addBtn('›', page + 1, { disabled: page === pages, aria: 'Next page' });
}
