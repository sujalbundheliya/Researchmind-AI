const jwt = require('jsonwebtoken');
const db = require('../config/db');
const mailer = require('../services/mailer');

exports.createWorkspace = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: true, message: 'Workspace name required' });
    }
    if (name.trim().length > 100) {
      return res.status(400).json({ error: true, message: 'Workspace name must be 100 characters or fewer' });
    }

    const ws = await db.query(
      'INSERT INTO workspaces (name, owner_id) VALUES ($1, $2) RETURNING *',
      [name.trim(), req.user.id]
    );
    await db.query(
      "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
      [ws.rows[0].id, req.user.id]
    );

    return res.status(201).json(ws.rows[0]);
  } catch (err) {
    console.error('createWorkspace error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.listWorkspaces = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT w.*, wm.role,
              COUNT(DISTINCT wm2.user_id)::int AS member_count,
              COUNT(DISTINCT d.id)::int AS doc_count
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $1
       LEFT JOIN workspace_members wm2 ON wm2.workspace_id = w.id
       LEFT JOIN documents d ON d.workspace_id = w.id
       GROUP BY w.id, wm.role
       ORDER BY w.created_at DESC`,
      [req.user.id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('listWorkspaces error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.getWorkspace = async (req, res) => {
  try {
    const memberCheck = await db.query(
      'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: true, message: 'Not a member of this workspace' });
    }

    const wsResult = await db.query(
      `SELECT w.*, COUNT(DISTINCT d.id)::int AS doc_count
       FROM workspaces w
       LEFT JOIN documents d ON d.workspace_id = w.id
       WHERE w.id = $1
       GROUP BY w.id`,
      [req.params.id]
    );
    if (wsResult.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Workspace not found' });
    }

    const membersResult = await db.query(
      `SELECT wm.user_id, wm.role, wm.joined_at, u.name, u.email
       FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1
       ORDER BY wm.joined_at ASC`,
      [req.params.id]
    );

    return res.json({
      ...wsResult.rows[0],
      your_role: memberCheck.rows[0].role,
      members: membersResult.rows,
    });
  } catch (err) {
    console.error('getWorkspace error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.updateWorkspace = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: true, message: 'Name required' });
    if (name.trim().length > 100) return res.status(400).json({ error: true, message: 'Workspace name must be 100 characters or fewer' });

    const result = await db.query(
      'UPDATE workspaces SET name=$1 WHERE id=$2 AND owner_id=$3 RETURNING *',
      [name.trim(), req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Workspace not found or not owner' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('updateWorkspace error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.deleteWorkspace = async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM workspaces WHERE id=$1 AND owner_id=$2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Workspace not found or not owner' });
    }
    return res.json({ message: 'Workspace deleted' });
  } catch (err) {
    console.error('deleteWorkspace error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.inviteMember = async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email || !role || !['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ error: true, message: 'email and role (editor|viewer) required' });
    }

    // Check not already a member
    const userResult = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userResult.rows.length > 0) {
      const alreadyMember = await db.query(
        'SELECT id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
        [req.params.id, userResult.rows[0].id]
      );
      if (alreadyMember.rows.length > 0) {
        return res.status(400).json({ error: true, message: 'User is already a member' });
      }
    }

    const token = jwt.sign(
      { workspace_id: req.params.id, email, role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    await db.query(
      `INSERT INTO workspace_invites (workspace_id, invited_email, role, token, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
      [req.params.id, email, role, token]
    );

    const inviteLink = `${process.env.FRONTEND_URL}/join/${token}`;

    // Email the invite (best-effort): the row + link above are the source of
    // truth, so a mail failure or unconfigured SMTP must not fail the request.
    // email_sent lets the UI say "we emailed them" vs "copy this link".
    let emailSent = false;
    try {
      const wsRow = await db.query('SELECT name FROM workspaces WHERE id=$1', [req.params.id]);
      emailSent = await mailer.sendWorkspaceInvite({
        to: email,
        inviterName: req.user.name,
        workspaceName: wsRow.rows[0]?.name,
        role,
        inviteLink,
      });
    } catch (mailErr) {
      console.error('inviteMember email failed:', mailErr.message);
    }

    return res.json({ invite_link: inviteLink, token, email_sent: emailSent });
  } catch (err) {
    console.error('inviteMember error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.joinWorkspace = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: true, message: 'Token required' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ error: true, message: 'Invalid or expired invite token' });
    }

    const { workspace_id, email, role } = decoded;

    // Check token exists and not used
    const inviteResult = await db.query(
      'SELECT id, used FROM workspace_invites WHERE token=$1',
      [token]
    );
    if (inviteResult.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Invite not found' });
    }
    if (inviteResult.rows[0].used) {
      return res.status(400).json({ error: true, message: 'Invite already used' });
    }

    // Verify email matches
    if (req.user.email !== email) {
      return res.status(403).json({
        error: true,
        message: `This invite was sent to ${email}, not your account`,
      });
    }

    // Check not already a member
    const existing = await db.query(
      'SELECT id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
      [workspace_id, req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: true, message: 'Already a member of this workspace' });
    }

    await db.query(
      'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)',
      [workspace_id, req.user.id, role]
    );
    await db.query('UPDATE workspace_invites SET used=true WHERE token=$1', [token]);

    const wsResult = await db.query('SELECT * FROM workspaces WHERE id=$1', [workspace_id]);
    return res.json({ ...wsResult.rows[0], your_role: role });
  } catch (err) {
    console.error('joinWorkspace error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.removeMember = async (req, res) => {
  try {
    if (req.params.userId === req.user.id) {
      return res.status(400).json({ error: true, message: 'Owner cannot remove themselves' });
    }
    await db.query(
      'DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
      [req.params.id, req.params.userId]
    );
    return res.json({ message: 'Member removed' });
  } catch (err) {
    console.error('removeMember error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.updateMemberRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!role || !['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ error: true, message: "Invalid role. Must be 'editor' or 'viewer'" });
    }
    if (req.params.userId === req.user.id) {
      return res.status(400).json({ error: true, message: 'Cannot change your own role' });
    }
    const result = await db.query(
      'UPDATE workspace_members SET role=$1 WHERE workspace_id=$2 AND user_id=$3 RETURNING *',
      [role, req.params.id, req.params.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Member not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('updateMemberRole error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};
