const axios = require('axios');
const db = require('../config/db');
const { checkOneTimeQuota, recordOneTimeUse } = require('../middleware/plan');
const { detectInjection, KIND_REFUSAL } = require('../utils/promptGuard');

exports.createDraft = async (req, res) => {
  try {
    const { title, mode, document_ids, custom_instruction } = req.body;
    if (!title || !mode || !document_ids?.length) {
      return res.status(400).json({ error: true, message: 'title, mode, and document_ids required' });
    }

    const validModes = [
      'literature_review', 'abstract', 'introduction', 'discussion', 'custom',
      'survey_analysis', 'peer_review', 'threats_to_validity', 'methodological_critique',
    ];
    if (!validModes.includes(mode)) {
      return res.status(400).json({ error: true, message: `Invalid mode. Must be one of: ${validModes.join(', ')}`, code: 'VALIDATION_ERROR' });
    }
    if (custom_instruction && custom_instruction.length > 1000) {
      return res.status(400).json({ error: true, message: 'Custom instruction must be 1000 characters or fewer', code: 'VALIDATION_ERROR' });
    }
    if (custom_instruction && detectInjection(custom_instruction)) {
      return res.status(400).json({ error: true, message: KIND_REFUSAL, code: 'PROMPT_REJECTED' });
    }

    // Free-tier one-time gate: 1 AI draft, ever. Checked before the AI call so
    // a capped user never triggers an expensive generation.
    const { account, blocked } = await checkOneTimeQuota(req, 'draft');
    if (blocked) {
      return res.status(403).json({
        error: true,
        code: 'UPGRADE_REQUIRED',
        message: 'The Free plan includes 1 AI draft. Upgrade for unlimited drafts.',
      });
    }

    const placeholders = document_ids.map((_, i) => `$${i + 2}`).join(',');
    const check = await db.query(
      `SELECT id FROM documents WHERE id IN (${placeholders}) AND user_id = $1`,
      [req.user.id, ...document_ids]
    );
    if (check.rows.length !== document_ids.length) {
      return res.status(403).json({ error: true, message: 'Document access denied' });
    }

    const fastapiRes = await axios.post(`${process.env.FASTAPI_URL}/draft`, {
      user_id: req.user.id,
      document_ids,
      mode,
      custom_instruction: custom_instruction || null,
    }, { timeout: 120000 });

    const { draft, unsupported_count, validation } = fastapiRes.data;

    const result = await db.query(
      `INSERT INTO ai_drafts (user_id, workspace_id, title, content, document_ids, mode, validation)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, null, title, draft, document_ids, mode, validation ? JSON.stringify(validation) : null]
    );
    await recordOneTimeUse(req, 'draft', account);

    return res.status(201).json({ ...result.rows[0], unsupported_count, validation });
  } catch (err) {
    // Surface the AI service's rate-limit (daily token cap) as a clear 429 instead of
    // a generic 500, so the user sees a helpful "try again in ~Xm" message.
    const status = err.response?.status;
    if (status === 429) {
      return res.status(429).json({
        error: true,
        code: 'AI_RATE_LIMITED',
        message: err.response?.data?.detail || 'The daily AI usage limit has been reached. Please try again later.',
      });
    }
    console.error('createDraft error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.listDrafts = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, mode, document_ids, created_at,
              length(content) AS char_count
       FROM ai_drafts WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('listDrafts error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.getDraft = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM ai_drafts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Draft not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('getDraft error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.updateDraft = async (req, res) => {
  try {
    const { content, title } = req.body;
    const updates = [];
    const params = [];
    let idx = 1;

    if (content !== undefined) { updates.push(`content = $${idx++}`); params.push(content); }
    if (title !== undefined) { updates.push(`title = $${idx++}`); params.push(title); }

    if (updates.length === 0) {
      return res.status(400).json({ error: true, message: 'Nothing to update' });
    }

    params.push(req.params.id, req.user.id);
    const result = await db.query(
      `UPDATE ai_drafts SET ${updates.join(', ')} WHERE id = $${idx++} AND user_id = $${idx++} RETURNING *`,
      params
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Draft not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('updateDraft error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.deleteDraft = async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM ai_drafts WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Draft not found' });
    }
    return res.json({ message: 'Draft deleted' });
  } catch (err) {
    console.error('deleteDraft error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.exportDraft = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT title, content FROM ai_drafts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Draft not found' });
    }
    const { title, content } = result.rows[0];
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.md"`);
    return res.send(`# ${title}\n\n${content}`);
  } catch (err) {
    console.error('exportDraft error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};
