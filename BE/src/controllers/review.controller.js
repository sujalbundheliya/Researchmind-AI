const axios = require('axios');
const db = require('../config/db');
const { checkOneTimeQuota, recordOneTimeUse } = require('../middleware/plan');
const { detectInjection, KIND_REFUSAL } = require('../utils/promptGuard');

// ─── Systematic Reviews ───────────────────────────────────────────

exports.createReview = async (req, res) => {
  try {
    const { title, research_question, inclusion_criteria, exclusion_criteria, workspace_id } = req.body;
    if (!title || !research_question || !inclusion_criteria || !exclusion_criteria) {
      return res.status(400).json({ error: true, message: 'All fields required' });
    }
    if (title.length > 200) return res.status(400).json({ error: true, message: 'Title must be 200 characters or fewer' });
    if (research_question.length > 500) return res.status(400).json({ error: true, message: 'Research question must be 500 characters or fewer' });
    if (inclusion_criteria.length > 1000) return res.status(400).json({ error: true, message: 'Inclusion criteria must be 1000 characters or fewer' });
    if (exclusion_criteria.length > 1000) return res.status(400).json({ error: true, message: 'Exclusion criteria must be 1000 characters or fewer' });
    if ([research_question, inclusion_criteria, exclusion_criteria].some(detectInjection)) {
      return res.status(400).json({ error: true, message: KIND_REFUSAL, code: 'PROMPT_REJECTED' });
    }

    // Free-tier one-time gate: 1 systematic review, ever.
    const { account, blocked } = await checkOneTimeQuota(req, 'review');
    if (blocked) {
      return res.status(403).json({
        error: true,
        code: 'UPGRADE_REQUIRED',
        message: 'The Free plan includes 1 systematic review. Upgrade for unlimited reviews.',
      });
    }

    const result = await db.query(
      `INSERT INTO systematic_reviews (user_id, workspace_id, title, research_question, inclusion_criteria, exclusion_criteria, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft') RETURNING *`,
      [req.user.id, workspace_id || null, title, research_question, inclusion_criteria, exclusion_criteria]
    );
    await recordOneTimeUse(req, 'review', account);
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('createReview error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.listReviews = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT sr.*,
              COUNT(DISTINCT rs.id)::int AS screened_count,
              COUNT(DISTINCT CASE WHEN rs.decision = 'include' THEN rs.id END)::int AS included_count,
              COUNT(DISTINCT CASE WHEN rs.decision = 'exclude' THEN rs.id END)::int AS excluded_count,
              COUNT(DISTINCT CASE WHEN rs.decision = 'maybe' THEN rs.id END)::int AS maybe_count
       FROM systematic_reviews sr
       LEFT JOIN review_screenings rs ON rs.review_id = sr.id
       WHERE sr.user_id = $1
       GROUP BY sr.id
       ORDER BY sr.created_at DESC`,
      [req.user.id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('listReviews error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.getReview = async (req, res) => {
  try {
    const reviewResult = await db.query(
      'SELECT * FROM systematic_reviews WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (reviewResult.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Review not found' });
    }

    const screeningsResult = await db.query(
      `SELECT rs.id, rs.document_id, rs.decision, rs.reason,
              rs.ai_decision, rs.ai_reason, rs.reviewed_at, rs.reviewed_by,
              u.name AS reviewer_name,
              rs.extracted_data, rs.evidence, rs.created_at,
              d.original_name AS doc_name, d.status AS doc_status
       FROM review_screenings rs
       JOIN documents d ON rs.document_id = d.id
       LEFT JOIN users u ON u.id = rs.reviewed_by
       WHERE rs.review_id = $1
       ORDER BY rs.created_at ASC`,
      [req.params.id]
    );

    return res.json({ ...reviewResult.rows[0], screenings: screeningsResult.rows });
  } catch (err) {
    console.error('getReview error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.screenDocument = async (req, res) => {
  try {
    const reviewResult = await db.query(
      'SELECT * FROM systematic_reviews WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (reviewResult.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Review not found' });
    }
    const review = reviewResult.rows[0];

    const docResult = await db.query(
      "SELECT id FROM documents WHERE id = $1 AND user_id = $2 AND status = 'ready'",
      [req.params.docId, req.user.id]
    );
    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Document not found or not ready' });
    }

    const fastapiRes = await axios.post(`${process.env.FASTAPI_URL}/screen-paper`, {
      document_id: req.params.docId,
      user_id: req.user.id,
      inclusion_criteria: review.inclusion_criteria,
      exclusion_criteria: review.exclusion_criteria,
    }, { timeout: 60000 });

    const { decision, reason, confidence, evidence } = fastapiRes.data;
    // Verified verbatim quotes + real page numbers, used by the PDF viewer to
    // jump to and highlight the text a decision rests on.
    const evidenceJson = JSON.stringify(evidence || []);

    const existing = await db.query(
      'SELECT id FROM review_screenings WHERE review_id = $1 AND document_id = $2',
      [req.params.id, req.params.docId]
    );

    let screening;
    if (existing.rows.length > 0) {
      // Re-screening is a fresh AI run — refresh the AI record and clear any
      // prior human override so the audit trail reflects the new AI decision.
      const updated = await db.query(
        "UPDATE review_screenings SET decision=$1, reason=$2, ai_decision=$1, ai_reason=$2, reviewed_by=NULL, reviewed_at=NULL, extracted_data=$3, evidence=$5 WHERE id=$4 RETURNING *",
        [decision, reason, JSON.stringify({ confidence }), existing.rows[0].id, evidenceJson]
      );
      screening = updated.rows[0];
    } else {
      const inserted = await db.query(
        "INSERT INTO review_screenings (review_id, document_id, decision, reason, ai_decision, ai_reason, extracted_data, evidence) VALUES ($1,$2,$3,$4,$3,$4,$5,$6) RETURNING *",
        [req.params.id, req.params.docId, decision, reason, JSON.stringify({ confidence }), evidenceJson]
      );
      screening = inserted.rows[0];
    }

    return res.json({ ...screening, confidence });
  } catch (err) {
    console.error('screenDocument error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.screenAll = async (req, res) => {
  try {
    const { document_ids } = req.body;
    if (!document_ids || document_ids.length === 0) {
      return res.status(400).json({ error: true, message: 'document_ids required' });
    }

    const reviewResult = await db.query(
      'SELECT * FROM systematic_reviews WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (reviewResult.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Review not found' });
    }
    const review = reviewResult.rows[0];

    const screenOne = async (docId) => {
      const fastapiRes = await axios.post(`${process.env.FASTAPI_URL}/screen-paper`, {
        document_id: docId,
        user_id: req.user.id,
        inclusion_criteria: review.inclusion_criteria,
        exclusion_criteria: review.exclusion_criteria,
      }, { timeout: 60000 });

      const { decision, reason, confidence, evidence } = fastapiRes.data;
      const evidenceJson = JSON.stringify(evidence || []);

      const existing = await db.query(
        'SELECT id FROM review_screenings WHERE review_id = $1 AND document_id = $2',
        [req.params.id, docId]
      );

      if (existing.rows.length > 0) {
        await db.query(
          "UPDATE review_screenings SET decision=$1, reason=$2, ai_decision=$1, ai_reason=$2, reviewed_by=NULL, reviewed_at=NULL, extracted_data=$3, evidence=$5 WHERE id=$4",
          [decision, reason, JSON.stringify({ confidence }), existing.rows[0].id, evidenceJson]
        );
      } else {
        await db.query(
          "INSERT INTO review_screenings (review_id, document_id, decision, reason, ai_decision, ai_reason, extracted_data, evidence) VALUES ($1,$2,$3,$4,$3,$4,$5,$6)",
          [req.params.id, docId, decision, reason, JSON.stringify({ confidence }), evidenceJson]
        );
      }
      return { document_id: docId, decision, confidence };
    };

    const settled = await Promise.allSettled(document_ids.map(screenOne));

    const results = settled.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { document_id: document_ids[i], error: r.reason?.message || 'Failed' }
    );
    const completed = settled.filter(r => r.status === 'fulfilled').length;

    return res.json({ results, completed, total: document_ids.length });
  } catch (err) {
    console.error('screenAll error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.updateScreening = async (req, res) => {
  try {
    const { decision } = req.body;
    if (!['include', 'exclude', 'maybe'].includes(decision)) {
      return res.status(400).json({ error: true, message: 'Invalid decision value' });
    }
    const reviewCheck = await db.query(
      'SELECT id FROM systematic_reviews WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (reviewCheck.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Review not found' });
    }
    // Human override — record who/when. ai_decision & ai_reason are left
    // untouched so the original AI decision is always preserved.
    const result = await db.query(
      'UPDATE review_screenings SET decision=$1, reviewed_by=$2, reviewed_at=NOW() WHERE id=$3 AND review_id=$4 RETURNING *',
      [decision, req.user.id, req.params.screeningId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Screening not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('updateScreening error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.exportScreenings = async (req, res) => {
  try {
    const reviewCheck = await db.query(
      'SELECT id FROM systematic_reviews WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (reviewCheck.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Review not found' });
    }

    const result = await db.query(
      `SELECT rs.decision, rs.reason, rs.ai_decision, rs.reviewed_at, u.name AS reviewer_name,
              rs.extracted_data, d.original_name AS doc_name
       FROM review_screenings rs
       JOIN documents d ON rs.document_id = d.id
       LEFT JOIN users u ON u.id = rs.reviewed_by
       WHERE rs.review_id = $1
       ORDER BY rs.created_at ASC`,
      [req.params.id]
    );

    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = ['Document Name,AI Decision,Final Decision,Overridden,Reviewed By,Reviewed At,Confidence,Reason'];
    for (const row of result.rows) {
      const confidence = row.extracted_data?.confidence || '';
      const overridden = row.reviewed_at ? 'yes' : 'no';
      const reviewedAt = row.reviewed_at ? new Date(row.reviewed_at).toISOString() : '';
      rows.push([
        escape(row.doc_name),
        escape(row.ai_decision || row.decision),
        escape(row.decision),
        overridden,
        escape(row.reviewer_name || ''),
        reviewedAt,
        confidence,
        escape(row.reason),
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="review-${req.params.id}.csv"`);
    return res.send(rows.join('\n'));
  } catch (err) {
    console.error('exportScreenings error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

// ─── Extraction Tables ────────────────────────────────────────────

exports.createExtractionTable = async (req, res) => {
  try {
    const { name, columns, workspace_id } = req.body;
    if (!name || !columns || columns.length === 0) {
      return res.status(400).json({ error: true, message: 'Name and columns required' });
    }
    const columnText = columns.flatMap((c) => [c && c.name, c && c.description]).filter(Boolean);
    if (detectInjection(name) || columnText.some(detectInjection)) {
      return res.status(400).json({ error: true, message: KIND_REFUSAL, code: 'PROMPT_REJECTED' });
    }

    // Free-tier one-time gate: 1 extraction table, ever.
    const { account, blocked } = await checkOneTimeQuota(req, 'extraction');
    if (blocked) {
      return res.status(403).json({
        error: true,
        code: 'UPGRADE_REQUIRED',
        message: 'The Free plan includes 1 data extraction table. Upgrade for unlimited extraction.',
      });
    }

    const result = await db.query(
      'INSERT INTO extraction_tables (user_id, workspace_id, name, columns) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.id, workspace_id || null, name, JSON.stringify(columns)]
    );
    await recordOneTimeUse(req, 'extraction', account);
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('createExtractionTable error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.listExtractionTables = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT et.*, COUNT(DISTINCT er.document_id)::int AS doc_count
       FROM extraction_tables et
       LEFT JOIN extraction_rows er ON er.table_id = et.id
       WHERE et.user_id = $1
       GROUP BY et.id
       ORDER BY et.created_at DESC`,
      [req.user.id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('listExtractionTables error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.getExtractionTable = async (req, res) => {
  try {
    const tableResult = await db.query(
      'SELECT * FROM extraction_tables WHERE id = $1 AND user_id = $2',
      [req.params.tableId, req.user.id]
    );
    if (tableResult.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Table not found' });
    }

    const rowsResult = await db.query(
      `SELECT er.id, er.document_id, er.data, d.original_name AS doc_name
       FROM extraction_rows er
       JOIN documents d ON er.document_id = d.id
       WHERE er.table_id = $1
       ORDER BY er.created_at ASC`,
      [req.params.tableId]
    );

    return res.json({ table: tableResult.rows[0], rows: rowsResult.rows });
  } catch (err) {
    console.error('getExtractionTable error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.extractDocument = async (req, res) => {
  try {
    const tableResult = await db.query(
      'SELECT * FROM extraction_tables WHERE id = $1 AND user_id = $2',
      [req.params.tableId, req.user.id]
    );
    if (tableResult.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Table not found' });
    }
    const table = tableResult.rows[0];

    const docResult = await db.query(
      "SELECT id FROM documents WHERE id = $1 AND user_id = $2 AND status = 'ready'",
      [req.params.docId, req.user.id]
    );
    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Document not found or not ready' });
    }

    const fastapiRes = await axios.post(`${process.env.FASTAPI_URL}/extract-columns`, {
      document_id: req.params.docId,
      user_id: req.user.id,
      columns: table.columns,
    }, { timeout: 90000 });

    const { data } = fastapiRes.data;

    const existing = await db.query(
      'SELECT id FROM extraction_rows WHERE table_id = $1 AND document_id = $2',
      [req.params.tableId, req.params.docId]
    );

    let row;
    if (existing.rows.length > 0) {
      const updated = await db.query(
        'UPDATE extraction_rows SET data=$1 WHERE id=$2 RETURNING *',
        [JSON.stringify(data), existing.rows[0].id]
      );
      row = updated.rows[0];
    } else {
      const inserted = await db.query(
        'INSERT INTO extraction_rows (table_id, document_id, data) VALUES ($1,$2,$3) RETURNING *',
        [req.params.tableId, req.params.docId, JSON.stringify(data)]
      );
      row = inserted.rows[0];
    }

    return res.json({ ...row, data });
  } catch (err) {
    // Relay a rate-limit (e.g. Groq daily token cap) as 429 with its message so
    // the client can show "try again later" instead of an opaque server error.
    const status = err.response?.status;
    if (status === 429 || status === 502) {
      const message = err.response?.data?.detail || 'AI service is temporarily unavailable. Please try again later.';
      return res.status(status).json({ error: true, message });
    }
    console.error('extractDocument error:', err.message || err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.extractAll = async (req, res) => {
  try {
    const { document_ids } = req.body;
    if (!document_ids || document_ids.length === 0) {
      return res.status(400).json({ error: true, message: 'document_ids required' });
    }
    if (document_ids.length > 20) {
      return res.status(400).json({ error: true, message: 'Maximum 20 documents per extraction job' });
    }

    const tableResult = await db.query(
      'SELECT * FROM extraction_tables WHERE id = $1 AND user_id = $2',
      [req.params.tableId, req.user.id]
    );
    if (tableResult.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Table not found' });
    }
    const table = tableResult.rows[0];

    const extractOne = async (docId) => {
      const fastapiRes = await axios.post(`${process.env.FASTAPI_URL}/extract-columns`, {
        document_id: docId,
        user_id: req.user.id,
        columns: table.columns,
      }, { timeout: 90000 });

      const { data } = fastapiRes.data;

      const existing = await db.query(
        'SELECT id FROM extraction_rows WHERE table_id = $1 AND document_id = $2',
        [req.params.tableId, docId]
      );

      if (existing.rows.length > 0) {
        await db.query('UPDATE extraction_rows SET data=$1 WHERE id=$2', [JSON.stringify(data), existing.rows[0].id]);
      } else {
        await db.query(
          'INSERT INTO extraction_rows (table_id, document_id, data) VALUES ($1,$2,$3)',
          [req.params.tableId, docId, JSON.stringify(data)]
        );
      }
      return { document_id: docId, data };
    };

    const settled = await Promise.allSettled(document_ids.map(extractOne));

    const rows = settled.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { document_id: document_ids[i], error: r.reason?.message || 'Failed' }
    );
    const completed = settled.filter(r => r.status === 'fulfilled').length;

    return res.json({ rows, completed, total: document_ids.length });
  } catch (err) {
    console.error('extractAll error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

// Human-in-the-loop correction of a single extracted cell. Merges the edited
// value into the row's `data` JSONB and marks it as verified by a person so the
// confidence styling and CSV export reflect the override.
exports.updateExtractionRow = async (req, res) => {
  try {
    const { column, value } = req.body;
    if (!column || typeof value !== 'string') {
      return res.status(400).json({ error: true, message: 'column and value required' });
    }

    // Ownership is enforced via the parent table's user_id.
    const rowResult = await db.query(
      `SELECT er.id, er.data
       FROM extraction_rows er
       JOIN extraction_tables et ON er.table_id = et.id
       WHERE er.id = $1 AND er.table_id = $2 AND et.user_id = $3`,
      [req.params.rowId, req.params.tableId, req.user.id]
    );
    if (rowResult.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Row not found' });
    }

    const data = rowResult.rows[0].data || {};
    const existingCell = data[column] || {};
    data[column] = {
      ...existingCell,
      value: value.trim() || 'Not reported',
      confidence: 'verified',
      edited: true,
    };

    const updated = await db.query(
      'UPDATE extraction_rows SET data=$1 WHERE id=$2 RETURNING id, document_id, data',
      [JSON.stringify(data), req.params.rowId]
    );

    return res.json(updated.rows[0]);
  } catch (err) {
    console.error('updateExtractionRow error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.exportExtractionTable = async (req, res) => {
  try {
    const tableResult = await db.query(
      'SELECT * FROM extraction_tables WHERE id = $1 AND user_id = $2',
      [req.params.tableId, req.user.id]
    );
    if (tableResult.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Table not found' });
    }
    const table = tableResult.rows[0];
    const columns = table.columns;

    const rowsResult = await db.query(
      `SELECT er.data, d.original_name AS doc_name
       FROM extraction_rows er
       JOIN documents d ON er.document_id = d.id
       WHERE er.table_id = $1
       ORDER BY er.created_at ASC`,
      [req.params.tableId]
    );

    const escape = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
    const colHeaders = columns.map(c => c.name);
    const header = ['Document', ...colHeaders, ...colHeaders.map(n => `${n} (confidence)`)].map(escape).join(',');
    const csvRows = [header];

    for (const row of rowsResult.rows) {
      const data = row.data || {};
      const values = colHeaders.map(col => escape(data[col]?.value || 'Not reported'));
      const confidences = colHeaders.map(col => escape(data[col]?.confidence || ''));
      csvRows.push([escape(row.doc_name), ...values, ...confidences].join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="extraction-${req.params.tableId}.csv"`);
    return res.send(csvRows.join('\n'));
  } catch (err) {
    console.error('exportExtractionTable error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};
