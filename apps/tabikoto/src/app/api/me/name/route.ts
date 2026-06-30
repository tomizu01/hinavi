import { NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_NAME_LENGTH = 8;

function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT name FROM users WHERE id = ?',
      [session.id],
    );
    const name = (rows[0]?.name as string | null) ?? null;
    return NextResponse.json({ name });
  } catch (err) {
    console.error('name fetch failed:', err);
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  if (!body || typeof body.name !== 'string') {
    return NextResponse.json({ error: '入力が不正です' }, { status: 400 });
  }
  const name = body.name.trim();
  if (name.length === 0) {
    return NextResponse.json({ error: '呼び名を入力してください' }, { status: 400 });
  }
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: `最大${MAX_NAME_LENGTH}文字までです` }, { status: 400 });
  }
  if (hasControlChar(name)) {
    return NextResponse.json({ error: '使用できない文字が含まれています' }, { status: 400 });
  }

  try {
    await pool.execute(
      'UPDATE users SET name = ? WHERE id = ?',
      [name, session.id],
    );
    return NextResponse.json({ name });
  } catch (err) {
    console.error('name update failed:', err);
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 });
  }
}
