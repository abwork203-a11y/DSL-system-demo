const express = require('express');
const { body } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { withRls } = require('../middleware/rls');
const controller = require('../controllers/orderDraftController');

const router = express.Router();
router.use(requireAuth); // any authenticated role — every role that can create orders can also draft one

const saveRules = [
  body('id').isString().trim().isLength({ min: 1, max: 200 }),
  body('distributorId').optional({ nullable: true }),
  body('step').optional(),
  body('items').optional().isArray(),
];

router.get('/', withRls(controller.list));
router.post('/', saveRules, validate, withRls(controller.save));

// CSRF-exempt (see middleware/csrf.js CSRF_EXEMPT_PATHS) — the only path
// navigator.sendBeacon() can hit, since it can't attach the CSRF header.
// Deliberately skips express-validator's `validate` too: a beacon request's
// response body is never read by the browser, so there's no way to surface
// a 400 back to the user anyway — better to have the controller's own
// `id` check fail closed than to 400 on a slightly-malformed beacon payload
// for no one to ever see.
router.post('/beacon', withRls(controller.save));

router.delete('/:id', withRls(controller.remove));

module.exports = router;
