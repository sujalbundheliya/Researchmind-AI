/**
 * Plan / role gating middleware.
 *
 * `ensureAccount` loads the caller's plan, role and usage counters once per
 * request and caches them on `req.account`. Controllers that need to enforce
 * Free-tier one-time limits (create review / extraction table / draft) call it
 * directly; route-level `requirePlan` / `requireSuperAdmin` reuse the cache.
 *
 * Super admins bypass every plan gate.
 */
const db = require('../config/db');

const ACCOUNT_COLUMNS = `
  id, role, plan, plan_status, plan_renews_at,
  stripe_customer_id, stripe_subscription_id,
  lifetime_uploads, extractions_used, reviews_used, drafts_used,
  storage_used_bytes, storage_limit_bytes
`;

/**
 * Load and cache the account row for the authenticated user.
 * Requires `auth` middleware to have run first (sets req.user.id).
 * Returns the account object, or null if the user no longer exists.
 */
async function ensureAccount(req) {
  if (req.account) return req.account;
  if (!req.user?.id) return null;
  const result = await db.query(
    `SELECT ${ACCOUNT_COLUMNS} FROM users WHERE id = $1`,
    [req.user.id]
  );
  req.account = result.rows[0] || null;
  return req.account;
}

const isSuperAdmin = (account) => account?.role === 'super_admin';

/**
 * Restrict a route to the given plan(s). Super admins always pass.
 *   router.use(auth, requirePlan('pro'))
 */
function requirePlan(...plans) {
  return async (req, res, next) => {
    try {
      const account = await ensureAccount(req);
      if (!account) {
        return res.status(401).json({ error: true, message: 'Authentication required' });
      }
      if (isSuperAdmin(account) || plans.includes(account.plan)) {
        return next();
      }
      const label = plans.includes('individual') ? 'a paid plan' : 'a Pro plan';
      return res.status(403).json({
        error: true,
        code: 'UPGRADE_REQUIRED',
        requiredPlan: plans[plans.length - 1],
        message: `This feature requires ${label}. Upgrade to continue.`,
      });
    } catch (err) {
      console.error('requirePlan error:', err);
      return res.status(500).json({ error: true, message: 'Server error' });
    }
  };
}

/**
 * Hard-lock a route: the feature is not available on ANY plan/role yet.
 * Unlike requirePlan, there is no super-admin bypass — the capability simply
 * does not exist in this milestone (e.g. Workspaces, which ships in M4).
 */
function lockedFeature(name = 'This feature') {
  return (req, res, next) => {
    return res.status(403).json({
      error: true,
      code: 'FEATURE_LOCKED',
      message: `${name} is not available yet.`,
    });
  };
}

// Maps a one-time feature name to its monotonic usage counter column.
const ONE_TIME_COLUMNS = {
  extraction: 'extractions_used',
  review: 'reviews_used',
  draft: 'drafts_used',
};

/**
 * Free-tier one-time feature gate. Returns { account, blocked }. `blocked` is
 * true when a Free user has already spent their single allowance for `feature`.
 * Paid plans and super admins are never blocked. Call at the top of a create
 * handler, then call recordOneTimeUse after the create succeeds.
 */
async function checkOneTimeQuota(req, feature) {
  const account = await ensureAccount(req);
  const column = ONE_TIME_COLUMNS[feature];
  const blocked =
    !!account &&
    account.role !== 'super_admin' &&
    account.plan === 'free' &&
    Number(account[column]) >= 1;
  return { account, blocked };
}

/**
 * Increment the monotonic usage counter for a Free user after a successful
 * create. No-op for paid plans / super admins. The counter is never
 * decremented (deleting the resource does not refund the free allowance).
 */
async function recordOneTimeUse(req, feature, account) {
  if (!account || account.role === 'super_admin' || account.plan !== 'free') return;
  const column = ONE_TIME_COLUMNS[feature]; // whitelisted, safe to interpolate
  await db.query(`UPDATE users SET ${column} = ${column} + 1 WHERE id = $1`, [req.user.id]);
}

/** Restrict a route to super admins only. */
async function requireSuperAdmin(req, res, next) {
  try {
    const account = await ensureAccount(req);
    if (!account) {
      return res.status(401).json({ error: true, message: 'Authentication required' });
    }
    if (!isSuperAdmin(account)) {
      return res.status(403).json({ error: true, code: 'FORBIDDEN', message: 'Super admin access required' });
    }
    return next();
  } catch (err) {
    console.error('requireSuperAdmin error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
}

module.exports = {
  ensureAccount,
  requirePlan,
  lockedFeature,
  requireSuperAdmin,
  isSuperAdmin,
  checkOneTimeQuota,
  recordOneTimeUse,
  ACCOUNT_COLUMNS,
};
