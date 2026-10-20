/* CampusPulse | js/contact.js - Contact form */
'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('contact-form');
  const alertBox = document.getElementById('form-alert');
  attachCharCounters(form);

  const v = FormValidator(form, {
    name: [rules.required('Enter your name.'), rules.minLength(2)],
    email: [rules.required('Enter your email address.'), rules.email()],
    subject: [rules.required('Choose a subject.')],
    message: [rules.required('Write a message.'), rules.minLength(10), rules.maxLength(2000)]
  });

  // Pre-fill for logged-in users
  const user = await CP.ready();
  if (user) {
    form.elements.name.value = user.full_name;
    form.elements.email.value = user.email;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    alertBox.hidden = true;
    if (!v.validateAll()) return;
    await withLoading(form.querySelector('[type="submit"]'), 'Sending...', async () => {
      try {
        const res = await CP.api('/api/contact', { method: 'POST', body: formToObject(form) });
        alertBox.className = 'alert alert-success';
        alertBox.textContent = res.message;
        alertBox.hidden = false;
        form.elements.subject.value = '';
        form.elements.message.value = '';
        form.elements.message.dispatchEvent(new Event('input'));
        form.querySelectorAll('.form-group').forEach(g => g.classList.remove('valid'));
      } catch (err) {
        alertBox.className = 'alert alert-error';
        alertBox.textContent = err.message;
        alertBox.hidden = false;
        v.showServerErrors(err.fields);
      }
    });
  });
});
