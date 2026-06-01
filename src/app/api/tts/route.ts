import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { CHARACTERS, type CharacterId } from '@/lib/characters';
import { applyTtsReadings } from '@/lib/tts-readings';

export const runtime = 'nodejs';

const AIVIS_SYNTHESIZE_URL = 'https://api.aivis-project.com/v1/tts/synthesize';
const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';

type TtsEngine = 'aivis' | 'elevenlabs';

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
  const engine: TtsEngine = body.engine === 'elevenlabs' ? 'elevenlabs' : 'aivis';
  const character = CHARACTERS[body.character];
  const spokenText = applyTtsReadings(body.text);

  if (engine === 'elevenlabs') {
    return synthesizeElevenLabs(spokenText, character.elevenLabsVoiceId);
  }
  return synthesizeAivis(spokenText, character.aivisModelUuid);
}

async function synthesizeAivis(text: string, modelUuid: string) {
  const token = process.env.AIVIS_CLOUD_API_TOKEN;
  if (!token) return NextResponse.json({ error: 'aivis token not configured' }, { status: 500 });

  try {
    const res = await fetch(AIVIS_SYNTHESIZE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        model_uuid: modelUuid,
        text,
        output_format: 'mp3',
        use_ssml: false,
        tempo_dynamics: 1.5,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error('Aivis synthesis failed:', res.status, detail);
      return NextResponse.json({ error: 'aivis failed' }, { status: 502 });
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
    console.error('Aivis TTS proxy error:', err);
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
