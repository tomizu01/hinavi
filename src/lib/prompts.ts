import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CharacterId } from './characters';
import { CHARACTERS } from './characters';

const cache = new Map<CharacterId, string>();

export async function loadCharacterPrompt(id: CharacterId): Promise<string> {
  const cached = cache.get(id);
  if (cached) return cached;
  const filePath = path.join(process.cwd(), CHARACTERS[id].promptPath);
  const text = await readFile(filePath, 'utf8');
  cache.set(id, text);
  return text;
}
