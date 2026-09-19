const axios = require('axios');
const db = require('../config/db');

exports.getCitation = async (req, res) => {
  try {
    const { docId } = req.params;

    const docResult = await db.query(
      "SELECT id, file_path FROM documents WHERE id = $1 AND user_id = $2",
      [docId, req.user.id]
    );
    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Document not found' });
    }

    const existing = await db.query(
      'SELECT apa, mla, chicago, ieee, harvard, raw_metadata FROM citations WHERE document_id = $1',
      [docId]
    );

    if (existing.rows.length > 0) {
      return res.json(existing.rows[0]);
    }

    // Trigger extraction if not cached
    const filePath = docResult.rows[0].file_path;
    if (!filePath) {
      return res.status(400).json({ error: true, message: 'No PDF file available for citation extraction' });
    }

    const fastapiRes = await axios.post(`${process.env.FASTAPI_URL}/extract-metadata`, {
      document_id: docId,
      file_path: filePath,
      user_id: req.user.id,
    }, { timeout: 60000 });

    return res.json(fastapiRes.data);
  } catch (err) {
    console.error('getCitation error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.getBulkCitations = async (req, res) => {
  try {
    const { document_ids } = req.body;
    if (!document_ids?.length) {
      return res.status(400).json({ error: true, message: 'document_ids required' });
    }

    const placeholders = document_ids.map((_, i) => `$${i + 2}`).join(',');
    const check = await db.query(
      `SELECT id FROM documents WHERE id IN (${placeholders}) AND user_id = $1`,
      [req.user.id, ...document_ids]
    );
    if (check.rows.length !== document_ids.length) {
      return res.status(403).json({ error: true, message: 'Document access denied' });
    }

    const selectPlaceholders = document_ids.map((_, i) => `$${i + 1}`).join(',');
    const result = await db.query(
      `SELECT c.apa, c.mla, c.chicago, c.ieee, c.harvard, c.raw_metadata, d.original_name
       FROM citations c
       JOIN documents d ON c.document_id = d.id
       WHERE c.document_id IN (${selectPlaceholders})`,
      document_ids
    );

    const referenceList = result.rows.map((r, i) => `[${i + 1}] ${r.apa || r.mla || 'Citation unavailable'}`).join('\n\n');

    return res.json({
      citations: result.rows,
      reference_list: referenceList,
    });
  } catch (err) {
    console.error('getBulkCitations error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};
