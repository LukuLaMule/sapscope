-- Migration: trial subscription support
-- 2026-04-30
-- Make stripe_customer_id nullable (trial users have no Stripe customer yet)
-- Add trial_ends_at column for 30-day trial tracking

ALTER TABLE subscriptions ALTER COLUMN stripe_customer_id DROP NOT NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
