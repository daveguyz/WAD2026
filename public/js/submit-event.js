/* CampusPulse | js/submit-event.js
   Data-entry form for hosting an event. Also used to edit an event: submit-event.html?edit=ID */
'use strict';

let venues = [];

document.addEventListener('DOMContentLoaded', async () => {
  const user = await CP.requireUser();
  if (!user) return;

  const form = document.getElementById('event-form');
  const alertBox = document.getElementById('form-alert');
  const editId = CP.getParam('edit');
  attachCharCounters(form);

  await loadLookups();

  // Earliest allowed start = now (rounded to the next hour)
  const minDate = new Date();
  minDate.setHours(minDate.getHours() + 1, 0, 0, 0);
  const minStr = CP.toInputDateTime(`${minDate.getFullYear()}-${minDate.getMonth() + 1}-${minDate.getDate()} ${minDate.getHours()}:00:00`);
  form.elements.start_datetime.min = minStr;
  form.elements.end_datetime.min = minStr;

  const v = FormValidator(form, {
    title: [rules.required('Give your event a title.'), rules.minLength(5), rules.maxLength(120)],
    summary: [rules.required('Add a short summary.'), rules.minLength(10), rules.maxLength(200)],
    description: [rules.required('Describe your event.'), rules.minLength(20)],
    category_id: [rules.required('Choose a category.')],
    venue_id: [rules.required('Choose a venue.')],
    start_datetime: [rules.required('Choose a start date and time.'), rules.future()],
    end_datetime: [rules.required('Choose an end date and time.'), rules.after('start_datetime', 'The event must end after it starts.')],
    capacity: [rules.required('Enter the maximum attendees.'), rules.number(1, 5000)],
    ticket_price: [(value, f) => (f.elements.entry.value === 'paid' ? rules.number(1, 10000, 'Enter a price between N$1 and N$10 000.')(value) : '')],
    confirm: [rules.checked()]
  });

  // When start changes, move the end's minimum and suggest a 2 hour event
  form.elements.start_datetime.addEventListener('change', e => {
    form.elements.end_datetime.min = e.target.value;
    if (!form.elements.end_datetime.value && e.target.value) {
      const end = new Date(e.target.value);
      end.setHours(end.getHours() + 2);
      form.elements.end_datetime.value = CP.toInputDateTime(
        `${end.getFullYear()}-${end.getMonth() + 1}-${end.getDate()} ${end.getHours()}:${end.getMinutes()}:00`);
    }
  });

  // Free / paid toggle shows or hides the price field
  const priceGroup = document.getElementById('price-group');
  form.querySelectorAll('input[name="entry"]').forEach(radio => radio.addEventListener('change', () => {
    const paid = form.elements.entry.value === 'paid';
    priceGroup.classList.toggle('hidden', !paid);
    if (!paid) { form.elements.ticket_price.value = ''; v.setError('ticket_price', ''); }
  }));

  // Venue capacity hint + warning
  const venueHint = document.getElementById('venue-hint');
  const updateVenueHint = () => {
    const venue = venues.find(x => String(x.venue_id) === form.elements.venue_id.value);
    venueHint.textContent = venue && venue.capacity ? `This venue holds up to ${venue.capacity} people.` : '';
    if (venue && venue.capacity && Number(form.elements.capacity.value) > venue.capacity) {
      venueHint.textContent += ' Your capacity is higher than the venue allows!';
    }
  };
  form.elements.venue_id.addEventListener('change', updateVenueHint);
  form.elements.capacity.addEventListener('input', updateVenueHint);

  form.addEventListener('reset', () => setTimeout(() => {
    priceGroup.classList.add('hidden');
    form.querySelectorAll('.form-group').forEach(g => g.classList.remove('invalid', 'valid'));
    form.querySelectorAll('.error-msg').forEach(el => { el.textContent = ''; });
    form.querySelectorAll('[data-counter]').forEach(el => el.dispatchEvent(new Event('input')));
  }));

  if (editId) await loadForEdit(form, editId, priceGroup);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    alertBox.hidden = true;
    if (!v.validateAll()) return;
    const data = formToObject(form);
    data.is_free = data.entry === 'free';
    data.ticket_price = data.is_free ? 0 : Number(data.ticket_price);
    delete data.entry;
    delete data.confirm;

    await withLoading(document.getElementById('submit-btn'), editId ? 'Saving...' : 'Submitting...', async () => {
      try {
        const res = editId
          ? await CP.api('/api/me/events/' + editId, { method: 'PUT', body: data })
          : await CP.api('/api/events', { method: 'POST', body: data });
        CP.toast(res.message, 'success', 4500);
        setTimeout(() => { window.location.href = '/dashboard.html#hosted'; }, 900);
      } catch (err) {
        alertBox.textContent = err.message;
        alertBox.hidden = false;
        v.showServerErrors(err.fields);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
});

async function loadLookups() {
  const form = document.getElementById('event-form');
  try {
    const [{ categories }, venueData] = await Promise.all([CP.api('/api/categories'), CP.api('/api/venues')]);
    venues = venueData.venues;
    categories.forEach(c => form.elements.category_id.add(new Option(c.name, c.category_id)));
    venues.forEach(vn => form.elements.venue_id.add(new Option(vn.name, vn.venue_id)));
  } catch (e) {
    CP.toast('Could not load categories and venues: ' + e.message, 'error');
  }
}

async function loadForEdit(form, id, priceGroup) {
  try {
    const { event: ev } = await CP.api('/api/events/' + id);
    if (ev.organiser_id !== CP.user.user_id) throw new Error('You can only edit your own events.');
    document.getElementById('form-title').textContent = 'Edit event';
    document.getElementById('form-intro').textContent = 'Changes are sent to an administrator for review again before they go live.';
    document.getElementById('submit-btn').textContent = 'Save changes';
    form.elements.title.value = ev.title;
    form.elements.summary.value = ev.summary;
    form.elements.description.value = ev.description;
    form.elements.category_id.value = ev.category_id;
    form.elements.venue_id.value = ev.venue_id;
    form.elements.start_datetime.value = CP.toInputDateTime(ev.start_datetime);
    form.elements.end_datetime.value = CP.toInputDateTime(ev.end_datetime);
    form.elements.capacity.value = ev.capacity;
    const paid = !Number(ev.is_free);
    form.querySelector(`input[name="entry"][value="${paid ? 'paid' : 'free'}"]`).checked = true;
    priceGroup.classList.toggle('hidden', !paid);
    if (paid) form.elements.ticket_price.value = ev.ticket_price;
    form.querySelectorAll('[data-counter]').forEach(el => el.dispatchEvent(new Event('input')));
  } catch (e) {
    CP.toast(e.message, 'error');
    setTimeout(() => { window.location.href = '/dashboard.html'; }, 1200);
  }
}
