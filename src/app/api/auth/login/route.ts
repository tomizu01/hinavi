import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/session';
import type { RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';

interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  password_hash: string;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { username?: string; password?: string } | null;
  if (!body?.username || !body?.password) {
    return NextResponse.json({ error: 'username and password required' }, { status: 400 });
  }

  const [rows] = await pool.query<UserRow[]>(
    'SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1',
    [body.username],
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
  }

  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  await session.save();

  return NextResponse.json({ ok: true, username: user.username });
}
