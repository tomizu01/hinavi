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

export async function startCheckout(
  plan: 'chokotto' | 'light',
): Promise<string | null> {
  const res = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { url?: string };
  return data.url ?? null;
}
