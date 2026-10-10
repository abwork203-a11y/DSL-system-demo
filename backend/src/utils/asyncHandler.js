// Wraps an async route handler so rejected promises are forwarded to Express's
// error middleware instead of crashing the process or hanging the request.
//
// The wrapper RETURNS the promise on purpose. Express ignores a handler's
// return value, so plain routes are unaffected — but middleware/rls.js's
// withRls / withRlsReadOnly `await` the wrapped handler to know when the
// controller has actually finished before they COMMIT and release the
// database connection. If this returned undefined, that await would resolve
// immediately, the transaction would commit (and the connection be released)
// while the controller's queries were still pending, and the response
// deferred through req.respond() would never be sent.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { asyncHandler };
