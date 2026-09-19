/**
 * Plan / tier configuration — the single source of truth for all gating.
 * Referenced by the gating middleware, billing controller (Stripe webhooks
 * set storage limits from here), and the admin controller.
 */

const MB = 1024 * 1024;
const GB = 1024 * MB;

const PLAN_CONFIG = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    priceLabel: '$0',
    storageBytes: 200 * MB,
    maxLifetimeUploads: 5, // hard lifetime cap — deleting does NOT refund
    oneTimeFeatures: true, // extraction / review / draft limited to 1 use each
    zotero: false,
    workspaces: false,
    features: [
      '5 PDF uploads (lifetime)',
      'Unlimited chat & Q&A',
      '1 data extraction table',
      '1 systematic review',
      '1 AI draft',
    ],
  },
  individual: {
    id: 'individual',
    name: 'Individual',
    price: 15,
    priceLabel: '$15/mo',
    storageBytes: 5 * GB,
    maxLifetimeUploads: Infinity,
    oneTimeFeatures: false,
    zotero: false,
    workspaces: false,
    features: [
      'Unlimited PDF uploads',
      'Unlimited chat & Q&A',
      'Unlimited data extraction',
      'Unlimited systematic reviews',
      'Unlimited AI drafts',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 49,
    priceLabel: '$49/mo',
    storageBytes: 50 * GB,
    maxLifetimeUploads: Infinity,
    oneTimeFeatures: false,
    zotero: true,
    workspaces: false, // locked on every tier until M4 ships
    features: [
      'Everything in Individual',
      'Zotero import',
      'Shared workspaces & collaboration (coming soon)',
      '50 GB storage',
    ],
  },
};

const PLANS = Object.keys(PLAN_CONFIG); // ['free','individual','pro']
const PAID_PLANS = ['individual', 'pro'];
const ROLES = ['user', 'admin', 'super_admin'];

/** Map a Stripe price id (from env) to the plan it grants. */
function planForPriceId(priceId) {
  if (priceId && priceId === process.env.STRIPE_PRICE_INDIVIDUAL) return 'individual';
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO) return 'pro';
  return null;
}

/** Stripe price id for a plan name (used when creating checkout sessions). */
function priceIdForPlan(plan) {
  if (plan === 'individual') return process.env.STRIPE_PRICE_INDIVIDUAL;
  if (plan === 'pro') return process.env.STRIPE_PRICE_PRO;
  return null;
}

function getPlan(plan) {
  return PLAN_CONFIG[plan] || PLAN_CONFIG.free;
}

module.exports = {
  MB,
  GB,
  PLAN_CONFIG,
  PLANS,
  PAID_PLANS,
  ROLES,
  planForPriceId,
  priceIdForPlan,
  getPlan,
};
