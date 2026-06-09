import { NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { getSession } from '@/lib/session';
import { CHARACTERS } from '@/lib/characters';
import { loadCharacterPrompt, loadKaiwaPrompt } from '@/lib/prompts';
import { pool } from '@/lib/db';
import type { ConversationLine, ConversationMode, GenerateRequest } from '@/lib/types';

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
  hiyori: string;
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

async function pickRandomTopic(): Promise<string> {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT topic FROM topics ORDER BY RAND() LIMIT 1',
    );
    const t = rows[0]?.topic;
    if (typeof t === 'string' && t.trim().length > 0) return t.trim();
  } catch (err) {
    console.error('topics select failed:', err);
  }
  return '';
}

function buildPrompt(
  body: GenerateRequest,
  characterPrompts: { misaki: string; hiyori: string },
  kaiwaPrompt: string,
  userName: string,
  topic: string,
): string {
  const climbStr = String(body.climbCount);
  const apply = (s: string) =>
    s.replaceAll('{user_name}', userName)
      .replaceAll('{climb_count}', climbStr)
      .replaceAll('{topic}', topic);

  const recentHistory = body.history.slice(-HISTORY_MAX).map((h) => {
    const name = CHARACTERS[h.speaker].displayName;
    return `${name}: ${h.text}`;
  }).join('\n');

  let contextSection = '';
  if (body.mode === 'time') {
    contextSection = `
## 現在時刻
${jstTime()}（日本時間）`;
  }

  return `# キャラクター設定: みさき
${apply(characterPrompts.misaki)}

# キャラクター設定: ひより
${apply(characterPrompts.hiyori)}

# 会話シーン指示
${apply(kaiwaPrompt)}
${contextSection}

# これまでの会話（直近${HISTORY_MAX}件）
${recentHistory || '（まだ会話は始まっていません）'}

# 出力指示
上記の設定に従い、みさきとひよりの次の1往復の発話を JSON で出力してください。
- 話者名・引用符・説明・ト書きは含めない
- 各発話は1〜3文、最大100文字以内
- 出力は { "misaki": "...", "hiyori": "..." } の形式のみ`;
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    misaki: { type: 'string' },
    hiyori: { type: 'string' },
  },
  required: ['misaki', 'hiyori'],
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
  const parsed = JSON.parse(text) as { misaki?: unknown; hiyori?: unknown };
  if (typeof parsed.misaki !== 'string' || typeof parsed.hiyori !== 'string') {
    throw new Error('gemini response missing speaker fields');
  }
  return { misaki: parsed.misaki.trim(), hiyori: parsed.hiyori.trim() };
}

async function callGeminiWithRetry(apiKey: string, prompt: string): Promise<GeneratedPair> {
  try {
    return await callGeminiOnce(apiKey, prompt);
  } catch (err) {
    console.warn('gemini call failed, retrying once:', err);
    return await callGeminiOnce(apiKey, prompt);
  }
}

async function insertConversation(
  userId: number,
  sessionId: string,
  turnNo: number,
  mode: ConversationMode,
  speaker: 'misaki' | 'hiyori',
  text: string,
  topic: string,
): Promise<void> {
  await pool.execute(
    `INSERT INTO conversations
     (user_id, session_id, turn_no, mode, speaker, spot_name, text)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      sessionId,
      turnNo,
      mode,
      speaker,
      topic.length > 0 ? topic.slice(0, 255) : null,
      text,
    ],
  );
}

function validBody(b: unknown): b is GenerateRequest {
  if (!b || typeof b !== 'object') return false;
  const r = b as Record<string, unknown>;
  if (r.mode !== 'topic' && r.mode !== 'rest' && r.mode !== 'time') return false;
  if (typeof r.turnNo !== 'number') return false;
  if (typeof r.sessionId !== 'string') return false;
  if (!Array.isArray(r.history)) return false;
  if (typeof r.climbCount !== 'number') return false;
  return true;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'gemini key not configured' }, { status: 500 });

  const body = (await req.json().catch(() => null)) as unknown;
  if (!validBody(body)) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const req2 = body as GenerateRequest & { history: ConversationLine[] };

  const [misakiPrompt, hiyoriPrompt, kaiwaPrompt, topic] = await Promise.all([
    loadCharacterPrompt('misaki'),
    loadCharacterPrompt('hiyori'),
    loadKaiwaPrompt(req2.mode),
    req2.mode === 'topic' ? pickRandomTopic() : Promise.resolve(''),
  ]);

  let userName = DEFAULT_USER_NAME;
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT display_name FROM users WHERE id = ?',
      [session.userId],
    );
    const dn = rows[0]?.display_name;
    if (typeof dn === 'string' && dn.trim().length > 0) userName = dn.trim();
  } catch (err) {
    console.error('display_name fetch failed:', err);
  }

  const prompt = buildPrompt(
    req2,
    { misaki: misakiPrompt, hiyori: hiyoriPrompt },
    kaiwaPrompt,
    userName,
    topic,
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
      insertConversation(session.userId, req2.sessionId, req2.turnNo, req2.mode, 'misaki', pair.misaki, topic),
      insertConversation(session.userId, req2.sessionId, req2.turnNo, req2.mode, 'hiyori', pair.hiyori, topic),
    ]);
  } catch (err) {
    console.error('conversation insert failed:', err);
  }

  return NextResponse.json({ ...pair, topic });
}
