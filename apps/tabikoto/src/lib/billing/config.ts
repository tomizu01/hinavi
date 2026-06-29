// 課金・ポイント関連の設定値を集約。
// 金額・ポイント数・閾値はここで一元管理し、運用中に調整する。

export const POINTS_PER_GENERATE = 10;

export const LOW_BALANCE_WARNING_THRESHOLD = 100;

export type PlanKey = 'chokotto' | 'light';

export interface PlanDefinition {
  key: PlanKey;
  label: string;
  priceJpyTaxIncluded: number;
  points: number;
  approxHours: string;
  mode: 'one_time' | 'subscription';
  stripePriceIdEnv: string;
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
  },
  light: {
    key: 'light',
    label: 'ライトプラン',
    priceJpyTaxIncluded: 780,
    points: 10000,
    approxHours: '約15時間',
    mode: 'subscription',
    stripePriceIdEnv: 'STRIPE_PRICE_ID_LIGHT',
  },
};

export const INITIAL_TRIAL_POINTS = Number(process.env.INITIAL_TRIAL_POINTS ?? 100);

export type GrantSource =
  | 'initial_trial'
  | 'plan_chokotto'
  | 'plan_light'
  | 'campaign_chokotto_free'
  | 'invite_inviter'
  | 'invite_invitee';

export type OneTimeGrantType = 'initial_trial' | 'campaign_chokotto_free';

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
