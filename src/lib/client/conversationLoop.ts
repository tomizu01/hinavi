import type { CharacterId } from '@/lib/characters';
import type { ConversationLine, ConversationMode, GenerateResponse } from '@/lib/types';
import { getClimbCount } from './settings';
import { fetchSpeechAudio, fetchWithTimeout, loadAudio, playSpeechAudio, stopSpeech } from './tts';

const HISTORY_MAX = 5;
const WAIT_BETWEEN_MS = 10_000;
const TYPING_CHARS_PER_SEC = 7;
const GENERATE_TIMEOUT_MS = 25_000;
const OFFLINE_AFTER_FAILS = 2;

const REST_INTERVAL = 6;
const TIME_INTERVAL = 30;
const TURNS_PER_TOPIC = 3;

export interface LoopCallbacks {
  isPaused: () => boolean;
  isOnline: () => boolean;
  onSpeakStart: (speaker: CharacterId) => void;
  onTextProgress: (speaker: CharacterId, text: string) => void;
  onSpeakEnd: (speaker: CharacterId, fullText: string) => void;
  onTurnInfo: (mode: ConversationMode, topic: string) => void;
  onOfflineNotice: () => Promise<void>;
}

interface GenerateBody {
  mode: ConversationMode;
  turnNo: number;
  sessionId: string;
  history: ConversationLine[];
  climbCount: number;
  topic?: string;
}

function computeMode(turnNo: number): ConversationMode {
  if (turnNo % TIME_INTERVAL === 0) return 'time';
  if (turnNo % REST_INTERVAL === 0) return 'rest';
  return 'topic';
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

  const history: ConversationLine[] = [];
  let turnNo = 0;
  let netFails = 0;
  let currentTopic: string | null = null;
  let topicTurnCount = 0;

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

      turnNo += 1;
      const mode = computeMode(turnNo);

      let topicForRequest: string | undefined;
      if (mode === 'topic') {
        if (currentTopic && topicTurnCount < TURNS_PER_TOPIC) {
          topicForRequest = currentTopic;
        }
        // else: leave undefined → server picks a random topic
      }

      let pair: GenerateResponse;
      try {
        pair = await generatePair({
          mode,
          turnNo,
          sessionId,
          history: filterHistory(history),
          climbCount: getClimbCount(),
          topic: topicForRequest,
        });
        netFails = 0;
      } catch (err) {
        console.error('generate failed:', err);
        netFails += 1;
        continue;
      }

      if (mode === 'topic') {
        const returned = pair.topic ?? '';
        if (topicForRequest !== undefined && returned === topicForRequest) {
          topicTurnCount += 1;
        } else {
          currentTopic = returned.length > 0 ? returned : null;
          topicTurnCount = 1;
        }
      }
      cb.onTurnInfo(mode, pair.topic ?? '');

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
          createdAt: Date.now(),
        });
        cb.onSpeakEnd(speaker, text);
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
