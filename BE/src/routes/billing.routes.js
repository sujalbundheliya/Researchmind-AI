const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const bc = require('../controllers/billing.controller');

// Note: POST /webhook is mounted directly in app.js (raw body, before the JSON
// parser) — it is intentionally NOT declared here.

router.get('/plans', bc.getPlans); // public catalog
router.post('/checkout', auth, bc.createCheckout);
router.post('/change-plan', auth, bc.changePlan);
router.post('/portal', auth, bc.createPortal);
router.post('/sync', auth, bc.syncSubscription);

module.exports = router;
