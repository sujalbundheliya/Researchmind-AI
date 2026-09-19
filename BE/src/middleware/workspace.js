const db = require('../config/db');

const ROLE_LEVELS = { owner: 3, editor: 2, viewer: 1 };

function checkWorkspaceMember(minRole = 'viewer') {
  return async (req, res, next) => {
    try {
      const workspaceId =
        req.params.workspaceId ||
        req.params.id ||
        req.body.workspace_id ||
        req.query.workspace_id;

      if (!workspaceId) {
        return res.status(400).json({ error: true, message: 'workspace_id required' });
      }

      const result = await db.query(
        'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
        [workspaceId, req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(403).json({ error: true, message: 'Not a member of this workspace' });
      }

      const role = result.rows[0].role;
      if (ROLE_LEVELS[role] < ROLE_LEVELS[minRole]) {
        return res.status(403).json({
          error: true,
          message: `Insufficient role. Required: ${minRole}, yours: ${role}`,
        });
      }

      req.workspaceRole = role;
      req.workspaceId = workspaceId;
      next();
    } catch (err) {
      console.error('checkWorkspaceMember error:', err);
      return res.status(500).json({ error: true, message: 'Server error' });
    }
  };
}

module.exports = { checkWorkspaceMember };
