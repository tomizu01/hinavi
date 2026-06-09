export type TtsEngine = 'aivis' | 'elevenlabs';

const TTS_ENGINE_KEY = 'hinavi.ttsEngine';
const DEFAULT_ENGINE: TtsEngine = 'aivis';

export function getTtsEngine(): TtsEngine {
  if (typeof window === 'undefined') return DEFAULT_ENGINE;
  try {
    const v = window.localStorage.getItem(TTS_ENGINE_KEY);
    if (v === 'elevenlabs') return 'elevenlabs';
    if (v === 'aivis') return 'aivis';
    // Legacy value migration: 旧 'voicevox' 設定は Aivis に寄せる
    return DEFAULT_ENGINE;
  } catch {
    return DEFAULT_ENGINE;
  }
}

export function setTtsEngine(engine: TtsEngine): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TTS_ENGINE_KEY, engine);
  } catch {
    /* noop */
  }
}

const CLIMB_COUNT_KEY = 'hinavi.climbCount';
export const CLIMB_COUNT_MIN = 1;
export const CLIMB_COUNT_MAX = 23;
const DEFAULT_CLIMB_COUNT = 1;

export function getClimbCount(): number {
  if (typeof window === 'undefined') return DEFAULT_CLIMB_COUNT;
  try {
    const raw = window.localStorage.getItem(CLIMB_COUNT_KEY);
    const n = raw === null ? NaN : parseInt(raw, 10);
    if (!Number.isFinite(n)) return DEFAULT_CLIMB_COUNT;
    return clampClimb(n);
  } catch {
    return DEFAULT_CLIMB_COUNT;
  }
}

export function setClimbCount(n: number): number {
  const next = clampClimb(n);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CLIMB_COUNT_KEY, String(next));
    } catch {
      /* noop */
    }
  }
  return next;
}

function clampClimb(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CLIMB_COUNT;
  const i = Math.trunc(n);
  if (i < CLIMB_COUNT_MIN) return CLIMB_COUNT_MIN;
  if (i > CLIMB_COUNT_MAX) return CLIMB_COUNT_MAX;
  return i;
}
