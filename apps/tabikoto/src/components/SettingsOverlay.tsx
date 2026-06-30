'use client';

import { useEffect, useState } from 'react';

const NAME_MAX = 8;

export default function SettingsOverlay() {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalErr, setPortalErr] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [nameLoaded, setNameLoaded] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setNameLoaded(false);
    setNameMsg(null);
    setNameErr(null);
    (async () => {
      try {
        const res = await fetch('/api/me/name');
        if (!res.ok) {
          if (!cancelled) setNameLoaded(true);
          return;
        }
        const data = (await res.json()) as { name?: string | null };
        if (cancelled) return;
        const current = (data.name ?? '').trim();
        setName(current);
        setSavedName(current);
        setNameLoaded(true);
      } catch {
        if (!cancelled) setNameLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const trimmedName = name.trim();
  const canSaveName =
    nameLoaded &&
    !nameSaving &&
    trimmedName.length > 0 &&
    trimmedName.length <= NAME_MAX &&
    trimmedName !== savedName;

  const handleSaveName = async () => {
    if (!canSaveName) return;
    setNameSaving(true);
    setNameMsg(null);
    setNameErr(null);
    try {
      const res = await fetch('/api/me/name', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setNameErr(data.error ?? '保存に失敗しました');
        setNameSaving(false);
        return;
      }
      const data = (await res.json()) as { name?: string };
      const saved = (data.name ?? trimmedName).trim();
      setName(saved);
      setSavedName(saved);
      setNameMsg('保存しました');
      setNameSaving(false);
    } catch {
      setNameErr('保存に失敗しました');
      setNameSaving(false);
    }
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
              <div className="text-xs text-neutral-400">
                呼び名
                <span className="ml-2 text-neutral-500">（最大{NAME_MAX}文字 / ひらがな推奨）</span>
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameMsg(null);
                  setNameErr(null);
                }}
                maxLength={NAME_MAX}
                disabled={!nameLoaded || nameSaving}
                placeholder={nameLoaded ? 'ひらがな で入力' : '読み込み中…'}
                className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
              />
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-neutral-500">{trimmedName.length}/{NAME_MAX} 文字</span>
                {nameMsg && <span className="text-emerald-400">{nameMsg}</span>}
                {nameErr && <span className="text-rose-400">{nameErr}</span>}
              </div>
              <button
                onClick={handleSaveName}
                disabled={!canSaveName}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-emerald-700 hover:bg-emerald-600 text-white disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed"
              >
                {nameSaving ? '保存中…' : '呼び名を保存'}
              </button>
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
