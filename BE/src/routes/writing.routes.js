const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const wc = require('../controllers/writing.controller');

router.post('/drafts', auth, wc.createDraft);
router.get('/drafts', auth, wc.listDrafts);
router.get('/drafts/:id', auth, wc.getDraft);
router.patch('/drafts/:id', auth, wc.updateDraft);
router.delete('/drafts/:id', auth, wc.deleteDraft);
router.get('/drafts/:id/export', auth, wc.exportDraft);

module.exports = router;
