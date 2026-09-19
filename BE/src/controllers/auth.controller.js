const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Columns safe to return to the client (everything except password/google_id).
// Shared by register / login / me / profile so the frontend always has plan,
// usage and profile state from a single shape.
const PUBLIC_USER_COLUMNS = `id, email, name, role, plan, plan_status, plan_renews_at,
  lifetime_uploads, extractions_used, reviews_used, drafts_used,
  storage_used_bytes, storage_limit_bytes,
  avatar_url, institution, bio, created_at, updated_at`;

function setTokenCookie(res, user) {
  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: true, message: 'Name, email, and password are required' });
    }
    if (name.length > 100) {
      return res.status(400).json({ error: true, message: 'Name must be 100 characters or fewer' });
    }
    if (email.length > 254) {
      return res.status(400).json({ error: true, message: 'Email must be 254 characters or fewer' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: true, message: 'Password must be at least 8 characters' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: true, message: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const result = await db.query(
      `INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING ${PUBLIC_USER_COLUMNS}`,
      [name, email, hashed]
    );

    const user = result.rows[0];
    setTokenCookie(res, user);
    return res.status(201).json(user);
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: true, message: 'Email and password are required' });
    }

    const result = await db.query(
      `SELECT ${PUBLIC_USER_COLUMNS}, password FROM users WHERE email = $1`,
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: true, message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    if (!user.password) {
      return res.status(401).json({ error: true, message: 'This account uses Google sign-in. Please use the "Continue with Google" button.' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: true, message: 'Invalid credentials' });
    }

    setTokenCookie(res, user);
    const { password: _pw, ...safeUser } = user;
    return res.json(safeUser);
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.logout = (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax' });
  return res.json({ message: 'Logged out' });
};

exports.googleCallback = (req, res) => {
  setTokenCookie(res, req.user);
  res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
};

exports.me = async (req, res) => {
  try {
    // has_password / has_google drive the Security tab: a Google-only account
    // shows "set a password" instead of "change password". The values are
    // booleans — the hash and the Google id itself are never exposed.
    const result = await db.query(
      `SELECT ${PUBLIC_USER_COLUMNS},
              (password IS NOT NULL) AS has_password,
              (google_id IS NOT NULL) AS has_google
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('me error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

// ─── Profile ──────────────────────────────────────────────────────

/**
 * PATCH /api/auth/profile { name?, institution?, bio? }
 *
 * Email is deliberately NOT editable here: it keys the Stripe customer and the
 * Google OAuth identity, so changing it in place would silently detach both.
 */
exports.updateProfile = async (req, res) => {
  try {
    const { name, institution, bio } = req.body;

    const updates = [];
    const params = [];
    let i = 1;

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return res.status(400).json({ error: true, message: 'Name cannot be empty' });
      if (trimmed.length > 100) return res.status(400).json({ error: true, message: 'Name must be 100 characters or fewer' });
      updates.push(`name = $${i++}`); params.push(trimmed);
    }
    if (institution !== undefined) {
      const trimmed = String(institution).trim();
      if (trimmed.length > 200) return res.status(400).json({ error: true, message: 'Institution must be 200 characters or fewer' });
      updates.push(`institution = $${i++}`); params.push(trimmed || null);
    }
    if (bio !== undefined) {
      const trimmed = String(bio).trim();
      if (trimmed.length > 500) return res.status(400).json({ error: true, message: 'Bio must be 500 characters or fewer' });
      updates.push(`bio = $${i++}`); params.push(trimmed || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: true, message: 'Nothing to update' });
    }

    updates.push('updated_at = NOW()');
    params.push(req.user.id);

    const result = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${i} RETURNING ${PUBLIC_USER_COLUMNS}`,
      params
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }

    // The JWT embeds the display name, so refresh it or the sidebar keeps
    // showing the old one until the cookie expires.
    setTokenCookie(res, result.rows[0]);
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('updateProfile error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

/**
 * POST /api/auth/change-password { current_password?, new_password }
 *
 * Google-only accounts (password IS NULL) may SET a first password without
 * supplying a current one — that is how they gain email/password sign-in
 * alongside Google. Accounts that already have a password must prove it.
 */
exports.changePassword = async (req, res) => {
  try {
    const { current_password: currentPassword, new_password: newPassword } = req.body;

    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: true, message: 'New password must be at least 8 characters' });
    }

    const result = await db.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    const existingHash = result.rows[0].password;

    if (existingHash) {
      if (!currentPassword) {
        return res.status(400).json({ error: true, message: 'Your current password is required' });
      }
      const valid = await bcrypt.compare(currentPassword, existingHash);
      if (!valid) {
        return res.status(401).json({ error: true, message: 'Current password is incorrect' });
      }
      if (await bcrypt.compare(newPassword, existingHash)) {
        return res.status(400).json({ error: true, message: 'New password must be different from your current one' });
      }
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await db.query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hashed, req.user.id]);

    return res.json({
      message: existingHash ? 'Password updated.' : 'Password set — you can now sign in with your email too.',
    });
  } catch (err) {
    console.error('changePassword error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

/**
 * GET /api/auth/usage — activity counts for the profile Usage tab.
 * One round trip; each count is scoped to the caller.
 */
exports.getUsage = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM documents         WHERE user_id = $1) AS documents,
         (SELECT COUNT(*)::int FROM documents         WHERE user_id = $1 AND status = 'ready')  AS documents_ready,
         (SELECT COUNT(*)::int FROM documents         WHERE user_id = $1 AND status = 'failed') AS documents_failed,
         (SELECT COUNT(*)::int FROM systematic_reviews WHERE user_id = $1) AS reviews,
         (SELECT COUNT(*)::int FROM extraction_tables WHERE user_id = $1) AS extraction_tables,
         (SELECT COUNT(*)::int FROM ai_drafts         WHERE user_id = $1) AS drafts,
         (SELECT COUNT(*)::int FROM chat_sessions     WHERE user_id = $1) AS chat_sessions`,
      [req.user.id]
    );
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('getUsage error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

/**
 * DELETE /api/auth/account { password? }
 *
 * Every user-owned table is ON DELETE CASCADE, so removing the row clears the
 * database in one statement. What cascade does NOT do is remove the PDFs from
 * disk, so we collect the paths first and unlink them after the row is gone.
 *
 * Note: workspaces.owner_id also cascades — deleting an owner removes their
 * workspaces and everything inside them, including other members' documents.
 * The UI warns about this before calling.
 */
exports.deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;

    const userRes = await db.query(
      'SELECT password, stripe_subscription_id, role FROM users WHERE id = $1',
      [req.user.id]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    const user = userRes.rows[0];

    // Password-backed accounts must confirm. Google-only accounts have nothing
    // to compare against, so the typed confirmation in the UI is the gate.
    if (user.password) {
      if (!password) {
        return res.status(400).json({ error: true, message: 'Your password is required to delete your account' });
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: true, message: 'Password is incorrect' });
      }
    }

    // Refuse to strand the system without an administrator.
    if (user.role === 'super_admin') {
      const count = await db.query("SELECT COUNT(*)::int AS c FROM users WHERE role = 'super_admin'");
      if (count.rows[0].c <= 1) {
        return res.status(400).json({
          error: true,
          message: 'You are the last super admin. Promote another account before deleting this one.',
        });
      }
    }

    // Stop billing before the customer record loses its owner.
    if (user.stripe_subscription_id) {
      try {
        const stripeService = require('../services/stripe.service');
        await stripeService.cancelSubscriptionNow(user.stripe_subscription_id);
      } catch (stripeErr) {
        // Don't strand the user in a half-deleted state over a billing hiccup —
        // log loudly so the subscription can be cancelled by hand.
        console.error('deleteAccount: Stripe cancel failed for', req.user.id, stripeErr.message);
      }
    }

    const files = await db.query('SELECT file_path FROM documents WHERE user_id = $1', [req.user.id]);

    await db.query('DELETE FROM users WHERE id = $1', [req.user.id]);

    for (const row of files.rows) {
      try { fs.unlinkSync(row.file_path); } catch { /* already gone — fine */ }
    }

    res.clearCookie('token', { httpOnly: true, sameSite: 'lax' });
    return res.json({ message: 'Your account and all associated data have been deleted.' });
  } catch (err) {
    console.error('deleteAccount error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};
