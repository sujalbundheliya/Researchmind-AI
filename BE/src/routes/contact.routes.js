const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const contactController = require('../controllers/contact.controller');

// Public. `auth.optional` attributes the message to the sender's account when
// they happen to be signed in, without requiring it — the contact page is
// reachable from the marketing site by logged-out visitors.
router.post('/', auth.optional, contactController.submit);

module.exports = router;
