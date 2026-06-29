'use client';

import { useEffect, useState } from 'react';
import {
  fetchActiveSubscription,
  openCustomerPortal,
  startCheckout,
  type ActiveSubscription,
} from '@/lib/client/points';
import { visiblePlans, isSubscriptionPlan, type PlanDefinition } from '@/lib/billing/config';

interface Props {
  open: boolean;
  reason: 'low' | 'zero';
  onClose: () => void;
}

function formatJpyDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Tokyo',
    });
  } catch {
    return '';
  }
}

export default function PurchaseModal({ open, reason, onClose }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveSubscription | null>(null);
  const [loadingActive, setLoadingActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoadingActive(true);
    setErr(null);
    fetchActiveSubscription()
      .then((a) => setActive(a))
      .finally(() => setLoadingActive(false));
  }, [open]);

  if (!open) return null;

  const plans = visiblePlans();

  const handleBuy = async (plan: PlanDefinition) => {
    setBusy(plan.key);
    setErr(null);
    const result = await startCheckout(plan.key);
    if (result.kind === 'redirect') {
      window.location.href = result.url;
      return;
    }
    if (result.kind === 'already_subscribed') {
      setErr(result.message);
      // 既存サブスクをリフレッシュ
      const fresh = await fetchActiveSubscription();
      setActive(fresh);
      setBusy(null);
      return;
    }
    setErr(result.message);
    setBusy(null);
  };

  const handleOpenPortal = async () => {
    setBusy('portal');
    setErr(null);
    const result = await openCustomerPortal();
    if (result.kind === 'redirect') {
      window.location.href = result.url;
      return;
    }
    if (result.kind === 'no_subscription') {
      setErr('現在ご契約中のサブスクリプションがありません。');
      setBusy(null);
      return;
    }
    setErr(result.message);
    setBusy(null);
  };

  const title = reason === 'zero' ? 'コトポが不足しています' : 'コトポをチャージ';
  const lead =
    reason === 'zero'
      ? 'AI会話を続けるには、コトポを追加してください。'
      : '残量が少なくなっています。お好きなプランを選んでください。';

  // 現在ご契約中のサブスクがある場合: 該当プランのボタンを Portal 誘導に切り替え
  const renderPlanCard = (plan: PlanDefinition) => {
    const isCurrentPlan =
      active?.planKey === plan.key && isSubscriptionPlan(plan);
    const isSubscriptionWhileActive =
      isSubscriptionPlan(plan) && active && !isCurrentPlan;

    const isBusy = busy === plan.key;
    const baseCls =
      'w-full text-left p-3 rounded-lg disabled:opacity-50 transition-colors';

    if (isCurrentPlan) {
      return (
        <button
          key={plan.key}
          onClick={handleOpenPortal}
          disabled={busy !== null}
          className={`${baseCls} bg-emerald-700 hover:bg-emerald-600 ring-2 ring-emerald-400`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold">
              {plan.label}{' '}
              <span className="text-[10px] font-normal text-emerald-100 ml-1">
                ご契約中
              </span>
            </div>
            <div className="text-xs text-emerald-100">管理画面へ →</div>
          </div>
          <div className="text-xs text-emerald-100 mt-0.5">
            月額 {plan.priceJpyTaxIncluded.toLocaleString()}円（税込）/ 毎月 {plan.points.toLocaleString()} コトポ
          </div>
          {active?.cancelPending && active.cancelAt && (
            <div className="text-[10px] text-amber-200 mt-1">
              ※ 解約予約済み（{formatJpyDate(active.cancelAt)}まで有効）
            </div>
          )}
        </button>
      );
    }

    if (isSubscriptionWhileActive) {
      return (
        <button
          key={plan.key}
          onClick={handleOpenPortal}
          disabled={busy !== null}
          className={`${baseCls} bg-neutral-800 hover:bg-neutral-700`}
        >
          <div className="font-semibold text-neutral-300">{plan.label}</div>
          <div className="text-xs text-neutral-500 mt-0.5">
            月額 {plan.priceJpyTaxIncluded.toLocaleString()}円（税込）/ 毎月 {plan.points.toLocaleString()} コトポ
          </div>
          <div className="text-[10px] text-neutral-400 mt-1">
            プラン変更は管理画面から
          </div>
        </button>
      );
    }

    // 通常購入可能 (都度課金 or 未契約時のサブスク)
    const subtitle =
      plan.mode === 'subscription'
        ? `月額 ${plan.priceJpyTaxIncluded.toLocaleString()}円（税込）/ 毎月 ${plan.points.toLocaleString()} コトポ（想定 ${plan.approxHours}）`
        : `${plan.priceJpyTaxIncluded.toLocaleString()}円（税込）/ ${plan.points.toLocaleString()} コトポ（想定 ${plan.approxHours}）`;

    const cls =
      plan.mode === 'subscription'
        ? `${baseCls} bg-emerald-700 hover:bg-emerald-600`
        : `${baseCls} bg-neutral-800 hover:bg-neutral-700`;

    return (
      <button
        key={plan.key}
        onClick={() => handleBuy(plan)}
        disabled={busy !== null}
        className={cls}
      >
        <div className="font-semibold">{plan.label}</div>
        <div className={`text-xs mt-0.5 ${plan.mode === 'subscription' ? 'text-emerald-100' : 'text-neutral-400'}`}>
          {subtitle}
        </div>
        {isBusy && (
          <div className="text-xs mt-1 text-emerald-300">起動中...</div>
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-xl bg-neutral-900 text-neutral-100 p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm text-neutral-300">{lead}</p>

        {loadingActive ? (
          <p className="text-xs text-neutral-500">契約状況を確認中...</p>
        ) : (
          <div className="space-y-3">{plans.map(renderPlanCard)}</div>
        )}

        <p className="text-[10px] text-neutral-500 leading-relaxed">
          ※ 実際の利用可能時間は会話の内容や回線速度により想定利用時間より増減する場合があります。
          {active && (
            <>
              <br />
              ※ サブスクリプションを解約しても、付与済みコトポは有効期限まで使用できます。
            </>
          )}
        </p>

        {err && <p className="text-xs text-amber-400">{err}</p>}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="text-xs text-neutral-400 hover:text-neutral-200 px-2 py-1"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
