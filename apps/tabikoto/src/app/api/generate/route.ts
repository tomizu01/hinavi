import { NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { getSession } from '@/lib/session';
import { CHARACTERS } from '@/lib/characters';
import { loadCharacterPrompt, loadKaiwaPrompt } from '@/lib/prompts';
import { pool } from '@/lib/db';
import { formatDistance } from '@/lib/distance';
import type { ConversationLine, ConversationMode, GenerateRequest, Spot } from '@/lib/types';

const DEFAULT_USER_NAME = 'あなた';

export const runtime = 'nodejs';

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite';
const MAX_OUTPUT_TOKENS = 1024;
const HISTORY_MAX = 5;

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

interface GeneratedPair {
  misaki: string;
  hinata: string;
}

function jstTime(): string {
  const fmt = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return fmt.format(new Date());
}

function buildPrompt(
  body: GenerateRequest,
  characterPrompts: { misaki: string; hinata: string },
  kaiwaPrompt: string,
  userName: string,
  currentTopic: string,
): string {
  const fillUser = (s: string) => s.replaceAll('{user_name}', userName);
  const fillTopic = (s: string) => s.replaceAll('{current_topic}', currentTopic);
  const fillAll = (s: string) => fillTopic(fillUser(s));

  const recentHistory = body.history.slice(-HISTORY_MAX).map((h) => {
    const name = CHARACTERS[h.speaker].displayName;
    return `${name}: ${h.text}`;
  }).join('\n');

  let contextSection = '';
  if (body.mode === 'spot' && body.spot) {
    const continuationNote = body.isSpotContinuation
      ? '現在、以下のスポット情報について会話を継続中です。'
      : '話題にするスポットの情報が変更されました。下記のスポットを話題にして新規に会話してください。';
    const distanceLine =
      typeof body.distanceMeters === 'number' && Number.isFinite(body.distanceMeters)
        ? `\n- 距離: ${formatDistance(body.distanceMeters)}（会話で距離に言及する場合は必ずこの表現をそのまま使用。「近く」「あと少し」等の曖昧表現は禁止）`
        : '';
    contextSection = `
## 会話継続状況
${continuationNote}

## 話題にするスポット
- 名称: ${body.spot.name}
- 位置: 緯度 ${body.spot.lat.toFixed(5)}, 経度 ${body.spot.lng.toFixed(5)}
- カテゴリ: ${body.spot.types.join(', ')}${distanceLine}`;
  } else if (body.mode === 'time') {
    contextSection = `
## 現在時刻
${jstTime()}（日本時間）`;
  }

  return `# キャラクター設定: みさき
${fillUser(characterPrompts.misaki)}

# キャラクター設定: ひなた
${fillUser(characterPrompts.hinata)}

# 会話シーン指示
${fillAll(kaiwaPrompt)}
${contextSection}

# これまでの会話（直近${HISTORY_MAX}件）
${recentHistory || '（まだ会話は始まっていません）'}

# 出力指示
上記の設定に従い、みさきとひなたの次の1往復の発話を JSON で出力してください。
- 話者名・引用符・説明・ト書きは含めない
- 各発話は1〜3文、最大100文字以内
- 出力は { "misaki": "...", "hinata": "..." } の形式のみ`;
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    misaki: { type: 'string' },
    hinata: { type: 'string' },
  },
  required: ['misaki', 'hinata'],
};

async function callGeminiOnce(apiKey: string, prompt: string): Promise<GeneratedPair> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        topP: 0.95,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingLevel: 'low' },
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`gemini http ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim();
  if (!text) throw new Error('gemini empty response');
  const parsed = JSON.parse(text) as { misaki?: unknown; hinata?: unknown };
  if (typeof parsed.misaki !== 'string' || typeof parsed.hinata !== 'string') {
    throw new Error('gemini response missing speaker fields');
  }
  return { misaki: parsed.misaki.trim(), hinata: parsed.hinata.trim() };
}

async function callGeminiWithRetry(apiKey: string, prompt: string): Promise<GeneratedPair> {
  try {
    return await callGeminiOnce(apiKey, prompt);
  } catch (err) {
    console.warn('gemini call failed, retrying once:', err);
    return await callGeminiOnce(apiKey, prompt);
  }
}

async function pickRandomTopic(): Promise<string> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT topic FROM topics WHERE is_active = 1 ORDER BY RAND() LIMIT 1',
  );
  const t = rows[0]?.topic;
  return typeof t === 'string' && t.trim().length > 0 ? t.trim() : '最近ハマってること';
}

async function insertConversation(
  userId: string,
  sessionId: string,
  turnNo: number,
  mode: ConversationMode,
  speaker: 'misaki' | 'hinata',
  text: string,
  spot: Spot | undefined,
): Promise<void> {
  await pool.execute(
    `INSERT INTO conversations
     (user_id, session_id, turn_no, mode, speaker, spot_name, spot_lat, spot_lng, text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      sessionId,
      turnNo,
      mode,
      speaker,
      spot?.name ?? null,
      spot?.lat ?? null,
      spot?.lng ?? null,
      text,
    ],
  );
}

function validBody(b: unknown): b is GenerateRequest {
  if (!b || typeof b !== 'object') return false;
  const r = b as Record<string, unknown>;
  if (r.mode !== 'spot' && r.mode !== 'rest' && r.mode !== 'time') return false;
  if (typeof r.turnNo !== 'number') return false;
  if (typeof r.sessionId !== 'string') return false;
  if (!Array.isArray(r.history)) return false;
  if (r.mode === 'spot' && (!r.spot || typeof r.spot !== 'object')) return false;
  if (r.distanceMeters !== undefined && typeof r.distanceMeters !== 'number') return false;
  return true;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'gemini key not configured' }, { status: 500 });

  const body = (await req.json().catch(() => null)) as unknown;
  if (!validBody(body)) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const req2 = body as GenerateRequest & { history: ConversationLine[] };

  const [misakiPrompt, hinataPrompt, kaiwaPrompt] = await Promise.all([
    loadCharacterPrompt('misaki'),
    loadCharacterPrompt('hinata'),
    loadKaiwaPrompt(req2.mode),
  ]);

  let userName = session.name?.trim() || DEFAULT_USER_NAME;
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT name FROM users WHERE id = ?',
      [session.id],
    );
    const dn = rows[0]?.name;
    if (typeof dn === 'string' && dn.trim().length > 0) userName = dn.trim();
  } catch (err) {
    console.error('user name fetch failed:', err);
  }

  let currentTopic = '';
  if (req2.mode === 'rest') {
    try {
      currentTopic = await pickRandomTopic();
    } catch (err) {
      console.error('topic fetch failed:', err);
      currentTopic = '最近ハマってること';
    }
  }

  const prompt = buildPrompt(
    req2,
    { misaki: misakiPrompt, hinata: hinataPrompt },
    kaiwaPrompt,
    userName,
    currentTopic,
  );

  let pair: GeneratedPair;
  try {
    pair = await callGeminiWithRetry(apiKey, prompt);
  } catch (err) {
    console.error('gemini failed after retry:', err);
    return NextResponse.json({ error: 'generation failed' }, { status: 502 });
  }

  try {
    await Promise.all([
      insertConversation(session.id, req2.sessionId, req2.turnNo, req2.mode, 'misaki', pair.misaki, req2.spot),
      insertConversation(session.id, req2.sessionId, req2.turnNo, req2.mode, 'hinata', pair.hinata, req2.spot),
    ]);
  } catch (err) {
    console.error('conversation insert failed:', err);
  }

  return NextResponse.json(pair);
}
