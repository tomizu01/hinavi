import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { findActiveSubscriptionByUser } from '@/lib/billing/subscriptions';
import { findPlanByPriceId } from '@/lib/billing/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const active = await findActiveSubscriptionByUser(session.id);
  if (!active) {
    return NextResponse.json({ active: null });
  }

  const plan = findPlanByPriceId(active.priceId);
  return NextResponse.json({
    active: {
      planKey: plan?.key ?? null,
      planLabel: plan?.label ?? null,
      priceId: active.priceId,
      status: active.status,
      currentPeriodEnd: active.currentPeriodEnd?.toISOString() ?? null,
      cancelAt: active.cancelAt?.toISOString() ?? null,
      canceledAt: active.canceledAt?.toISOString() ?? null,
      cancelPending: active.cancelAt !== null,
    },
  });
}
