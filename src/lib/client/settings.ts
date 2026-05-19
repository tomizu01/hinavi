export type TtsEngine = 'voicevox' | 'elevenlabs';

const TTS_ENGINE_KEY = 'hinavi.ttsEngine';
const DEFAULT_ENGINE: TtsEngine = 'voicevox';

export function getTtsEngine(): TtsEngine {
  if (typeof window === 'undefined') return DEFAULT_ENGINE;
  try {
    const v = window.localStorage.getItem(TTS_ENGINE_KEY);
    return v === 'elevenlabs' ? 'elevenlabs' : 'voicevox';
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
