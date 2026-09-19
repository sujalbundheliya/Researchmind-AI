const express = require('express');
const multer = require('multer');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const documentController = require('../controllers/document.controller');

// Wrap multer so errors return JSON instead of HTML
function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: true,
          message: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB || 20}MB.`,
        });
      }
      return res.status(400).json({ error: true, message: err.message });
    }
    return res.status(400).json({ error: true, message: err.message || 'File upload error' });
  });
}

router.post('/upload', authMiddleware, handleUpload, documentController.uploadDocument);
router.post('/upload-url', authMiddleware, documentController.uploadFromUrl);
router.get('/', authMiddleware, documentController.listDocuments);
// Streams the raw PDF (Range-capable) for the in-app viewer.
router.get('/:id/file', authMiddleware, documentController.getDocumentFile);
router.get('/:id', authMiddleware, documentController.getDocument);
router.delete('/:id', authMiddleware, documentController.deleteDocument);
router.patch('/:id/rename', authMiddleware, documentController.renameDocument);

module.exports = router;
