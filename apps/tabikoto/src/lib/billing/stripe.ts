import Stripe from 'stripe';

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  cached = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  return cached;
}

export function getWebhookSecret(): string {
  const v = process.env.STRIPE_WEBHOOK_SECRET;
  if (!v) throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  return v;
}
