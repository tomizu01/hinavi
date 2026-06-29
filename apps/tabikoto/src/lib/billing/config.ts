// 課金・ポイント関連の設定値を集約。
// 金額・ポイント数・閾値はここで一元管理し、運用中に調整する。

export const POINTS_PER_GENERATE = 10;

export const LOW_BALANCE_WARNING_THRESHOLD = 100;

// プラン追加時はここに 1 行追加し、対応する STRIPE_PRICE_ID_* 環境変数を .env に設定する
export type PlanKey = 'chokotto' | 'light' | 'standard' | 'pro';

export interface PlanDefinition {
  key: PlanKey;
  label: string;
  priceJpyTaxIncluded: number;
  points: number;
  approxHours: string;
  mode: 'one_time' | 'subscription';
  stripePriceIdEnv: string;
  grantSource: GrantSource;
  // UI 上の表示順 (小さいほど上)。サブスクは tier 順に並ぶよう設計
  order: number;
  // UI で非表示にしたいプランは false (将来プランで価格未定の枠を予約しておきたい場合など)
  visible: boolean;
}

export const PLANS: Record<PlanKey, PlanDefinition> = {
  chokotto: {
    key: 'chokotto',
    label: 'ちょこっとプラン',
    priceJpyTaxIncluded: 100,
    points: 2000,
    approxHours: '約3時間',
    mode: 'one_time',
    stripePriceIdEnv: 'STRIPE_PRICE_ID_CHOKOTTO',
    grantSource: 'plan_chokotto',
    order: 0,
    visible: true,
  },
  light: {
    key: 'light',
    label: 'ライトプラン',
    priceJpyTaxIncluded: 780,
    points: 10000,
    approxHours: '約15時間',
    mode: 'subscription',
    stripePriceIdEnv: 'STRIPE_PRICE_ID_LIGHT',
    grantSource: 'plan_light',
    order: 10,
    visible: true,
  },
  standard: {
    key: 'standard',
    label: 'スタンダードプラン',
    priceJpyTaxIncluded: 2480,
    points: 40000,
    approxHours: '約60時間',
    mode: 'subscription',
    stripePriceIdEnv: 'STRIPE_PRICE_ID_STANDARD',
    grantSource: 'plan_standard',
    order: 20,
    visible: true,
  },
  pro: {
    key: 'pro',
    label: 'プロプラン',
    priceJpyTaxIncluded: 4980,
    points: 100000,
    approxHours: '約150時間',
    mode: 'subscription',
    stripePriceIdEnv: 'STRIPE_PRICE_ID_PRO',
    grantSource: 'plan_pro',
    order: 30,
    visible: true,
  },
};

// 表示順に並んだ可視プランのリスト
export function visiblePlans(): PlanDefinition[] {
  return Object.values(PLANS)
    .filter((p) => p.visible)
    .sort((a, b) => a.order - b.order);
}

// Stripe Price ID から PlanDefinition を逆引き
// Webhook で受け取った Price ID に対応するプランを判定するのに使う
export function findPlanByPriceId(priceId: string): PlanDefinition | null {
  for (const plan of Object.values(PLANS)) {
    const v = process.env[plan.stripePriceIdEnv];
    if (v && v === priceId) return plan;
  }
  return null;
}

export const INITIAL_TRIAL_POINTS = Number(process.env.INITIAL_TRIAL_POINTS ?? 100);

export type GrantSource =
  | 'initial_trial'
  | 'plan_chokotto'
  | 'plan_light'
  | 'plan_standard'
  | 'plan_pro'
  | 'campaign_chokotto_free'
  | 'invite_inviter'
  | 'invite_invitee';

export type OneTimeGrantType = 'initial_trial' | 'campaign_chokotto_free';

export function isSubscriptionPlan(plan: PlanDefinition): boolean {
  return plan.mode === 'subscription';
}

// 付与日の翌々月末を返す。たとえば 2026-06-29 → 2026-08-31 23:59:59 (JST)
export function calcExpiresAt(grantedAt: Date): Date {
  const jstOffset = 9 * 60 * 60 * 1000;
  const jst = new Date(grantedAt.getTime() + jstOffset);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth();
  const expireMonth = month + 3;
  const expireJst = new Date(Date.UTC(year, expireMonth, 1, 0, 0, 0));
  expireJst.setUTCSeconds(-1);
  return new Date(expireJst.getTime() - jstOffset);
}
