let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

export function stopSpeech(): void {
  if (currentAudio) {
    try { currentAudio.pause(); } catch { /* noop */ }
    currentAudio = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

import type { CharacterId } from '@/lib/characters';

const TTS_TIMEOUT_MS = 20_000;

export async function fetchWithTimeout(
  input: RequestInfo,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSpeechAudio(text: string, character: CharacterId): Promise<string | null> {
  if (!text.trim()) return null;
  const res = await fetchWithTimeout(
    '/api/tts',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, character }),
    },
    TTS_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`tts ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function loadAudio(url: string): Promise<HTMLAudioElement | null> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.preload = 'auto';
    const timer = setTimeout(() => resolve(audio), 3000);
    audio.addEventListener('canplaythrough', () => {
      clearTimeout(timer);
      resolve(audio);
    }, { once: true });
    audio.addEventListener('error', () => {
      clearTimeout(timer);
      resolve(null);
    }, { once: true });
    audio.load();
  });
}

export function playSpeechAudio(audio: HTMLAudioElement, url: string, maxDurationMs?: number): Promise<void> {
  stopSpeech();
  currentUrl = url;
  currentAudio = audio;
  return new Promise<void>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (currentUrl === url) {
        URL.revokeObjectURL(url);
        currentUrl = null;
        currentAudio = null;
      }
      resolve();
    };

    audio.onended = cleanup;
    audio.onerror = cleanup;
    if (maxDurationMs && maxDurationMs > 0) {
      timer = setTimeout(() => {
        try { audio.pause(); } catch { /* noop */ }
        cleanup();
      }, maxDurationMs);
    }
    audio.play().catch((err) => {
      console.error('[TTS] play failed:', err);
      cleanup();
    });
  });
}
