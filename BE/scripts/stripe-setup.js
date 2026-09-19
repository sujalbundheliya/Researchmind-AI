#!/usr/bin/env node
/**
 * One-time Stripe product/price setup for the two paid plans.
 * Creates (or reuses) recurring monthly USD prices tagged with metadata so
 * re-runs don't create duplicates, then prints the price ids to paste into
 * BE/.env as STRIPE_PRICE_INDIVIDUAL / STRIPE_PRICE_PRO.
 *
 *   npm run stripe:setup
 */
require('dotenv').config();
const Stripe = require('stripe');

const PLANS = [
  { key: 'individual', name: 'ResearchMind Individual', amountCents: 1500, envVar: 'STRIPE_PRICE_INDIVIDUAL' },
  { key: 'pro', name: 'ResearchMind Pro', amountCents: 4900, envVar: 'STRIPE_PRICE_PRO' },
];

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not set. Add it to BE/.env first.');
    process.exit(1);
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  console.log('Setting up Stripe products & prices...\n');
  const results = [];

  for (const p of PLANS) {
    let price;
    try {
      const found = await stripe.prices.search({
        query: `metadata['researchmind_plan']:'${p.key}' AND active:'true'`,
      });
      price = found.data[0];
    } catch {
      // search may be momentarily unavailable on brand-new accounts — fall through to create
    }

    if (price) {
      console.log(`• ${p.name}: reusing existing price ${price.id}`);
    } else {
      const product = await stripe.products.create({
        name: p.name,
        metadata: { researchmind_plan: p.key },
      });
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: p.amountCents,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { researchmind_plan: p.key },
      });
      console.log(`• ${p.name}: created price ${price.id} ($${(p.amountCents / 100).toFixed(2)}/mo)`);
    }
    results.push(`${p.envVar}=${price.id}`);
  }

  console.log('\n────────────────────────────────────────────');
  console.log('Add these lines to BE/.env then restart the backend:\n');
  console.log(results.join('\n'));
  console.log('────────────────────────────────────────────');
}

main().catch((err) => {
  console.error('stripe-setup failed:', err.message);
  process.exit(1);
});
