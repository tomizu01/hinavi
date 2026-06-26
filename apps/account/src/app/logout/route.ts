import { NextResponse, type NextRequest } from 'next/server';
import { signOut } from '@/auth';
import { sanitizeReturnUrl } from '@/lib/return-url';

export const runtime = 'nodejs';

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const returnUrl = sanitizeReturnUrl(url.searchParams.get('return') ?? undefined);
  await signOut({ redirect: false });
  return NextResponse.redirect(returnUrl);
}

export const GET = handle;
export const POST = handle;
