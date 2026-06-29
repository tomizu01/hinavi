import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getStripe } from '@/lib/billing/stripe';
import { findStripeCustomerIdByUser } from '@/lib/billing/subscriptions';

export const runtime = 'nodejs';

function publicBaseUrl(req: Request): string {
  return process.env.TABIKOTO_PUBLIC_URL ?? new URL(req.url).origin;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const customerId = await findStripeCustomerIdByUser(session.id);
  if (!customerId) {
    return NextResponse.json({ error: 'no_subscription' }, { status: 404 });
  }

  const stripe = getStripe();
  const base = publicBaseUrl(req);

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${base}/`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    console.error('stripe billing portal create failed:', err);
    return NextResponse.json({ error: 'portal_failed' }, { status: 502 });
  }
}
