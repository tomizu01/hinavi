import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { CHARACTERS, type CharacterId } from '@/lib/characters';

export const runtime = 'nodejs';

const SAKURA_BASE = 'https://api.ai.sakura.ad.jp/tts/v1';
const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';

type TtsEngine = 'voicevox' | 'elevenlabs';

interface ReqBody {
  text?: string;
  character?: CharacterId;
  engine?: TtsEngine;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as ReqBody | null;
  if (!body?.text || typeof body.text !== 'string' || body.text.length > 1000) {
    return NextResponse.json({ error: 'invalid text' }, { status: 400 });
  }
  if (!body.character || !(body.character in CHARACTERS)) {
    return NextResponse.json({ error: 'invalid character' }, { status: 400 });
  }
  const engine: TtsEngine = body.engine === 'elevenlabs' ? 'elevenlabs' : 'voicevox';
  const character = CHARACTERS[body.character];

  if (engine === 'elevenlabs') {
    return synthesizeElevenLabs(body.text, character.elevenLabsVoiceId);
  }
  return synthesizeVoicevox(body.text, character.voicevoxSpeakerId);
}

async function synthesizeVoicevox(text: string, speakerId: number) {
  const token = process.env.SAKURA_AI_TOKEN;
  if (!token) return NextResponse.json({ error: 'tts token not configured' }, { status: 500 });
  const headers = { Authorization: `Bearer ${token}` };

  try {
    const queryRes = await fetch(
      `${SAKURA_BASE}/audio_query?${new URLSearchParams({ text, speaker: String(speakerId) })}`,
      { method: 'POST', headers },
    );
    if (!queryRes.ok) {
      const detail = await queryRes.text();
      console.error('Sakura audio_query failed:', queryRes.status, detail);
      return NextResponse.json({ error: 'audio_query failed' }, { status: 502 });
    }
    const audioQuery = await queryRes.json();

    const synthRes = await fetch(
      `${SAKURA_BASE}/synthesis?${new URLSearchParams({ speaker: String(speakerId) })}`,
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

async function synthesizeElevenLabs(text: string, voiceId: string) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'elevenlabs key not configured' }, { status: 500 });

  try {
    const res = await fetch(
      `${ELEVENLABS_BASE}/${encodeURIComponent(voiceId)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_v3',
          language_code: 'ja',
          output_format: 'mp3_44100_64',
          voice_settings: {
            stability: 1.0,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      },
    );
    if (!res.ok) {
      const detail = await res.text();
      console.error('ElevenLabs synthesis failed:', res.status, detail);
      return NextResponse.json({ error: 'elevenlabs failed' }, { status: 502 });
    }
    const mp3Buffer = await res.arrayBuffer();
    return new NextResponse(mp3Buffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(mp3Buffer.byteLength),
      },
    });
  } catch (err) {
    console.error('ElevenLabs TTS proxy error:', err);
    return NextResponse.json({ error: 'tts unavailable' }, { status: 502 });
  }
}
