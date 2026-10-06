const { validationResult } = require('express-validator');
const { ApiError } = require('../utils/ApiError');

// Runs after a list of express-validator check(...) rules on a route. If any
// failed, respond with 400 and a field-by-field breakdown instead of letting
// bad data reach a controller (or the database).
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new ApiError(400, 'Invalid input.', errors.array().map((e) => ({ field: e.path, message: e.msg }))));
  }
  next();
}

module.exports = { validate };
