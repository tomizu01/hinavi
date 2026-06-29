export interface ClientBalanceLot {
  lotId: number;
  source: string;
  remaining: number;
  granted_at: string;
  expires_at: string;
}

export interface ClientBalance {
  total: number;
  lots: ClientBalanceLot[];
  pointsPerGenerate: number;
  lowThreshold: number;
}

export class InsufficientPointsError extends Error {
  required: number;
  constructor(required: number) {
    super(`insufficient points (required ${required})`);
    this.required = required;
  }
}

export async function fetchBalance(): Promise<ClientBalance | null> {
  try {
    const res = await fetch('/api/points/balance', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as ClientBalance;
  } catch (err) {
    console.error('balance fetch failed:', err);
    return null;
  }
}

export type CheckoutResult =
  | { kind: 'redirect'; url: string }
  | { kind: 'already_subscribed'; message: string; cancelPending: boolean }
  | { kind: 'error'; message: string };

export async function startCheckout(plan: string): Promise<CheckoutResult> {
  try {
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    if (res.status === 409) {
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        cancelPending?: boolean;
      };
      return {
        kind: 'already_subscribed',
        message:
          data.message ??
          '既にサブスクリプションをご契約中です。プラン変更や解約は管理画面から行ってください。',
        cancelPending: Boolean(data.cancelPending),
      };
    }
    if (!res.ok) {
      return { kind: 'error', message: '決済画面の起動に失敗しました。' };
    }
    const data = (await res.json()) as { url?: string };
    if (!data.url) return { kind: 'error', message: '決済画面の起動に失敗しました。' };
    return { kind: 'redirect', url: data.url };
  } catch {
    return { kind: 'error', message: '決済画面の起動に失敗しました。' };
  }
}

export interface ActiveSubscription {
  planKey: string | null;
  planLabel: string | null;
  priceId: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  canceledAt: string | null;
  cancelPending: boolean;
}

export async function fetchActiveSubscription(): Promise<ActiveSubscription | null> {
  try {
    const res = await fetch('/api/billing/subscription', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { active: ActiveSubscription | null };
    return data.active;
  } catch {
    return null;
  }
}

export async function openCustomerPortal(): Promise<
  { kind: 'redirect'; url: string }
  | { kind: 'no_subscription' }
  | { kind: 'error'; message: string }
> {
  try {
    const res = await fetch('/api/billing/portal', { method: 'POST' });
    if (res.status === 404) return { kind: 'no_subscription' };
    if (!res.ok) return { kind: 'error', message: '管理画面の起動に失敗しました。' };
    const data = (await res.json()) as { url?: string };
    if (!data.url) return { kind: 'error', message: '管理画面の起動に失敗しました。' };
    return { kind: 'redirect', url: data.url };
  } catch {
    return { kind: 'error', message: '管理画面の起動に失敗しました。' };
  }
}
