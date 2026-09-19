const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const rc = require('../controllers/review.controller');

// Systematic reviews
router.post('/reviews', auth, rc.createReview);
router.get('/reviews', auth, rc.listReviews);
router.get('/reviews/:id', auth, rc.getReview);
router.post('/reviews/:id/screen/:docId', auth, rc.screenDocument);
router.post('/reviews/:id/screen-all', auth, rc.screenAll);
router.patch('/reviews/:id/screenings/:screeningId', auth, rc.updateScreening);
router.get('/reviews/:id/export', auth, rc.exportScreenings);

// Extraction tables
router.post('/extraction/tables', auth, rc.createExtractionTable);
router.get('/extraction/tables', auth, rc.listExtractionTables);
router.get('/extraction/tables/:tableId', auth, rc.getExtractionTable);
router.post('/extraction/tables/:tableId/extract/:docId', auth, rc.extractDocument);
router.post('/extraction/tables/:tableId/extract-all', auth, rc.extractAll);
router.patch('/extraction/tables/:tableId/rows/:rowId', auth, rc.updateExtractionRow);
router.get('/extraction/tables/:tableId/export', auth, rc.exportExtractionTable);

module.exports = router;
