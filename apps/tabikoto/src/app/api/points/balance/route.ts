import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getBalance, grantOnceIfAbsent } from '@/lib/billing/points';
import {
  INITIAL_TRIAL_POINTS,
  LOW_BALANCE_WARNING_THRESHOLD,
  POINTS_PER_GENERATE,
} from '@/lib/billing/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (INITIAL_TRIAL_POINTS > 0) {
    try {
      await grantOnceIfAbsent({
        userId: session.id,
        grantType: 'initial_trial',
        source: 'initial_trial',
        points: INITIAL_TRIAL_POINTS,
      });
    } catch (err) {
      console.error('initial trial grant failed:', err);
    }
  }

  const balance = await getBalance(session.id);
  return NextResponse.json({
    total: balance.total,
    lots: balance.lots,
    pointsPerGenerate: POINTS_PER_GENERATE,
    lowThreshold: LOW_BALANCE_WARNING_THRESHOLD,
  });
}
