/* =====================================================================
   CampusPulse  |  js/validation.js
   Reusable client-side form validation.
   Usage:
     const v = FormValidator(formElement, {
       email: [rules.required('Email is required'), rules.email()],
       ...
     });
     if (v.validateAll()) { ...submit... }
   Errors are shown under each field (.error-msg) and announced to screen readers.
   ===================================================================== */
'use strict';

// Each rule is a function (value, form) => error message | '' (valid)
const rules = {
  required: (msg = 'This field is required.') => value => (String(value).trim() === '' ? msg : ''),
  minLength: (n, msg) => value => (String(value).trim().length < n ? (msg || `Must be at least ${n} characters.`) : ''),
  maxLength: (n, msg) => value => (String(value).trim().length > n ? (msg || `Must be ${n} characters or fewer.`) : ''),
  email: (msg = 'Enter a valid email address.') => value => (value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()) ? msg : ''),
  studentNumber: (msg = 'Student number must be exactly 9 digits.') => value => (!/^\d{9}$/.test(value.trim()) ? msg : ''),
  phone: (msg = 'Enter a valid Namibian number, e.g. 081 123 4567.') =>
    value => (value.trim() && !/^(\+?264|0)\d{8,9}$/.test(value.replace(/\s/g, '')) ? msg : ''),
  strongPassword: (msg = 'Use 8+ characters with upper case, lower case and a number.') =>
    value => (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(value) ? msg : ''),
  matches: (otherName, msg = 'Values do not match.') => (value, form) => (value !== form.elements[otherName].value ? msg : ''),
  number: (min, max, msg) => value => {
    const n = Number(value);
    return value === '' || Number.isNaN(n) || n < min || n > max ? (msg || `Enter a number between ${min} and ${max}.`) : '';
  },
  future: (msg = 'Choose a date and time in the future.') => value => (value && new Date(value) <= new Date() ? msg : ''),
  after: (otherName, msg = 'Must be after the start.') =>
    (value, form) => (value && form.elements[otherName].value && new Date(value) <= new Date(form.elements[otherName].value) ? msg : ''),
  checked: (msg = 'Please tick this box to continue.') => (value, form, field) => (!field.checked ? msg : '')
};

function FormValidator(form, schema) {
  // Make sure each field has an error container
  Object.keys(schema).forEach(name => {
    const field = form.elements[name];
    if (!field) return;
    const group = field.closest('.form-group') || field.parentElement;
    if (!group.querySelector('.error-msg')) {
      const msg = document.createElement('p');
      msg.className = 'error-msg';
      msg.id = name + '-error';
      msg.setAttribute('aria-live', 'polite');
      group.appendChild(msg);
    }
    field.setAttribute('aria-describedby', (field.getAttribute('aria-describedby') || '') + ' ' + name + '-error');
  });

  function setError(name, message) {
    const field = form.elements[name];
    if (!field) return;
    const group = field.closest('.form-group') || field.parentElement;
    const box = group.querySelector('.error-msg');
    group.classList.toggle('invalid', !!message);
    group.classList.toggle('valid', !message && field.type !== 'checkbox' && String(field.value).trim() !== '');
    field.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (box) box.textContent = message || '';
  }

  function validateField(name) {
    const field = form.elements[name];
    if (!field || field.disabled) return true;
    const value = field.type === 'checkbox' ? String(field.checked) : field.value;
    for (const rule of schema[name]) {
      const message = rule(value, form, field);
      if (message) { setError(name, message); return false; }
    }
    setError(name, '');
    return true;
  }

  function validateAll() {
    let firstInvalid = null;
    Object.keys(schema).forEach(name => {
      if (!validateField(name) && !firstInvalid) firstInvalid = form.elements[name];
    });
    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }

  /** Display field errors returned by the server (422 / 409 responses). */
  function showServerErrors(fields = {}) {
    Object.entries(fields).forEach(([name, msg]) => setError(name, msg));
    const first = Object.keys(fields)[0];
    if (first && form.elements[first]) form.elements[first].focus();
  }

  function reset() {
    form.reset();
    form.querySelectorAll('.form-group').forEach(g => g.classList.remove('invalid', 'valid'));
    form.querySelectorAll('.error-msg').forEach(e => { e.textContent = ''; });
  }

  // Live validation: on blur, then on every input once the user has interacted
  Object.keys(schema).forEach(name => {
    const field = form.elements[name];
    if (!field) return;
    field.addEventListener('blur', () => { field.dataset.touched = '1'; validateField(name); });
    field.addEventListener(field.tagName === 'SELECT' || field.type === 'checkbox' ? 'change' : 'input', () => {
      if (field.dataset.touched) validateField(name);
    });
  });

  return { validateField, validateAll, showServerErrors, setError, reset };
}

/** Collect form values into a plain object. */
function formToObject(form) {
  const data = {};
  Array.from(form.elements).forEach(el => {
    if (!el.name || el.disabled) return;
    if (el.type === 'checkbox') data[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
    else data[el.name] = el.value.trim();
  });
  return data;
}

/** Live character counter for inputs/textarea with maxlength and a .char-count element. */
function attachCharCounters(root = document) {
  root.querySelectorAll('[data-counter]').forEach(field => {
    const counter = document.getElementById(field.dataset.counter);
    const max = Number(field.getAttribute('maxlength')) || 0;
    const update = () => {
      counter.textContent = `${field.value.length}${max ? ' / ' + max : ''} characters`;
      counter.classList.toggle('over', max && field.value.length >= max);
    };
    field.addEventListener('input', update);
    update();
  });
}

/** Show/hide password toggle buttons. */
function attachPasswordToggles(root = document) {
  root.querySelectorAll('.password-wrap').forEach(wrap => {
    const input = wrap.querySelector('input');
    const btn = wrap.querySelector('button');
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });
}

/** Password strength meter: 0-4 based on length and character variety. */
function passwordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) score++;
  return pw ? Math.max(score, 1) : 0;
}

/** Disable a button and show a loading label while an async task runs. */
async function withLoading(button, label, task) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try { return await task(); }
  finally { button.disabled = false; button.textContent = original; }
}
