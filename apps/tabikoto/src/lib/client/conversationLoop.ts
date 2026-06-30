import type { CharacterId } from '@/lib/characters';
import type { ConversationLine, ConversationMode, GenerateResponse, Spot } from '@/lib/types';
import { haversineMeters, type GeoPoint } from './geo';
import { fetchSpeechAudio, fetchWithTimeout, loadAudio, playSpeechAudio, stopSpeech } from './tts';
import { InsufficientPointsError } from './points';

const REFETCH_DISTANCE_M = 1500;
const HISTORY_MAX = 5;
const WAIT_BETWEEN_MS = 10_000;
const TYPING_CHARS_PER_SEC = 7;
const PLACES_TIMEOUT_MS = 38_000;
const GENERATE_TIMEOUT_MS = 25_000;
const OFFLINE_AFTER_FAILS = 2;

const MIN_TURNS_PER_SPOT = 2;
const REST_INTERVAL = 6;
const TIME_INTERVAL = 30;

export interface LoopCallbacks {
  getPosition: () => GeoPoint | null;
  isPaused: () => boolean;
  isOnline: () => boolean;
  onSpeakStart: (speaker: CharacterId) => void;
  onTextProgress: (speaker: CharacterId, text: string) => void;
  onSpeakEnd: (speaker: CharacterId, fullText: string, spot: Spot | null) => void;
  onSpotChange: (spot: Spot) => void;
  onOfflineNotice: () => Promise<void>;
  onInsufficientPoints?: () => void;
  onPointsConsumed?: () => void;
}

interface FetchResult {
  spots: Spot[];
  origin: GeoPoint;
}

interface GenerateBody {
  mode: ConversationMode;
  turnNo: number;
  sessionId: string;
  history: ConversationLine[];
  spot?: Spot;
  isSpotContinuation?: boolean;
  distanceMeters?: number;
}

function computeMode(turnNo: number): ConversationMode {
  if (turnNo % TIME_INTERVAL === 0) return 'time';
  if (turnNo % REST_INTERVAL === 0) return 'rest';
  return 'spot';
}

async function fetchNearby(p: GeoPoint, sessionId: string): Promise<Spot[]> {
  const res = await fetchWithTimeout(
    '/api/places/nearby',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: p.lat, lng: p.lng, sessionId }),
    },
    PLACES_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`places ${res.status}`);
  const data = (await res.json()) as { spots: Spot[] };
  return data.spots ?? [];
}

async function generatePair(body: GenerateBody): Promise<GenerateResponse> {
  const res = await fetchWithTimeout(
    '/api/generate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    GENERATE_TIMEOUT_MS,
  );
  if (res.status === 402) {
    const data = (await res.json().catch(() => ({}))) as { required?: number };
    throw new InsufficientPointsError(data.required ?? 10);
  }
  if (!res.ok) throw new Error(`generate ${res.status}`);
  const data = (await res.json()) as GenerateResponse;
  if (typeof data.misaki !== 'string' || typeof data.hiyori !== 'string') {
    throw new Error('generate: malformed response');
  }
  return data;
}

function filterHistory(history: ConversationLine[]): ConversationLine[] {
  return history.slice(-HISTORY_MAX);
}

function pickSpot(spots: Spot[], previous: Spot | null): Spot | null {
  if (spots.length === 0) return null;
  if (spots.length === 1) return spots[0];
  const candidates = previous ? spots.filter((s) => s.id !== previous.id) : spots;
  const pool = candidates.length > 0 ? candidates : spots;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function typewriter(
  speaker: CharacterId,
  text: string,
  onProgress: (speaker: CharacterId, text: string) => void,
  audioMs: number,
  abortSignal: { aborted: boolean },
): Promise<void> {
  const baseDuration = (text.length / TYPING_CHARS_PER_SEC) * 1000;
  const duration = Math.max(baseDuration, audioMs);
  const start = performance.now();
  return new Promise((resolve) => {
    function step() {
      if (abortSignal.aborted) return resolve();
      const elapsed = performance.now() - start;
      const ratio = Math.min(elapsed / duration, 1);
      const count = Math.floor(text.length * ratio);
      onProgress(speaker, text.slice(0, count));
      if (ratio >= 1) {
        onProgress(speaker, text);
        resolve();
      } else {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  });
}

async function speakAndType(
  speaker: CharacterId,
  text: string,
  cb: LoopCallbacks,
  abortSignal: { aborted: boolean },
): Promise<{ netError: boolean }> {
  cb.onSpeakStart(speaker);
  cb.onTextProgress(speaker, '');

  let audioUrl: string | null = null;
  let netError = false;
  try {
    audioUrl = await fetchSpeechAudio(text, speaker);
  } catch (err) {
    console.error('tts fetch failed:', err);
    netError = true;
  }

  let audioMs = 0;
  let audio: HTMLAudioElement | null = null;
  if (audioUrl) {
    audio = await loadAudio(audioUrl);
    if (audio && Number.isFinite(audio.duration)) audioMs = audio.duration * 1000;
  }

  const playPromise = audio && audioUrl ? playSpeechAudio(audio, audioUrl, 30000) : Promise.resolve();
  await Promise.all([
    typewriter(speaker, text, cb.onTextProgress, audioMs, abortSignal),
    playPromise,
  ]);
  return { netError };
}

async function wait(ms: number, abortSignal: { aborted: boolean }): Promise<void> {
  const step = 100;
  let waited = 0;
  while (waited < ms) {
    if (abortSignal.aborted) return;
    await new Promise((r) => setTimeout(r, step));
    waited += step;
  }
}

export interface LoopController {
  abort: () => void;
}

export function startConversationLoop(cb: LoopCallbacks): LoopController {
  const abortSignal = { aborted: false };
  const sessionId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let lastFetch: FetchResult | null = null;
  let currentSpot: Spot | null = null;
  let spotTurnCount = 0;
  const history: ConversationLine[] = [];
  let turnNo = 0;
  let netFails = 0;

  (async () => {
    while (!abortSignal.aborted) {
      while (cb.isPaused() && !abortSignal.aborted) {
        await wait(500, abortSignal);
      }
      if (abortSignal.aborted) return;

      if (!cb.isOnline() || netFails >= OFFLINE_AFTER_FAILS) {
        await cb.onOfflineNotice();
        await wait(5000, abortSignal);
        netFails = 0;
        continue;
      }

      const pos = cb.getPosition();
      if (!pos) {
        await wait(1000, abortSignal);
        continue;
      }

      const nextTurnNo = turnNo + 1;
      const mode = computeMode(nextTurnNo);

      let spotForTurn: Spot | undefined;
      let isSpotContinuation = false;
      let nextSpotTurnCount = spotTurnCount;

      if (mode === 'spot') {
        try {
          if (!lastFetch || haversineMeters(pos, lastFetch.origin) >= REFETCH_DISTANCE_M) {
            const spots = await fetchNearby(pos, sessionId);
            if (spots.length > 0) lastFetch = { spots, origin: pos };
            netFails = 0;
          }
        } catch (err) {
          console.error('places fetch failed:', err);
          netFails += 1;
          continue;
        }
        if (!lastFetch || lastFetch.spots.length === 0) {
          await wait(3000, abortSignal);
          continue;
        }

        if (currentSpot && spotTurnCount < MIN_TURNS_PER_SPOT) {
          spotForTurn = currentSpot;
          isSpotContinuation = true;
          nextSpotTurnCount = spotTurnCount + 1;
        } else {
          const picked = pickSpot(lastFetch.spots, currentSpot);
          if (!picked) {
            await wait(2000, abortSignal);
            continue;
          }
          spotForTurn = picked;
          isSpotContinuation = currentSpot?.id === picked.id;
          nextSpotTurnCount = isSpotContinuation ? spotTurnCount + 1 : 1;
        }
      }

      turnNo = nextTurnNo;
      if (spotForTurn) {
        currentSpot = spotForTurn;
        spotTurnCount = nextSpotTurnCount;
        cb.onSpotChange(spotForTurn);
      }

      const distanceMeters = spotForTurn
        ? haversineMeters(pos, { lat: spotForTurn.lat, lng: spotForTurn.lng })
        : undefined;

      let pair: GenerateResponse;
      try {
        pair = await generatePair({
          mode,
          turnNo,
          sessionId,
          history: filterHistory(history),
          spot: spotForTurn,
          isSpotContinuation,
          distanceMeters,
        });
        netFails = 0;
      } catch (err) {
        if (err instanceof InsufficientPointsError) {
          cb.onInsufficientPoints?.();
          // 残高が回復するまで一時停止扱いで待機 (UIが購入導線を表示)
          while (!abortSignal.aborted) {
            await wait(5000, abortSignal);
            // 次ループに進ませて再度残高チェックさせる
            break;
          }
          turnNo = nextTurnNo - 1; // 同じターン番号を再度試行
          continue;
        }
        console.error('generate failed:', err);
        netFails += 1;
        continue;
      }
      cb.onPointsConsumed?.();

      let bailToOffline = false;
      const lines: Array<{ speaker: CharacterId; text: string }> = [
        { speaker: 'misaki', text: pair.misaki },
        { speaker: 'hiyori', text: pair.hiyori },
      ];

      for (const { speaker, text } of lines) {
        if (abortSignal.aborted) return;
        while (cb.isPaused() && !abortSignal.aborted) await wait(500, abortSignal);
        if (abortSignal.aborted) return;

        const { netError } = await speakAndType(speaker, text, cb, abortSignal);
        if (netError) {
          netFails += 1;
          if (netFails >= OFFLINE_AFTER_FAILS) {
            bailToOffline = true;
            break;
          }
        } else {
          netFails = 0;
        }
        history.push({
          speaker,
          text,
          spotName: spotForTurn?.name ?? null,
          createdAt: Date.now(),
        });
        cb.onSpeakEnd(speaker, text, spotForTurn ?? null);
        await wait(WAIT_BETWEEN_MS, abortSignal);
      }
      if (bailToOffline) continue;
    }
  })().catch((err) => console.error('loop crashed:', err));

  return {
    abort() {
      abortSignal.aborted = true;
      stopSpeech();
    },
  };
}
