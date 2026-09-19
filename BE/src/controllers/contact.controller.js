const db = require('../config/db');
const mailer = require('../services/mailer');
const { isValidUUID } = require('../utils/validate');

const STATUSES = ['new', 'read', 'replied', 'archived'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LIMITS = { name: 100, email: 254, subject: 200, message: 5000 };

/**
 * POST /api/contact — public, no auth.
 *
 * The DB insert is the contract: we return success once the row is written,
 * then attempt email delivery. If SMTP is unconfigured or fails, the message is
 * still readable in the admin console, so nothing is ever lost.
 */
exports.submit = async (req, res) => {
  try {
    const { name, email, subject, message, website } = req.body;

    // Honeypot: a real browser leaves this hidden field empty; bots fill it.
    // Return 200 so the bot sees success and doesn't retry with a new strategy.
    if (website) {
      return res.status(200).json({ message: 'Thanks — your message has been received.' });
    }

    const missing = ['name', 'email', 'subject', 'message'].filter((f) => !req.body[f]?.trim());
    if (missing.length > 0) {
      return res.status(400).json({ error: true, message: 'Name, email, subject and message are all required.' });
    }
    for (const [field, max] of Object.entries(LIMITS)) {
      if (req.body[field].length > max) {
        return res.status(400).json({ error: true, message: `${field[0].toUpperCase() + field.slice(1)} must be ${max} characters or fewer.` });
      }
    }
    if (!EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: true, message: 'Please enter a valid email address.' });
    }

    // Attribute the message when the sender happens to be logged in. `auth` is
    // not applied to this route, so req.user is only set by optionalAuth.
    const userId = req.user?.id || null;

    const result = await db.query(
      `INSERT INTO contact_messages (user_id, name, email, subject, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [userId, name.trim(), email.trim(), subject.trim(), message.trim()]
    );
    const row = result.rows[0];

    const sent = await mailer.sendContactMessage({
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim(),
      message: message.trim(),
    });
    if (sent) {
      await db.query('UPDATE contact_messages SET email_sent = TRUE WHERE id = $1', [row.id]);
    }

    return res.status(201).json({
      message: 'Thanks — your message has been received. We usually reply within 1–2 business days.',
      id: row.id,
    });
  } catch (err) {
    console.error('contact.submit error:', err);
    return res.status(500).json({ error: true, message: 'Could not send your message. Please try again.' });
  }
};

// ─── Admin inbox (mounted under /api/admin, super-admin guarded) ──────

// GET /api/admin/contact-messages?status=&page=&limit=
exports.list = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;
    const status = req.query.status;

    const where = status && STATUSES.includes(status) ? 'WHERE cm.status = $1' : '';
    const params = where ? [status] : [];

    const [rows, total, counts] = await Promise.all([
      db.query(
        `SELECT cm.*, u.name AS handled_by_name
         FROM contact_messages cm
         LEFT JOIN users u ON u.id = cm.handled_by
         ${where}
         ORDER BY cm.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      db.query(`SELECT COUNT(*)::int AS total FROM contact_messages cm ${where}`, params),
      db.query('SELECT status, COUNT(*)::int AS count FROM contact_messages GROUP BY status'),
    ]);

    const byStatus = { new: 0, read: 0, replied: 0, archived: 0 };
    counts.rows.forEach((r) => { byStatus[r.status] = r.count; });

    return res.json({ messages: rows.rows, total: total.rows[0].total, page, limit, byStatus });
  } catch (err) {
    console.error('contact.list error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

// PATCH /api/admin/contact-messages/:id  { status }
exports.updateStatus = async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ error: true, message: 'Invalid message ID' });
    }
    const { status } = req.body;
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: true, message: `Status must be one of: ${STATUSES.join(', ')}` });
    }

    // handled_at/handled_by record who moved it out of the unread state; going
    // back to 'new' clears them so the inbox reads honestly.
    const isHandled = status !== 'new';
    const result = await db.query(
      `UPDATE contact_messages
       SET status = $1,
           handled_at = ${isHandled ? 'NOW()' : 'NULL'},
           handled_by = ${isHandled ? '$3' : 'NULL'}
       WHERE id = $2 RETURNING *`,
      isHandled ? [status, req.params.id, req.user.id] : [status, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Message not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('contact.updateStatus error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

// DELETE /api/admin/contact-messages/:id
exports.remove = async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ error: true, message: 'Invalid message ID' });
    }
    const result = await db.query('DELETE FROM contact_messages WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Message not found' });
    }
    return res.json({ message: 'Message deleted' });
  } catch (err) {
    console.error('contact.remove error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};
