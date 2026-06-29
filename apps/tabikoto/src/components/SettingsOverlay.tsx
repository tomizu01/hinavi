'use client';

import { useEffect, useState } from 'react';
import { getTtsEngine, setTtsEngine, type TtsEngine } from '@/lib/client/settings';

export default function SettingsOverlay() {
  const [open, setOpen] = useState(false);
  const [engine, setEngineState] = useState<TtsEngine>('aivis');
  const [loggingOut, setLoggingOut] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalErr, setPortalErr] = useState<string | null>(null);

  useEffect(() => {
    setEngineState(getTtsEngine());
  }, []);

  const handleEngineChange = (next: TtsEngine) => {
    setEngineState(next);
    setTtsEngine(next);
  };

  const handleLogout = () => {
    if (loggingOut) return;
    setLoggingOut(true);
    window.location.href = '/api/auth/logout';
  };

  const handleManageSubscription = async () => {
    if (portalBusy) return;
    setPortalBusy(true);
    setPortalErr(null);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      if (res.status === 404) {
        setPortalErr('現在ライトプランの契約がありません。');
        setPortalBusy(false);
        return;
      }
      if (!res.ok) {
        setPortalErr('管理画面の起動に失敗しました。少し待ってからお試しください。');
        setPortalBusy(false);
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setPortalErr('管理画面 URL を取得できませんでした。');
        setPortalBusy(false);
      }
    } catch {
      setPortalErr('管理画面の起動に失敗しました。');
      setPortalBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="設定"
        className="absolute top-2 right-2 z-[1100] w-10 h-10 rounded-full bg-neutral-800/80 hover:bg-neutral-700 text-white shadow-lg backdrop-blur-sm flex items-center justify-center"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[1200] bg-black/60 flex items-center justify-center px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-neutral-900 text-neutral-100 shadow-2xl p-5 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">設定</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="閉じる"
                className="text-neutral-400 hover:text-neutral-200 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-neutral-400">TTS</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleEngineChange('aivis')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border ${
                    engine === 'aivis'
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-200 hover:bg-neutral-700'
                  }`}
                >
                  Aivis
                </button>
                <button
                  onClick={() => handleEngineChange('elevenlabs')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border ${
                    engine === 'elevenlabs'
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-200 hover:bg-neutral-700'
                  }`}
                >
                  ElevenLabs
                </button>
              </div>
              <p className="text-[10px] text-neutral-500">変更は次回の音声生成から反映されます。</p>
            </div>

            <div className="pt-2 border-t border-neutral-800 space-y-2">
              <button
                onClick={handleManageSubscription}
                disabled={portalBusy}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-100 disabled:opacity-50"
              >
                {portalBusy ? '起動中…' : 'サブスクリプション管理'}
              </button>
              {portalErr && <p className="text-xs text-amber-400">{portalErr}</p>}
              <p className="text-[10px] text-neutral-500 leading-relaxed">
                解約 / 支払い方法変更 / 領収書ダウンロードなど
              </p>

              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-neutral-800 hover:bg-neutral-700 text-rose-300 disabled:opacity-50"
              >
                {loggingOut ? 'ログアウト中…' : 'LOGOUT'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
