import { NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { getSession } from '@/lib/session';
import { CHARACTERS } from '@/lib/characters';
import { loadCharacterPrompt } from '@/lib/prompts';
import { pool } from '@/lib/db';
import type { GenerateRequest } from '@/lib/types';

const DEFAULT_USER_NAME = 'あなた';

export const runtime = 'nodejs';

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview';

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

function buildPrompt(
  req: GenerateRequest,
  characterPrompt: string,
  userName: string,
  variant: 1 | 2,
): string {
  const recentHistory = req.history.slice(-10).map((h) => {
    const name = CHARACTERS[h.speaker].displayName;
    return `${name}: ${h.text}`;
  }).join('\n');

  const speakerName = CHARACTERS[req.speaker].displayName;
  const role = req.speaker === 'misaki' ? '案内役' : '盛り上げ役';
  const filledCharacterPrompt = characterPrompt.replaceAll('{user_name}', userName);

  const spotSection =
    variant === 1
      ? `

## 現在話題にしているスポット
- 名称: ${req.spot.name}
- 位置: 緯度 ${req.spot.lat.toFixed(5)}, 経度 ${req.spot.lng.toFixed(5)}
- カテゴリ: ${req.spot.types.join(', ')}`
      : '';

  return `あなたは「${speakerName}」（${role}）として、自転車で走るライダーへの音声案内の会話に参加します。

## キャラクター設定
${filledCharacterPrompt}${spotSection}

## これまでの会話（直近のみ）
${recentHistory || '（まだ会話は始まっていません）'}

## あなたの次の発話
上記の設定に従い、${speakerName}としての次の1発話だけを日本語で出力してください。
発話本文のみを出力し、話者名や引用符、説明、ト書きは付けないでください。`;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'gemini key not configured' }, { status: 500 });

  const body = (await req.json().catch(() => null)) as (GenerateRequest & { sessionId?: string; turnNo?: number }) | null;
  if (!body?.speaker || !body?.spot || !Array.isArray(body.history)) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const variant: 1 | 2 = typeof body.turnNo === 'number' && body.turnNo % 2 === 0 ? 2 : 1;
  const characterPrompt = await loadCharacterPrompt(body.speaker, variant);

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

  const prompt = buildPrompt(body, characterPrompt, userName, variant);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        topP: 0.95,
        // Gemini 3 family は推論モデルで thinking tokens が maxOutputTokens に含まれるため余裕を持たせる
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingLevel: 'low' },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('Gemini error:', res.status, detail);
    return NextResponse.json({ error: 'generation failed' }, { status: 502 });
  }

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim();
  if (!text) {
    return NextResponse.json({ error: 'empty response' }, { status: 502 });
  }

  if (body.sessionId && typeof body.turnNo === 'number') {
    try {
      await pool.execute(
        `INSERT INTO conversations (user_id, session_id, turn_no, speaker, spot_name, spot_lat, spot_lng, text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.userId,
          body.sessionId,
          body.turnNo,
          body.speaker,
          body.spot.name,
          body.spot.lat,
          body.spot.lng,
          text,
        ],
      );
    } catch (err) {
      console.error('conversation insert failed:', err);
    }
  }

  return NextResponse.json({ text });
}
