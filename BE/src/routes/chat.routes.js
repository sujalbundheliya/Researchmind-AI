const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const chatController = require('../controllers/chat.controller');

router.post('/sessions', authMiddleware, chatController.createSession);
router.get('/sessions', authMiddleware, chatController.listSessions);
router.get('/sessions/:id', authMiddleware, chatController.getSession);
router.post('/sessions/:id/message', authMiddleware, chatController.sendMessage);
router.delete('/sessions/:id', authMiddleware, chatController.deleteSession);
router.post('/summarize/:docId', authMiddleware, chatController.summarizeDoc);
router.post('/findings/:docId', authMiddleware, chatController.extractFindings);
router.post('/gaps', authMiddleware, chatController.researchGaps);

module.exports = router;
