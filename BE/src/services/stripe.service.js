/**
 * Thin wrapper around the Stripe SDK. Lazily initialized so the app still boots
 * when Stripe env vars are not yet configured (only throws when actually used).
 */
const Stripe = require('stripe');

let _stripe = null;
function client() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  _stripe = new Stripe(key);
  return _stripe;
}

/** Return the user's Stripe customer id, creating the customer if needed. */
async function getOrCreateCustomer(user) {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const customer = await client().customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: user.id },
  });
  return customer.id;
}

async function createCheckoutSession({ customerId, priceId, userId, plan, successUrl, cancelUrl }) {
  return client().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,
    subscription_data: { metadata: { userId, plan } },
    metadata: { userId, plan },
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
  });
}

async function createPortalSession({ customerId, returnUrl }) {
  return client().billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
}

async function getSubscription(subscriptionId) {
  return client().subscriptions.retrieve(subscriptionId);
}

/**
 * Swap the price on an existing subscription (upgrade/downgrade between paid
 * plans) and invoice the proration immediately. This is what powers the in-app
 * "Change plan" button — no reliance on the Stripe-hosted portal being
 * configured. Returns the updated subscription object.
 */
async function updateSubscriptionPrice({ subscriptionId, priceId }) {
  const sub = await client().subscriptions.retrieve(subscriptionId);
  const itemId = sub.items?.data?.[0]?.id;
  if (!itemId) throw new Error('Subscription has no line items to update');
  return client().subscriptions.update(subscriptionId, {
    items: [{ id: itemId, price: priceId }],
    proration_behavior: 'always_invoice',
    cancel_at_period_end: false, // un-schedule any pending cancel
    payment_behavior: 'error_if_incomplete', // surface failed upgrade charges
  });
}

/** Downgrade to Free = cancel at period end (user keeps paid access until then). */
async function cancelSubscriptionAtPeriodEnd(subscriptionId) {
  return client().subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

/**
 * Cancel immediately, no period-end grace. Used on account deletion, where
 * cancel-at-period-end would leave a live subscription attached to a user row
 * that no longer exists.
 */
async function cancelSubscriptionNow(subscriptionId) {
  return client().subscriptions.cancel(subscriptionId);
}

/** Most recent subscriptions for a customer (any status). */
async function listSubscriptions(customerId) {
  const res = await client().subscriptions.list({ customer: customerId, status: 'all', limit: 3 });
  return res.data;
}

/** Verify + parse a webhook payload (raw Buffer + signature header). */
function constructEvent(rawBody, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  return client().webhooks.constructEvent(rawBody, signature, secret);
}

module.exports = {
  client,
  getOrCreateCustomer,
  createCheckoutSession,
  createPortalSession,
  getSubscription,
  updateSubscriptionPrice,
  cancelSubscriptionAtPeriodEnd,
  cancelSubscriptionNow,
  listSubscriptions,
  constructEvent,
};
