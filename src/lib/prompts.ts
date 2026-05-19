import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CharacterId, PromptVariant } from './characters';
import { CHARACTERS } from './characters';

const cache = new Map<string, string>();

export async function loadCharacterPrompt(id: CharacterId, variant: PromptVariant): Promise<string> {
  const key = `${id}:${variant}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const filePath = path.join(process.cwd(), CHARACTERS[id].promptPaths[variant]);
  const text = await readFile(filePath, 'utf8');
  cache.set(key, text);
  return text;
}
