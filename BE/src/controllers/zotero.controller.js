const axios = require('axios');
const multer = require('multer');
const path = require('path');
const db = require('../config/db');

const zoteroUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.ris', '.bib'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .ris and .bib files are accepted'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

exports.zoteroUploadMiddleware = (req, res, next) => {
  zoteroUpload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: true, message: err.message || 'File upload error' });
    }
    next();
  });
};

exports.importZotero = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: true, message: 'No file uploaded' });
    }

    const filename = req.file.originalname;
    const ext = path.extname(filename).toLowerCase().slice(1);
    const content = req.file.buffer.toString('utf-8');

    const importRecord = await db.query(
      "INSERT INTO zotero_imports (user_id, filename, status) VALUES ($1, $2, 'processing') RETURNING id",
      [req.user.id, filename]
    );
    const importId = importRecord.rows[0].id;

    const fastapiRes = await axios.post(`${process.env.FASTAPI_URL}/import`, {
      user_id: req.user.id,
      filename,
      content,
      format: ext,
    }, { timeout: 120000 });

    const { imported, skipped_duplicates, pending_pdf_upload, linked_existing = 0, failed } = fastapiRes.data;

    // History count reflects everything successfully processed: new stubs plus
    // entries linked onto existing documents.
    await db.query(
      "UPDATE zotero_imports SET status='completed', imported_count=$1, failed_count=$2 WHERE id=$3",
      [imported + linked_existing, failed, importId]
    );

    return res.json({ imported, skipped_duplicates, pending_pdf_upload, linked_existing, failed });
  } catch (err) {
    console.error('importZotero error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.listImports = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM zotero_imports WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('listImports error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};
