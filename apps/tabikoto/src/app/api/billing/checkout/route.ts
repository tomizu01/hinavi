import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getStripe } from '@/lib/billing/stripe';
import { PLANS, isSubscriptionPlan, type PlanKey } from '@/lib/billing/config';
import { findActiveSubscriptionByUser } from '@/lib/billing/subscriptions';

export const runtime = 'nodejs';

function publicBaseUrl(req: Request): string {
  return (
    process.env.TABIKOTO_PUBLIC_URL ??
    new URL(req.url).origin
  );
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { plan?: PlanKey } | null;
  const planKey = body?.plan;
  if (!planKey || !PLANS[planKey]) {
    return NextResponse.json({ error: 'invalid_plan' }, { status: 400 });
  }
  const plan = PLANS[planKey];
  if (!plan.visible) {
    return NextResponse.json({ error: 'plan_not_available' }, { status: 400 });
  }
  const priceId = process.env[plan.stripePriceIdEnv];
  if (!priceId) {
    return NextResponse.json(
      { error: 'price_id_not_configured', env: plan.stripePriceIdEnv },
      { status: 500 },
    );
  }

  // サブスクの重複契約を防止: 既に有効なサブスクがある場合は Portal へ誘導
  if (isSubscriptionPlan(plan)) {
    const active = await findActiveSubscriptionByUser(session.id);
    if (active) {
      return NextResponse.json(
        {
          error: 'already_subscribed',
          message:
            '既にサブスクリプションをご契約中です。プラン変更や解約はサブスクリプション管理画面から行ってください。',
          currentPriceId: active.priceId,
          cancelPending: active.cancelAt !== null,
        },
        { status: 409 },
      );
    }
  }

  const stripe = getStripe();
  const base = publicBaseUrl(req);

  try {
    const csession = await stripe.checkout.sessions.create({
      mode: plan.mode === 'subscription' ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/billing/cancel`,
      customer_email: session.email,
      client_reference_id: session.id,
      metadata: {
        user_id: session.id,
        plan: plan.key,
      },
      ...(plan.mode === 'subscription'
        ? {
            subscription_data: {
              metadata: { user_id: session.id, plan: plan.key },
            },
          }
        : {
            payment_intent_data: {
              metadata: { user_id: session.id, plan: plan.key },
            },
          }),
    });

    return NextResponse.json({ url: csession.url, id: csession.id });
  } catch (err) {
    console.error('stripe checkout create failed:', err);
    return NextResponse.json({ error: 'checkout_failed' }, { status: 502 });
  }
}
