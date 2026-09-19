const db = require('../config/db');
const { PLAN_CONFIG, PAID_PLANS, planForPriceId, priceIdForPlan, getPlan } = require('../config/plans');
const stripeService = require('../services/stripe.service');

const frontend = () => process.env.FRONTEND_URL || 'http://localhost:3010';

// GET /api/billing/plans — public catalog used by the pricing UI.
exports.getPlans = (req, res) => {
  const plans = Object.values(PLAN_CONFIG).map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    priceLabel: p.priceLabel,
    features: p.features,
    paid: PAID_PLANS.includes(p.id),
  }));
  res.json({ plans });
};

// POST /api/billing/checkout { plan: 'individual' | 'pro' } → { url }
exports.createCheckout = async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PAID_PLANS.includes(plan)) {
      return res.status(400).json({ error: true, message: 'Invalid plan. Choose individual or pro.' });
    }
    const priceId = priceIdForPlan(plan);
    if (!priceId) {
      return res.status(500).json({ error: true, message: `Billing for the ${plan} plan is not configured yet.` });
    }

    const userRes = await db.query(
      'SELECT id, email, name, stripe_customer_id FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ error: true, message: 'User not found' });

    const customerId = await stripeService.getOrCreateCustomer(user);
    if (customerId !== user.stripe_customer_id) {
      await db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, user.id]);
    }

    const session = await stripeService.createCheckoutSession({
      customerId,
      priceId,
      userId: user.id,
      plan,
      successUrl: `${frontend()}/dashboard/billing?status=success`,
      cancelUrl: `${frontend()}/dashboard/billing?status=cancel`,
    });
    return res.json({ url: session.url });
  } catch (err) {
    console.error('createCheckout error:', err.message);
    return res.status(500).json({ error: true, message: 'Could not start checkout' });
  }
};

// POST /api/billing/portal → { url } — Stripe-hosted manage/cancel page.
exports.createPortal = async (req, res) => {
  try {
    const userRes = await db.query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.id]);
    const customerId = userRes.rows[0]?.stripe_customer_id;
    if (!customerId) {
      return res.status(400).json({ error: true, message: 'No billing account yet — upgrade to a paid plan first.' });
    }
    const session = await stripeService.createPortalSession({
      customerId,
      returnUrl: `${frontend()}/dashboard/billing`,
    });
    return res.json({ url: session.url });
  } catch (err) {
    console.error('createPortal error:', err.message);
    return res.status(500).json({ error: true, message: 'Could not open billing portal' });
  }
};

// Reconcile a Stripe subscription object into the user's row. Called from the
// webhook for both upgrades and cancellations.
async function applySubscription(sub) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!customerId) return;

  const priceId = sub.items?.data?.[0]?.price?.id;
  const plan = planForPriceId(priceId);
  const status = sub.status; // active | trialing | past_due | canceled | ...
  const usable = ['active', 'trialing', 'past_due'].includes(status);
  const effectivePlan = usable && plan ? plan : 'free';
  // Stripe moved `current_period_end` onto the subscription item in newer API
  // versions — read whichever is present so the renewal date survives a plan change.
  const periodEnd = sub.current_period_end || sub.items?.data?.[0]?.current_period_end;
  const renewsAt = periodEnd ? new Date(periodEnd * 1000) : null;
  const storageBytes = getPlan(effectivePlan).storageBytes;

  await db.query(
    `UPDATE users
        SET plan = $1,
            plan_status = $2,
            stripe_subscription_id = $3,
            plan_renews_at = $4,
            storage_limit_bytes = $5
      WHERE stripe_customer_id = $6`,
    [effectivePlan, status, sub.id, renewsAt, storageBytes, customerId]
  );
}

// POST /api/billing/sync — reconcile the caller's latest Stripe subscription
// into the DB on demand. This is the fallback for environments without a
// configured webhook (e.g. local dev with no Stripe CLI): the frontend calls
// it right after checkout returns, so upgrades take effect immediately.
exports.syncSubscription = async (req, res) => {
  try {
    const userRes = await db.query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.id]);
    const customerId = userRes.rows[0]?.stripe_customer_id;
    if (!customerId) return res.json({ synced: false, plan: 'free' });

    const subs = await stripeService.listSubscriptions(customerId);
    if (!subs.length) return res.json({ synced: false, plan: 'free' });

    // Prefer a usable subscription; otherwise the most recent one.
    const sub = subs.find((s) => ['active', 'trialing', 'past_due'].includes(s.status)) || subs[0];
    await applySubscription(sub);

    const updated = await db.query('SELECT plan, plan_status FROM users WHERE id = $1', [req.user.id]);
    return res.json({ synced: true, plan: updated.rows[0].plan, status: updated.rows[0].plan_status });
  } catch (err) {
    console.error('syncSubscription error:', err.message);
    return res.status(500).json({ error: true, message: 'Could not sync subscription' });
  }
};

// POST /api/billing/change-plan { plan: 'free' | 'individual' | 'pro' }
// Directly changes an EXISTING subscription (no Stripe-hosted portal needed):
//  - paid → other paid : swap the price with immediate proration
//  - paid → free       : schedule cancellation at period end
//  - no subscription    : { needsCheckout: true } so the FE starts checkout instead
exports.changePlan = async (req, res) => {
  try {
    const { plan } = req.body;
    if (!['free', 'individual', 'pro'].includes(plan)) {
      return res.status(400).json({ error: true, message: 'Invalid plan.' });
    }

    const userRes = await db.query(
      'SELECT id, plan, stripe_customer_id FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ error: true, message: 'User not found' });

    if (plan === user.plan) {
      return res.json({ changed: false, plan, message: `You're already on the ${plan} plan.` });
    }

    // Find the customer's live subscription (trust Stripe, not a possibly-stale DB id).
    const customerId = user.stripe_customer_id;
    const subs = customerId ? await stripeService.listSubscriptions(customerId) : [];
    const activeSub = subs.find((s) => ['active', 'trialing', 'past_due'].includes(s.status));

    // Downgrade to Free = cancel at period end (keep access until then).
    if (plan === 'free') {
      if (!activeSub) {
        return res.json({ changed: false, plan: 'free', message: 'You have no active paid subscription.' });
      }
      const canceled = await stripeService.cancelSubscriptionAtPeriodEnd(activeSub.id);
      await applySubscription(canceled);
      const renews = canceled.current_period_end || canceled.items?.data?.[0]?.current_period_end;
      return res.json({
        changed: true,
        plan: user.plan, // stays paid until period end
        scheduledCancel: true,
        message: renews
          ? `Your subscription will end on ${new Date(renews * 1000).toLocaleDateString()} and revert to Free.`
          : 'Your subscription is set to cancel at the end of the billing period.',
      });
    }

    // Upgrade/downgrade between paid plans.
    const priceId = priceIdForPlan(plan);
    if (!priceId) {
      return res.status(500).json({ error: true, message: `Billing for the ${plan} plan is not configured yet.` });
    }
    // No live subscription to modify → the caller needs a fresh checkout.
    if (!activeSub) {
      return res.status(409).json({ needsCheckout: true, message: 'No active subscription — starting checkout.' });
    }

    const updated = await stripeService.updateSubscriptionPrice({
      subscriptionId: activeSub.id,
      priceId,
    });
    await applySubscription(updated);

    const fresh = await db.query('SELECT plan, plan_status, plan_renews_at FROM users WHERE id = $1', [req.user.id]);
    return res.json({
      changed: true,
      plan: fresh.rows[0].plan,
      message: `You're now on the ${fresh.rows[0].plan} plan.`,
    });
  } catch (err) {
    console.error('changePlan error:', err.message);
    return res.status(500).json({ error: true, message: 'Could not change plan. Please try again.' });
  }
};

// POST /api/billing/webhook — raw body, no auth (mounted in app.js before the
// JSON parser so the Stripe signature can be verified against the raw payload).
exports.webhook = async (req, res) => {
  let event;
  try {
    event = stripeService.constructEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.subscription) {
          const sub = await stripeService.getSubscription(session.subscription);
          await applySubscription(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await applySubscription(event.data.object);
        break;
      default:
        break; // ignore other event types
    }
    return res.json({ received: true });
  } catch (err) {
    console.error(`Webhook handler error (${event.type}):`, err.message);
    return res.status(500).json({ error: true });
  }
};
