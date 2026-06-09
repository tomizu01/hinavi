'use client';

import { useEffect, useState } from 'react';
import {
  getTtsEngine,
  setTtsEngine,
  getClimbCount,
  setClimbCount,
  CLIMB_COUNT_MIN,
  CLIMB_COUNT_MAX,
  type TtsEngine,
} from '@/lib/client/settings';

export default function SettingsOverlay() {
  const [open, setOpen] = useState(false);
  const [engine, setEngineState] = useState<TtsEngine>('aivis');
  const [climb, setClimb] = useState<number>(CLIMB_COUNT_MIN);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setEngineState(getTtsEngine());
    setClimb(getClimbCount());
  }, []);

  const handleEngineChange = (next: TtsEngine) => {
    setEngineState(next);
    setTtsEngine(next);
  };

  const handleClimbDelta = (delta: number) => {
    setClimb((prev) => setClimbCount(prev + delta));
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* noop */
    }
    window.location.href = '/login';
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
              <div className="text-xs text-neutral-400">現在のクライム回数</div>
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => handleClimbDelta(-1)}
                  disabled={climb <= CLIMB_COUNT_MIN}
                  aria-label="クライム回数を減らす"
                  className="w-12 h-12 rounded-lg text-2xl font-bold bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-100 disabled:opacity-30"
                >
                  −
                </button>
                <div className="flex-1 text-center">
                  <div className="text-3xl font-bold tabular-nums">{climb}</div>
                  <div className="text-[10px] text-neutral-500">/ {CLIMB_COUNT_MAX} 本</div>
                </div>
                <button
                  onClick={() => handleClimbDelta(1)}
                  disabled={climb >= CLIMB_COUNT_MAX}
                  aria-label="クライム回数を増やす"
                  className="w-12 h-12 rounded-lg text-2xl font-bold bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 text-white disabled:opacity-30"
                >
                  ＋
                </button>
              </div>
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

            <div className="pt-2 border-t border-neutral-800">
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
