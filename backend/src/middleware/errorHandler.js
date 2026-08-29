const { ApiError } = require('../utils/ApiError');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details || undefined,
    });
  }

  // Postgres unique_violation — called out by constraint name where it's
  // worth a more specific message than the generic fallback below. Carries
  // the same `details` shape as validate.js's field errors so the frontend
  // can highlight the specific field either way, not just show a toast.
  if (err.code === '23505') {
    if (err.constraint === 'users_email_key') {
      return res.status(409).json({
        error: 'An account with that email already exists.',
        details: [{ field: 'email', message: 'An account with that email already exists.' }],
      });
    }
    return res.status(409).json({ error: 'A record with that value already exists.' });
  }
  // Postgres foreign_key_violation
  if (err.code === '23503') {
    return res.status(409).json({ error: 'This record is referenced elsewhere and cannot be removed/changed.' });
  }
  // Postgres check_violation
  if (err.code === '23514') {
    return res.status(400).json({ error: 'Invalid value for one of the fields provided.' });
  }

  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: 'Internal server error.' });
}

function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

module.exports = { errorHandler, notFound };
