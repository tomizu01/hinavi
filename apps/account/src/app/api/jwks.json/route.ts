import { NextResponse } from 'next/server';
import { getJwtKeys } from '@/lib/jwt-keys';

export const runtime = 'nodejs';

export async function GET() {
  const { publicJwk, kid } = await getJwtKeys();
  const jwks = {
    keys: [
      {
        ...publicJwk,
        kid,
        use: 'sig',
        alg: 'RS256',
      },
    ],
  };
  return NextResponse.json(jwks, {
    headers: {
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    },
  });
}
