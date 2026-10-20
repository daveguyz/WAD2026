/* CampusPulse | js/login.js - Login form */
'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const next = safeNext(CP.getParam('next'));
  const user = await CP.ready();
  if (user) { window.location.href = next || (user.role === 'admin' ? '/admin/index.html' : '/dashboard.html'); return; }

  const form = document.getElementById('login-form');
  const alertBox = document.getElementById('form-alert');
  attachPasswordToggles(form);

  // "Remember my email" uses localStorage (only the email - never the password)
  try {
    const saved = localStorage.getItem('cp_email');
    if (saved) { form.elements.email.value = saved; form.elements.remember.checked = true; }
  } catch (e) { /* storage unavailable */ }

  if (next) {
    alertBox.className = 'alert alert-info';
    alertBox.textContent = 'Please log in to continue.';
    alertBox.hidden = false;
  }

  const v = FormValidator(form, {
    email: [rules.required('Enter your email address.'), rules.email()],
    password: [rules.required('Enter your password.')]
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    alertBox.hidden = true;
    if (!v.validateAll()) return;
    const btn = form.querySelector('[type="submit"]');
    await withLoading(btn, 'Logging in...', async () => {
      try {
        const { email, password, remember } = formToObject(form);
        const res = await CP.api('/api/auth/login', { method: 'POST', body: { email, password } });
        try { remember ? localStorage.setItem('cp_email', email) : localStorage.removeItem('cp_email'); } catch (err) { /* ignore */ }
        CP.toast(res.message, 'success');
        const dest = next || (res.user.role === 'admin' ? '/admin/index.html' : '/dashboard.html');
        setTimeout(() => { window.location.href = dest; }, 500);
      } catch (err) {
        alertBox.className = 'alert alert-error';
        alertBox.textContent = err.message;
        alertBox.hidden = false;
        form.elements.password.value = '';
        form.elements.password.focus();
      }
    });
  });
});

/** Only allow redirects to pages on this site (prevents open-redirect attacks). */
function safeNext(value) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '';
}
