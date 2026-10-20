/* CampusPulse | js/home.js - Home page: stats, upcoming events, category tiles */
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadUpcoming();
  loadCategories();
});

/** Animate a number counting up from 0 (DOM manipulation + timers). */
function countUp(el, target) {
  const duration = 900;
  const start = performance.now();
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(target * progress);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

async function loadStats() {
  try {
    const stats = await CP.api('/api/stats');
    document.querySelectorAll('[data-stat]').forEach(el => countUp(el, Number(stats[el.dataset.stat]) || 0));
  } catch (e) { /* stats are decorative - fail silently */ }
}

async function loadUpcoming() {
  const grid = document.getElementById('upcoming-grid');
  try {
    const data = await CP.api('/api/events?limit=6&sort=date_asc');
    grid.innerHTML = '';
    if (!data.events.length) {
      grid.innerHTML = CP.emptyState('No upcoming events yet - check back soon!');
      return;
    }
    data.events.forEach(ev => grid.appendChild(CP.eventCard(ev)));
  } catch (e) {
    grid.innerHTML = `<div class="alert alert-error">${CP.escapeHtml(e.message)}</div>`;
  }
}

async function loadCategories() {
  const grid = document.getElementById('category-grid');
  try {
    const { categories } = await CP.api('/api/categories');
    grid.innerHTML = '';
    categories.forEach(cat => {
      const a = document.createElement('a');
      a.className = 'category-tile';
      a.href = '/events.html?category=' + cat.category_id;
      a.style.setProperty('--cat', cat.colour);
      a.innerHTML = `<span class="dot" aria-hidden="true">${CP.escapeHtml(cat.name[0])}</span>
        <span><strong>${CP.escapeHtml(cat.name)}</strong>
        <small>${cat.upcoming} upcoming event${Number(cat.upcoming) === 1 ? '' : 's'}</small></span>`;
      grid.appendChild(a);
    });
  } catch (e) {
    grid.innerHTML = `<div class="alert alert-error">${CP.escapeHtml(e.message)}</div>`;
  }
}
