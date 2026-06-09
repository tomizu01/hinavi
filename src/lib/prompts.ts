import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CharacterId } from './characters';
import { CHARACTERS } from './characters';
import type { ConversationMode } from './types';

const cache = new Map<string, string>();

async function loadCached(filePath: string): Promise<string> {
  const cached = cache.get(filePath);
  if (cached) return cached;
  const abs = path.join(process.cwd(), filePath);
  const text = await readFile(abs, 'utf8');
  cache.set(filePath, text);
  return text;
}

export function loadCharacterPrompt(id: CharacterId): Promise<string> {
  return loadCached(CHARACTERS[id].promptPath);
}

const KAIWA_PATHS: Record<ConversationMode, string> = {
  topic: 'prompts/kaiwa/kaiwa1.md',
  rest: 'prompts/kaiwa/kaiwa2.md',
  time: 'prompts/kaiwa/kaiwa3.md',
};

export function loadKaiwaPrompt(mode: ConversationMode): Promise<string> {
  return loadCached(KAIWA_PATHS[mode]);
}
