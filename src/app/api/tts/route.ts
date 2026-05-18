import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';

const SAKURA_BASE = 'https://api.ai.sakura.ad.jp/tts/v1';

interface ReqBody {
  text?: string;
  speaker?: number;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const token = process.env.SAKURA_AI_TOKEN;
  if (!token) return NextResponse.json({ error: 'tts token not configured' }, { status: 500 });

  const body = (await req.json().catch(() => null)) as ReqBody | null;
  if (!body?.text || typeof body.text !== 'string' || body.text.length > 1000) {
    return NextResponse.json({ error: 'invalid text' }, { status: 400 });
  }
  if (typeof body.speaker !== 'number') {
    return NextResponse.json({ error: 'invalid speaker' }, { status: 400 });
  }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    const queryRes = await fetch(
      `${SAKURA_BASE}/audio_query?${new URLSearchParams({ text: body.text, speaker: String(body.speaker) })}`,
      { method: 'POST', headers },
    );
    if (!queryRes.ok) {
      const detail = await queryRes.text();
      console.error('Sakura audio_query failed:', queryRes.status, detail);
      return NextResponse.json({ error: 'audio_query failed' }, { status: 502 });
    }
    const audioQuery = await queryRes.json();

    const synthRes = await fetch(
      `${SAKURA_BASE}/synthesis?${new URLSearchParams({ speaker: String(body.speaker) })}`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(audioQuery),
      },
    );
    if (!synthRes.ok) {
      const detail = await synthRes.text();
      console.error('Sakura synthesis failed:', synthRes.status, detail);
      return NextResponse.json({ error: 'synthesis failed' }, { status: 502 });
    }

    const wavBuffer = await synthRes.arrayBuffer();
    return new NextResponse(wavBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(wavBuffer.byteLength),
      },
    });
  } catch (err) {
    console.error('Sakura TTS proxy error:', err);
    return NextResponse.json({ error: 'tts unavailable' }, { status: 502 });
  }
}
