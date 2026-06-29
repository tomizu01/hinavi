import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getStripe } from '@/lib/billing/stripe';
import { PLANS, type PlanKey } from '@/lib/billing/config';

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
  const priceId = process.env[plan.stripePriceIdEnv];
  if (!priceId) {
    return NextResponse.json(
      { error: 'price_id_not_configured', env: plan.stripePriceIdEnv },
      { status: 500 },
    );
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
