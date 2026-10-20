/* CampusPulse | js/register.js - Registration form with live validation */
'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const user = await CP.ready();
  if (user) { window.location.href = '/dashboard.html'; return; }

  const form = document.getElementById('register-form');
  const alertBox = document.getElementById('form-alert');
  attachPasswordToggles(form);

  const v = FormValidator(form, {
    full_name: [rules.required('Enter your full name.'), rules.minLength(3), rules.maxLength(100)],
    student_number: [rules.required('Enter your student number.'), rules.studentNumber()],
    phone: [rules.phone()],
    email: [rules.required('Enter your email address.'), rules.email()],
    faculty: [rules.required('Select your faculty.')],
    password: [rules.required('Choose a password.'), rules.strongPassword()],
    confirm_password: [rules.required('Confirm your password.'), rules.matches('password', 'Passwords do not match.')],
    terms: [rules.checked('You must accept the terms to continue.')]
  });

  // Suggest the student email from the student number
  const studentNo = form.elements.student_number;
  const email = form.elements.email;
  studentNo.addEventListener('input', () => {
    studentNo.value = studentNo.value.replace(/\D/g, '').slice(0, 9);
    if (/^\d{9}$/.test(studentNo.value) && (!email.value || email.dataset.auto)) {
      email.value = studentNo.value + '@students.nust.na';
      email.dataset.auto = '1';
    }
  });
  email.addEventListener('input', () => { delete email.dataset.auto; });

  // Password strength meter
  const meter = document.getElementById('strength');
  const label = document.getElementById('strength-label');
  const names = ['8+ characters with upper case, lower case and a number.', 'Weak', 'Fair', 'Good', 'Strong'];
  form.elements.password.addEventListener('input', e => {
    const level = passwordStrength(e.target.value);
    meter.dataset.level = level;
    label.textContent = level ? 'Strength: ' + names[level] : names[0];
    if (form.elements.confirm_password.dataset.touched) v.validateField('confirm_password');
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    alertBox.hidden = true;
    if (!v.validateAll()) return;
    const btn = form.querySelector('[type="submit"]');
    await withLoading(btn, 'Creating account...', async () => {
      try {
        const data = formToObject(form);
        delete data.terms;
        const res = await CP.api('/api/auth/register', { method: 'POST', body: data });
        CP.toast(res.message, 'success');
        setTimeout(() => { window.location.href = '/dashboard.html'; }, 600);
      } catch (err) {
        alertBox.textContent = err.message;
        alertBox.hidden = false;
        v.showServerErrors(err.fields);
      }
    });
  });
});
