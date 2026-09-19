const fs = require('fs');
const axios = require('axios');
const db = require('../config/db');
const { PLANS, ROLES, getPlan } = require('../config/plans');
const { isValidUUID } = require('../utils/validate');
const aiService = require('../services/ai.service');
const mailer = require('../services/mailer');

const USER_LIST_COLUMNS = `id, name, email, role, plan, plan_status, plan_renews_at,
  lifetime_uploads, extractions_used, reviews_used, drafts_used,
  storage_used_bytes, storage_limit_bytes, created_at`;

/**
 * Append to the admin audit trail. Never throws — an audit write failing must
 * not roll back the action the admin actually performed, but it does get logged
 * loudly so the gap is visible.
 */
async function audit(req, action, { targetType = null, targetId = null, details = null } = {}) {
  try {
    await db.query(
      `INSERT INTO admin_audit_log (actor_id, actor_email, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.id, req.user.email || null, action, targetType, targetId, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('admin audit write failed:', action, err.message);
  }
}

// GET /api/admin/users?search=&page=&limit=
exports.listUsers = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();

    const where = search ? 'WHERE name ILIKE $1 OR email ILIKE $1' : '';
    const params = search ? [`%${search}%`] : [];

    const totalRes = await db.query(`SELECT COUNT(*)::int AS total FROM users ${where}`, params);
    const usersRes = await db.query(
      `SELECT ${USER_LIST_COLUMNS} FROM users ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return res.json({ users: usersRes.rows, total: totalRes.rows[0].total, page, limit });
  } catch (err) {
    console.error('admin.listUsers error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

// GET /api/admin/stats
exports.getStats = async (req, res) => {
  try {
    const [planRes, roleRes, totalUsers, docStats, signups, content, messages] = await Promise.all([
      db.query('SELECT plan, COUNT(*)::int AS count FROM users GROUP BY plan'),
      db.query('SELECT role, COUNT(*)::int AS count FROM users GROUP BY role'),
      db.query('SELECT COUNT(*)::int AS c FROM users'),
      db.query(`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'ready')::int      AS ready,
          COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
          COUNT(*) FILTER (WHERE status = 'failed')::int     AS failed,
          COUNT(*) FILTER (WHERE source_url IS NOT NULL)::int AS from_url,
          COALESCE(SUM(file_size_bytes), 0)::bigint          AS total_bytes
        FROM documents`),
      db.query(`SELECT
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int  AS last_7d,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS last_30d
        FROM users`),
      db.query(`SELECT
          (SELECT COUNT(*)::int FROM systematic_reviews) AS reviews,
          (SELECT COUNT(*)::int FROM extraction_tables)  AS extraction_tables,
          (SELECT COUNT(*)::int FROM ai_drafts)          AS drafts,
          (SELECT COUNT(*)::int FROM chat_sessions)      AS chat_sessions`),
      db.query("SELECT COUNT(*) FILTER (WHERE status = 'new')::int AS unread, COUNT(*)::int AS total FROM contact_messages"),
    ]);

    const byPlan = { free: 0, individual: 0, pro: 0 };
    planRes.rows.forEach((r) => { byPlan[r.plan] = r.count; });
    const byRole = {};
    roleRes.rows.forEach((r) => { byRole[r.role] = r.count; });

    const docs = docStats.rows[0];

    return res.json({
      totalUsers: totalUsers.rows[0].c,
      totalDocuments: docs.total,
      byPlan,
      byRole,
      mrr: byPlan.individual * getPlan('individual').price + byPlan.pro * getPlan('pro').price,
      documents: {
        total: docs.total,
        ready: docs.ready,
        processing: docs.processing,
        failed: docs.failed,
        fromUrl: docs.from_url,
        totalBytes: Number(docs.total_bytes),
      },
      signups: signups.rows[0],
      content: content.rows[0],
      messages: messages.rows[0],
    });
  } catch (err) {
    console.error('admin.getStats error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

// GET /api/admin/users/:id — one user plus their activity totals
exports.getUser = async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ error: true, message: 'Invalid user ID' });
    }
    const userRes = await db.query(
      `SELECT ${USER_LIST_COLUMNS}, institution, bio,
              (password IS NOT NULL) AS has_password,
              (google_id IS NOT NULL) AS has_google
       FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }

    const activity = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM documents          WHERE user_id = $1) AS documents,
         (SELECT COUNT(*)::int FROM systematic_reviews WHERE user_id = $1) AS reviews,
         (SELECT COUNT(*)::int FROM extraction_tables  WHERE user_id = $1) AS extraction_tables,
         (SELECT COUNT(*)::int FROM ai_drafts          WHERE user_id = $1) AS drafts,
         (SELECT COUNT(*)::int FROM chat_sessions      WHERE user_id = $1) AS chat_sessions,
         (SELECT MAX(created_at) FROM documents        WHERE user_id = $1) AS last_upload`,
      [req.params.id]
    );

    return res.json({ ...userRes.rows[0], activity: activity.rows[0] });
  } catch (err) {
    console.error('admin.getUser error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

// ─── Document oversight ───────────────────────────────────────────

// GET /api/admin/documents?search=&status=&page=&limit=
exports.listDocuments = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const status = (req.query.status || '').trim();

    const clauses = [];
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(d.original_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    if (['ready', 'processing', 'failed'].includes(status)) {
      params.push(status);
      clauses.push(`d.status = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const [rows, total] = await Promise.all([
      db.query(
        `SELECT d.id, d.original_name, d.file_size_bytes, d.status, d.page_count,
                d.created_at, d.source_url, d.workspace_id,
                u.email AS owner_email, u.name AS owner_name
         FROM documents d
         LEFT JOIN users u ON u.id = d.user_id
         ${where}
         ORDER BY d.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      db.query(`SELECT COUNT(*)::int AS total FROM documents d LEFT JOIN users u ON u.id = d.user_id ${where}`, params),
    ]);

    return res.json({ documents: rows.rows, total: total.rows[0].total, page, limit });
  } catch (err) {
    console.error('admin.listDocuments error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

// DELETE /api/admin/documents/:id — remove a document on any user's behalf
exports.deleteDocument = async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ error: true, message: 'Invalid document ID' });
    }
    const found = await db.query(
      'SELECT id, original_name, file_path, file_size_bytes, user_id, workspace_id FROM documents WHERE id = $1',
      [req.params.id]
    );
    if (found.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Document not found' });
    }
    const doc = found.rows[0];

    try { fs.unlinkSync(doc.file_path); } catch { /* already gone */ }
    await db.query('DELETE FROM documents WHERE id = $1', [doc.id]);

    // Refund storage to whoever was charged on upload.
    if (doc.workspace_id) {
      await db.query(
        'UPDATE workspaces SET storage_used_bytes = GREATEST(0, storage_used_bytes - $1) WHERE id = $2',
        [doc.file_size_bytes, doc.workspace_id]
      );
    } else {
      await db.query(
        'UPDATE users SET storage_used_bytes = GREATEST(0, storage_used_bytes - $1) WHERE id = $2',
        [doc.file_size_bytes, doc.user_id]
      );
    }

    await audit(req, 'document.delete', {
      targetType: 'document', targetId: doc.id, details: { name: doc.original_name },
    });
    return res.json({ message: 'Document deleted' });
  } catch (err) {
    console.error('admin.deleteDocument error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

/**
 * POST /api/admin/documents/:id/reingest — retry a failed/stuck ingestion.
 *
 * Ingestion fails for real reasons (scanned PDFs with no text layer, an AI
 * container still warming up), and until now recovering meant editing the
 * database by hand. Clears any chunks from the partial run first so a retry
 * cannot duplicate them.
 */
exports.reingestDocument = async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ error: true, message: 'Invalid document ID' });
    }
    const found = await db.query(
      'SELECT id, file_path, user_id, workspace_id, filename, original_name, file_size_bytes FROM documents WHERE id = $1',
      [req.params.id]
    );
    if (found.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Document not found' });
    }
    const doc = found.rows[0];

    if (!fs.existsSync(doc.file_path)) {
      return res.status(409).json({
        error: true,
        code: 'FILE_MISSING',
        message: 'The original file is gone from storage, so it cannot be re-ingested.',
      });
    }

    await db.query('DELETE FROM chunks WHERE document_id = $1', [doc.id]);
    await db.query("UPDATE documents SET status = 'processing' WHERE id = $1", [doc.id]);

    aiService.triggerIngest(doc.id, doc.file_path, doc.user_id, doc.workspace_id, {
      filename: doc.filename,
      originalName: doc.original_name,
      fileSizeBytes: doc.file_size_bytes,
    });

    await audit(req, 'document.reingest', {
      targetType: 'document', targetId: doc.id, details: { name: doc.original_name },
    });
    return res.json({ message: 'Re-ingestion started', id: doc.id, status: 'processing' });
  } catch (err) {
    console.error('admin.reingestDocument error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

// ─── System health ────────────────────────────────────────────────

/**
 * GET /api/admin/system — service reachability plus configuration presence.
 * Reports whether secrets are SET, never what they are.
 */
exports.getSystem = async (req, res) => {
  try {
    const dbStart = Date.now();
    let dbOk = true;
    try { await db.query('SELECT 1'); } catch { dbOk = false; }
    const dbLatency = Date.now() - dbStart;

    const aiStart = Date.now();
    let aiOk = false;
    let aiError = null;
    try {
      const r = await axios.get(`${process.env.FASTAPI_URL}/health`, { timeout: 5000 });
      aiOk = r.status === 200;
    } catch (err) {
      aiError = err.code || err.message;
    }
    const aiLatency = Date.now() - aiStart;

    return res.json({
      database: { ok: dbOk, latencyMs: dbLatency },
      aiService: { ok: aiOk, latencyMs: aiLatency, url: process.env.FASTAPI_URL || null, error: aiError },
      config: {
        stripeSecretKey: !!process.env.STRIPE_SECRET_KEY,
        stripePriceIndividual: !!process.env.STRIPE_PRICE_INDIVIDUAL,
        stripePricePro: !!process.env.STRIPE_PRICE_PRO,
        stripeWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
        googleOauth: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        smtp: mailer.isConfigured(),
        contactEmail: mailer.CONTACT_EMAIL,
        maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 20,
        nodeEnv: process.env.NODE_ENV || 'development',
      },
    });
  } catch (err) {
    console.error('admin.getSystem error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

// GET /api/admin/audit?limit= — recent admin actions
exports.getAuditLog = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const result = await db.query(
      `SELECT id, actor_email, action, target_type, target_id, details, created_at
       FROM admin_audit_log ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return res.json({ entries: result.rows });
  } catch (err) {
    console.error('admin.getAuditLog error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

// PATCH /api/admin/users/:id  { plan?, role? }
exports.updateUser = async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ error: true, message: 'Invalid user ID' });
    }
    const { plan, role } = req.body;
    if (plan !== undefined && !PLANS.includes(plan)) {
      return res.status(400).json({ error: true, message: 'Invalid plan' });
    }
    if (role !== undefined && !ROLES.includes(role)) {
      return res.status(400).json({ error: true, message: 'Invalid role' });
    }
    if (plan === undefined && role === undefined) {
      return res.status(400).json({ error: true, message: 'Nothing to update' });
    }

    // Never demote the last remaining super admin.
    if (role !== undefined && role !== 'super_admin') {
      const target = await db.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
      if (target.rows[0]?.role === 'super_admin') {
        const count = await db.query("SELECT COUNT(*)::int AS c FROM users WHERE role = 'super_admin'");
        if (count.rows[0].c <= 1) {
          return res.status(400).json({ error: true, message: 'Cannot demote the last super admin' });
        }
      }
    }

    const sets = [];
    const params = [];
    let i = 1;
    if (plan !== undefined) {
      sets.push(`plan = $${i++}`); params.push(plan);
      sets.push(`storage_limit_bytes = $${i++}`); params.push(getPlan(plan).storageBytes);
    }
    if (role !== undefined) { sets.push(`role = $${i++}`); params.push(role); }
    params.push(req.params.id);

    const result = await db.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${USER_LIST_COLUMNS}`,
      params
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }

    await audit(req, 'user.update', {
      targetType: 'user',
      targetId: req.params.id,
      details: { email: result.rows[0].email, ...(plan !== undefined && { plan }), ...(role !== undefined && { role }) },
    });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('admin.updateUser error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

// POST /api/admin/users/:id/reset-usage — zero the Free-tier counters (support tool)
exports.resetUsage = async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ error: true, message: 'Invalid user ID' });
    }
    const result = await db.query(
      `UPDATE users SET lifetime_uploads = 0, extractions_used = 0, reviews_used = 0, drafts_used = 0
       WHERE id = $1 RETURNING ${USER_LIST_COLUMNS}`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    await audit(req, 'user.reset_usage', {
      targetType: 'user', targetId: req.params.id, details: { email: result.rows[0].email },
    });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('admin.resetUsage error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

// DELETE /api/admin/users/:id
exports.deleteUser = async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ error: true, message: 'Invalid user ID' });
    }
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: true, message: 'You cannot delete your own account here' });
    }
    const target = await db.query('SELECT role, email FROM users WHERE id = $1', [req.params.id]);
    if (target.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    if (target.rows[0].role === 'super_admin') {
      const count = await db.query("SELECT COUNT(*)::int AS c FROM users WHERE role = 'super_admin'");
      if (count.rows[0].c <= 1) {
        return res.status(400).json({ error: true, message: 'Cannot delete the last super admin' });
      }
    }

    // Every user-owned table cascades, but cascade does not touch the uploads
    // volume — collect the paths before the rows disappear, then unlink.
    const files = await db.query('SELECT file_path FROM documents WHERE user_id = $1', [req.params.id]);

    await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);

    for (const row of files.rows) {
      try { fs.unlinkSync(row.file_path); } catch { /* already gone */ }
    }

    await audit(req, 'user.delete', {
      targetType: 'user',
      targetId: req.params.id,
      details: { email: target.rows[0].email, filesRemoved: files.rows.length },
    });
    return res.json({ message: 'User deleted' });
  } catch (err) {
    // Foreign-key violation — a table referencing users without ON DELETE
    // CASCADE was added since this was written.
    if (err.code === '23503') {
      return res.status(409).json({
        error: true,
        message: 'This user still has linked data that must be removed first.',
      });
    }
    console.error('admin.deleteUser error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};
