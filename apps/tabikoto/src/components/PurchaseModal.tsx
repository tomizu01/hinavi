'use client';

import { useState } from 'react';
import { startCheckout } from '@/lib/client/points';

interface Props {
  open: boolean;
  reason: 'low' | 'zero';
  onClose: () => void;
}

export default function PurchaseModal({ open, reason, onClose }: Props) {
  const [busy, setBusy] = useState<'chokotto' | 'light' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  const buy = async (plan: 'chokotto' | 'light') => {
    setBusy(plan);
    setErr(null);
    try {
      const url = await startCheckout(plan);
      if (!url) {
        setErr('決済画面の起動に失敗しました。少し待ってからお試しください。');
        setBusy(null);
        return;
      }
      window.location.href = url;
    } catch {
      setErr('決済画面の起動に失敗しました。');
      setBusy(null);
    }
  };

  const title = reason === 'zero' ? 'コトポが不足しています' : 'コトポをチャージ';
  const lead =
    reason === 'zero'
      ? 'AI会話を続けるには、コトポを追加してください。'
      : '残量が少なくなっています。お好きなプランを選んでください。';

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-xl bg-neutral-900 text-neutral-100 p-5 space-y-4 shadow-2xl">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm text-neutral-300">{lead}</p>

        <div className="space-y-3">
          <button
            onClick={() => buy('chokotto')}
            disabled={busy !== null}
            className="w-full text-left p-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
          >
            <div className="font-semibold">ちょこっとプラン</div>
            <div className="text-xs text-neutral-400 mt-0.5">
              100円（税込） / 2,000 コトポ（想定 約3時間）
            </div>
            {busy === 'chokotto' && <div className="text-xs mt-1 text-emerald-400">起動中...</div>}
          </button>

          <button
            onClick={() => buy('light')}
            disabled={busy !== null}
            className="w-full text-left p-3 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50"
          >
            <div className="font-semibold">ライトプラン（月額）</div>
            <div className="text-xs text-emerald-100 mt-0.5">
              月額 780円（税込） / 毎月 10,000 コトポ（想定 約15時間）
            </div>
            {busy === 'light' && <div className="text-xs mt-1 text-emerald-200">起動中...</div>}
          </button>
        </div>

        <p className="text-[10px] text-neutral-500 leading-relaxed">
          ※ 実際の利用可能時間は会話の内容や回線速度により想定利用時間より増減する場合があります。
        </p>

        {err && <p className="text-xs text-red-400">{err}</p>}

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
