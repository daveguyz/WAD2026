/**
 * middleware/auth.js
 * Authentication & authorisation guards.
 */

// API guard: user must be logged in
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }
  next();
}

// API guard: user must be an administrator
function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required.' });
  }
  next();
}

// Page guard: protects HTML pages before they are served
function protectPage(role) {
  return (req, res, next) => {
    const user = req.session.user;
    if (!user) {
      return res.redirect('/login.html?next=' + encodeURIComponent(req.originalUrl));
    }
    if (role === 'admin' && user.role !== 'admin') {
      return res.redirect('/dashboard.html');
    }
    next();
  };
}

module.exports = { requireLogin, requireAdmin, protectPage };
