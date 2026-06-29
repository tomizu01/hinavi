import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import type { RowDataPacket } from 'mysql2';
import { pool } from '@/lib/db';
import { getStripe, getWebhookSecret } from '@/lib/billing/stripe';
import { PLANS, type PlanKey, type GrantSource } from '@/lib/billing/config';
import { grantPoints } from '@/lib/billing/points';
import {
  findActiveSubscriptionByCustomer,
  findUserIdBySubscription,
  upsertSubscriptionFromStripe,
} from '@/lib/billing/subscriptions';

export const runtime = 'nodejs';

function planFromMetadata(meta: Stripe.Metadata | null): PlanKey | null {
  const p = meta?.plan;
  if (p === 'chokotto' || p === 'light') return p;
  return null;
}

function userIdFromMetadata(meta: Stripe.Metadata | null): string | null {
  const id = meta?.user_id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

async function isLotAlreadyGranted(stripeRef: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 FROM point_lots WHERE stripe_ref = ? LIMIT 1`,
    [stripeRef],
  );
  return rows.length > 0;
}

async function grantForPlan(opts: {
  userId: string;
  planKey: PlanKey;
  stripeRef: string;
}): Promise<void> {
  if (await isLotAlreadyGranted(opts.stripeRef)) return;
  const plan = PLANS[opts.planKey];
  const source: GrantSource =
    opts.planKey === 'chokotto' ? 'plan_chokotto' : 'plan_light';
  await grantPoints({
    userId: opts.userId,
    source,
    points: plan.points,
    stripeRef: opts.stripeRef,
  });
}

async function handleCheckoutCompleted(
  s: Stripe.Checkout.Session,
): Promise<void> {
  const userId =
    s.client_reference_id ?? userIdFromMetadata(s.metadata ?? null);
  const planKey = planFromMetadata(s.metadata ?? null);
  if (!userId || !planKey) {
    console.warn('checkout.session.completed missing user/plan', s.id);
    return;
  }

  if (s.mode === 'payment') {
    // ちょこっとプラン (都度課金) は即時付与
    const ref = typeof s.payment_intent === 'string'
      ? s.payment_intent
      : s.payment_intent?.id ?? s.id;
    await grantForPlan({ userId, planKey, stripeRef: ref });
    return;
  }

  if (s.mode === 'subscription') {
    // ライトプラン (サブスク) は subscription レコードを先に作る
    // 初回付与は invoice.payment_succeeded 側で扱う
    const subId =
      typeof s.subscription === 'string' ? s.subscription : s.subscription?.id;
    if (!subId) return;
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(subId);
    await upsertSubscriptionFromStripe(sub, userId);
  }
}

function extractSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  // 旧フィールド (API < 2026-03-31)
  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  if (typeof legacy === 'string') return legacy;
  if (legacy && typeof legacy === 'object' && 'id' in legacy) return legacy.id;

  // 新フィールド (API >= 2026-06-24.dahlia)
  const parent = (invoice as unknown as {
    parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
  }).parent;
  const subRef = parent?.subscription_details?.subscription;
  if (typeof subRef === 'string') return subRef;
  if (subRef && typeof subRef === 'object' && 'id' in subRef) return subRef.id;

  // 念のため line item から
  const lineSub = invoice.lines?.data?.[0] as unknown as { subscription?: string | { id: string } | null } | undefined;
  const lineRef = lineSub?.subscription;
  if (typeof lineRef === 'string') return lineRef;
  if (lineRef && typeof lineRef === 'object' && 'id' in lineRef) return lineRef.id;

  return null;
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  let subId = extractSubscriptionIdFromInvoice(invoice);
  let userId: string | null = null;

  if (subId) {
    userId = await findUserIdBySubscription(subId);
  }

  // 直接の subscription 参照が取れない / DB に未保存の場合、customer ID で逆引き
  if (!userId) {
    const customerId =
      typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id ?? null;
    if (customerId) {
      const found = await findActiveSubscriptionByCustomer(customerId);
      if (found) {
        userId = found.userId;
        subId = found.subscriptionId;
      }
    }
  }

  // それでも見つからない場合は Stripe から取りに行く (subscriptionId が判明している場合のみ)
  if (!userId && subId) {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(subId);
    const meta = sub.metadata ?? null;
    userId = userIdFromMetadata(meta);
    if (userId) await upsertSubscriptionFromStripe(sub, userId);
  }

  if (!userId) {
    console.warn(
      'invoice.paid: user_id unresolved (invoice=%s subscription=%s customer=%s)',
      invoice.id,
      subId,
      typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id,
    );
    return;
  }

  // 同じ invoice から二重付与しないよう stripe_ref で重複排除
  const ref = invoice.id ?? `invoice_${Date.now()}`;
  await grantForPlan({ userId, planKey: 'light', stripeRef: ref });
}

async function handleSubscriptionUpdated(
  sub: Stripe.Subscription,
): Promise<void> {
  const meta = sub.metadata ?? null;
  let userId = userIdFromMetadata(meta);
  if (!userId) userId = await findUserIdBySubscription(sub.id);
  if (!userId) {
    console.warn('subscription event missing user_id', sub.id);
    return;
  }
  await upsertSubscriptionFromStripe(sub, userId);
}

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'no_signature' }, { status: 400 });

  const stripe = getStripe();
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, getWebhookSecret());
  } catch (err) {
    console.error('stripe webhook signature invalid:', err);
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error('stripe webhook handler failed:', event.type, err);
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
