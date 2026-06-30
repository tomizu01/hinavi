'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import SpeechRow from '@/components/SpeechRow';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });
import SettingsOverlay from '@/components/SettingsOverlay';
import PointsBadge from '@/components/PointsBadge';
import LowBalanceBanner from '@/components/LowBalanceBanner';
import PurchaseModal from '@/components/PurchaseModal';
import type { CharacterId } from '@/lib/characters';
import type { Spot } from '@/lib/types';
import type { GeoPoint } from '@/lib/client/geo';
import { startConversationLoop, type LoopController } from '@/lib/client/conversationLoop';
import { requestWakeLock, reacquireOnVisible } from '@/lib/client/wakeLock';
import { stopSpeech } from '@/lib/client/tts';
import { fetchBalance } from '@/lib/client/points';

interface SpeechState {
  misaki: string;
  hiyori: string;
}

const BALANCE_POLL_MS = 30_000;

export default function MainPage() {
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [online, setOnline] = useState(true);
  const [position, setPosition] = useState<GeoPoint | null>(null);
  const [speech, setSpeech] = useState<SpeechState>({ misaki: '', hiyori: '' });
  const [, setCurrentSpot] = useState<Spot | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [lowThreshold, setLowThreshold] = useState<number>(100);
  const [pointsPerGenerate, setPointsPerGenerate] = useState<number>(10);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseReason, setPurchaseReason] = useState<'low' | 'zero'>('low');

  const positionRef = useRef<GeoPoint | null>(null);
  const pausedRef = useRef(false);
  const onlineRef = useRef(true);
  const loopRef = useRef<LoopController | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { onlineRef.current = online; }, [online]);

  const refreshBalance = useCallback(async () => {
    const b = await fetchBalance();
    if (b) {
      setBalance(b.total);
      setLowThreshold(b.lowThreshold);
      setPointsPerGenerate(b.pointsPerGenerate);
    }
  }, []);

  useEffect(() => {
    void refreshBalance();
    const t = setInterval(() => { void refreshBalance(); }, BALANCE_POLL_MS);
    return () => clearInterval(t);
  }, [refreshBalance]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    const handler = () => { void reacquireOnVisible(); };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  const onSpeakStart = useCallback((speaker: CharacterId) => {
    setSpeech((prev) => ({ ...prev, [speaker]: '' }));
  }, []);
  const onTextProgress = useCallback((speaker: CharacterId, text: string) => {
    setSpeech((prev) => prev[speaker] === text ? prev : { ...prev, [speaker]: text });
  }, []);
  const onSpeakEnd = useCallback(() => {}, []);
  const onSpotChange = useCallback((spot: Spot) => { setCurrentSpot(spot); }, []);
  const onOfflineNotice = useCallback(async () => {
    setSpeech({ misaki: 'ここは圏外のようです。電波が戻るまで少し待ちますね。', hiyori: '' });
  }, []);
  const onInsufficientPoints = useCallback(() => {
    setPurchaseReason('zero');
    setPurchaseOpen(true);
    void refreshBalance();
  }, [refreshBalance]);
  const onPointsConsumed = useCallback(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const handleStart = useCallback(async () => {
    if (!('geolocation' in navigator)) {
      alert('このブラウザは位置情報に対応していません');
      return;
    }
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      await ctx.resume();
    } catch { /* noop */ }

    await requestWakeLock();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        console.error('geolocation error:', err);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );

    setStarted(true);
    loopRef.current = startConversationLoop({
      getPosition: () => positionRef.current,
      isPaused: () => pausedRef.current,
      isOnline: () => onlineRef.current,
      onSpeakStart,
      onTextProgress,
      onSpeakEnd,
      onSpotChange,
      onOfflineNotice,
      onInsufficientPoints,
      onPointsConsumed,
    });
  }, [onSpeakStart, onTextProgress, onSpeakEnd, onSpotChange, onOfflineNotice, onInsufficientPoints, onPointsConsumed]);

  const handlePauseToggle = useCallback(() => {
    setPaused((prev) => {
      const next = !prev;
      if (next) stopSpeech();
      return next;
    });
  }, []);

  const openPurchase = useCallback((reason: 'low' | 'zero') => {
    setPurchaseReason(reason);
    setPurchaseOpen(true);
  }, []);

  useEffect(() => {
    return () => {
      loopRef.current?.abort();
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      stopSpeech();
    };
  }, []);

  if (!started) {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-neutral-950 text-neutral-100 px-4">
        <div className="text-center space-y-6 max-w-sm">
          <h1 className="text-2xl font-bold">旅コト</h1>
          <p className="text-sm text-neutral-300">
            自転車走行中のスマホ操作は法令で禁止されています。
            開始ボタンを押すと位置情報・画面常時点灯・音声再生が有効になります。
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-neutral-400">
            <span>コトポ残高: {balance === null ? '読み込み中...' : balance.toLocaleString()}</span>
            <button
              onClick={() => openPurchase('low')}
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-100"
            >
              チャージ
            </button>
          </div>
          <button
            onClick={handleStart}
            className="px-6 py-3 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-lg font-semibold"
          >
            開始
          </button>
        </div>
        <PurchaseModal open={purchaseOpen} reason={purchaseReason} onClose={() => setPurchaseOpen(false)} />
      </main>
    );
  }

  const showLowBanner =
    balance !== null && balance < lowThreshold && balance >= pointsPerGenerate;

  return (
    <main className="h-dvh flex flex-col bg-neutral-950 text-neutral-100">
      <div className="flex-1 min-h-0 relative">
        <MapView position={position} online={online} />
        <button
          onClick={handlePauseToggle}
          className={`absolute top-2 left-2 z-[1100] px-4 py-2 rounded-full text-sm font-medium shadow-lg backdrop-blur-sm ${paused ? 'bg-emerald-600/90 hover:bg-emerald-500' : 'bg-neutral-800/80 hover:bg-neutral-700'} text-white`}
        >
          {paused ? '再開' : '一時停止'}
        </button>
        <div className="absolute top-2 right-14 z-[1100]">
          <PointsBadge
            points={balance}
            low={balance !== null && balance < lowThreshold}
            onClick={() => openPurchase(balance !== null && balance < pointsPerGenerate ? 'zero' : 'low')}
          />
        </div>
        {showLowBanner && (
          <LowBalanceBanner points={balance!} onPurchase={() => openPurchase('low')} />
        )}
        <SettingsOverlay />
      </div>
      <div className="shrink-0 flex flex-col gap-2 py-2">
        <SpeechRow speaker="misaki" text={speech.misaki} side="right" />
        <SpeechRow speaker="hiyori" text={speech.hiyori} side="left" />
      </div>
      <PurchaseModal open={purchaseOpen} reason={purchaseReason} onClose={() => setPurchaseOpen(false)} />
    </main>
  );
}
