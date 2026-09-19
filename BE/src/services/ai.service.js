const axios = require('axios');
const db = require('../config/db');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Connection-level errors mean the AI service isn't accepting requests yet
// (e.g. still loading the embedding model on startup) — worth retrying.
const RETRIABLE_CODES = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'];

exports.triggerIngest = async (docId, filePath, userId, workspaceId = null, meta = {}) => {
  const payload = {
    document_id: docId,
    file_path: filePath,
    user_id: userId,
    workspace_id: workspaceId,
    filename: meta.filename || null,
    original_name: meta.originalName || null,
    file_size_bytes: meta.fileSizeBytes || null,
  };

  // /ingest returns 202 immediately and processes in the background, so a short
  // timeout is enough. Retry connection failures to ride out AI startup.
  const maxAttempts = 12;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await axios.post(`${process.env.FASTAPI_URL}/ingest`, payload, { timeout: 30000 });
      return;
    } catch (err) {
      const retriable = RETRIABLE_CODES.includes(err.code);
      if (retriable && attempt < maxAttempts) {
        console.warn(
          `triggerIngest attempt ${attempt} for doc ${docId} failed (${err.code}); retrying...`
        );
        await sleep(Math.min(2000 * attempt, 15000));
        continue;
      }
      console.error('triggerIngest failed for doc', docId, ':', err.message);
      try {
        await db.query("UPDATE documents SET status = 'failed' WHERE id = $1", [docId]);
      } catch (dbErr) {
        console.error('Failed to mark doc as failed:', dbErr.message);
      }
      return;
    }
  }
};
