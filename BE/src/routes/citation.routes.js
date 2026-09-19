const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const cc = require('../controllers/citation.controller');

router.get('/:docId', auth, cc.getCitation);
router.post('/bulk', auth, cc.getBulkCitations);

module.exports = router;
