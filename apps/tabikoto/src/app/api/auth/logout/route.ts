import { NextResponse, type NextRequest } from 'next/server';
import { getAccountLogoutUrl } from '@/lib/session';

export const runtime = 'nodejs';

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  url.pathname = '/';
  url.search = '';
  return NextResponse.redirect(getAccountLogoutUrl(url.toString()));
}

export const GET = handle;
export const POST = handle;
