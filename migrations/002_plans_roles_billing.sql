-- 002_plans_roles_billing.sql
-- Adds subscription plans, roles, Stripe billing fields, and Free-tier usage
-- counters to the users table. All additive with safe defaults so every
-- existing row becomes a Free 'user'. Idempotent (IF NOT EXISTS throughout).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role                   TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS plan                   TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_status            TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS plan_renews_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifetime_uploads       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extractions_used       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reviews_used           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS drafts_used            INTEGER NOT NULL DEFAULT 0;

-- One Stripe customer per user.
CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_customer_id_key
  ON users (stripe_customer_id);

-- Guard rails on the en-like text columns.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('user', 'admin', 'super_admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_plan_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_plan_check
      CHECK (plan IN ('free', 'individual', 'pro'));
  END IF;
END$$;
