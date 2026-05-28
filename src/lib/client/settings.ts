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
