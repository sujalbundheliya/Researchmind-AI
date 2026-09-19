const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requirePlan } = require('../middleware/plan');
const zc = require('../controllers/zotero.controller');

// Zotero import is a Pro-only feature (super admins bypass via requirePlan).
router.use(auth, requirePlan('pro'));

router.post('/import', zc.zoteroUploadMiddleware, zc.importZotero);
router.get('/imports', zc.listImports);

module.exports = router;
