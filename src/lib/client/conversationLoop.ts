import type { CharacterId } from '@/lib/characters';
import { CHARACTERS, TURN_ORDER } from '@/lib/characters';
import type { ConversationLine, Spot } from '@/lib/types';
import { haversineMeters, type GeoPoint } from './geo';
import { fetchSpeechAudio, loadAudio, playSpeechAudio, stopSpeech } from './tts';

const REFETCH_DISTANCE_M = 500;
const HISTORY_HOURS = 1;
const HISTORY_MAX = 10;
const WAIT_BETWEEN_MS = 10_000;
const TYPING_CHARS_PER_SEC = 7;

export interface LoopCallbacks {
  getPosition: () => GeoPoint | null;
  isPaused: () => boolean;
  isOnline: () => boolean;
  onSpeakStart: (speaker: CharacterId) => void;
  onTextProgress: (speaker: CharacterId, text: string) => void;
  onSpeakEnd: (speaker: CharacterId, fullText: string, spot: Spot) => void;
  onSpotChange: (spot: Spot) => void;
  onOfflineNotice: () => Promise<void>;
}

interface FetchResult {
  spots: Spot[];
  origin: GeoPoint;
}

async function fetchNearby(p: GeoPoint): Promise<Spot[]> {
  const res = await fetch('/api/places/nearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: p.lat, lng: p.lng, radius: 2000 }),
  });
  if (!res.ok) throw new Error(`places ${res.status}`);
  const data = (await res.json()) as { spots: Spot[] };
  return data.spots ?? [];
}

async function generate(
  speaker: CharacterId,
  spot: Spot,
  history: ConversationLine[],
  sessionId: string,
  turnNo: number,
): Promise<string> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ speaker, spot, history, sessionId, turnNo }),
  });
  if (!res.ok) throw new Error(`generate ${res.status}`);
  const data = (await res.json()) as { text: string };
  return data.text;
}

function filterHistory(history: ConversationLine[]): ConversationLine[] {
  const cutoff = Date.now() - HISTORY_HOURS * 60 * 60 * 1000;
  return history.filter((h) => h.createdAt >= cutoff).slice(-HISTORY_MAX);
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
): Promise<void> {
  cb.onSpeakStart(speaker);
  cb.onTextProgress(speaker, '');

  const speakerId = CHARACTERS[speaker].voicevoxSpeakerId;
  const audioUrl = await fetchSpeechAudio(text, speakerId);

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
  const history: ConversationLine[] = [];
  let turnNo = 0;

  (async () => {
    while (!abortSignal.aborted) {
      while (cb.isPaused() && !abortSignal.aborted) {
        await wait(500, abortSignal);
      }
      if (abortSignal.aborted) return;

      if (!cb.isOnline()) {
        await cb.onOfflineNotice();
        await wait(5000, abortSignal);
        continue;
      }

      const pos = cb.getPosition();
      if (!pos) {
        await wait(1000, abortSignal);
        continue;
      }

      // Step 2: fetch nearby spots
      try {
        if (!lastFetch || haversineMeters(pos, lastFetch.origin) >= REFETCH_DISTANCE_M) {
          const spots = await fetchNearby(pos);
          if (spots.length > 0) lastFetch = { spots, origin: pos };
        }
      } catch (err) {
        console.error('places fetch failed:', err);
      }
      if (!lastFetch || lastFetch.spots.length === 0) {
        await wait(3000, abortSignal);
        continue;
      }

      // Step 3: choose target spot
      currentSpot = pickSpot(lastFetch.spots, currentSpot);
      if (!currentSpot) {
        await wait(2000, abortSignal);
        continue;
      }
      cb.onSpotChange(currentSpot);
      turnNo += 1;

      for (const speaker of TURN_ORDER) {
        if (abortSignal.aborted) return;
        while (cb.isPaused() && !abortSignal.aborted) await wait(500, abortSignal);
        if (abortSignal.aborted) return;

        let text: string;
        try {
          text = await generate(speaker, currentSpot, filterHistory(history), sessionId, turnNo);
        } catch (err) {
          console.error('generate failed:', err);
          await wait(3000, abortSignal);
          continue;
        }
        await speakAndType(speaker, text, cb, abortSignal);
        const line: ConversationLine = {
          speaker,
          text,
          spotName: currentSpot.name,
          createdAt: Date.now(),
        };
        history.push(line);
        cb.onSpeakEnd(speaker, text, currentSpot);
        await wait(WAIT_BETWEEN_MS, abortSignal);
      }
    }
  })().catch((err) => console.error('loop crashed:', err));

  return {
    abort() {
      abortSignal.aborted = true;
      stopSpeech();
    },
  };
}
