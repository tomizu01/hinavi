import { NextResponse, type NextRequest } from 'next/server';
import { verifyMisahinaJwt } from '@hinavi/auth-jwt';

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? '__Secure-misahina.session';
const JWKS_URL = process.env.JWKS_URL ?? 'http://localhost:6501/.well-known/jwks.json';
const ISSUER = process.env.JWT_ISSUER ?? 'account.hinavi.mediowl.ai';
const AUDIENCE = process.env.JWT_AUDIENCE_TABIKOTO ?? 'tabikoto.hinavi.mediowl.ai';
const ACCOUNT_BASE = process.env.ACCOUNT_BASE_URL ?? 'https://account.hinavi.mediowl.ai';

const PUBLIC_PATHS = ['/manifest.webmanifest', '/sw.js', '/icon-512.png'];

function redirectToLogin(req: NextRequest) {
  return NextResponse.redirect(`${ACCOUNT_BASE}/login?return=${encodeURIComponent(req.url)}`);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/')) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/characters/') ||
    pathname.startsWith('/audio/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return redirectToLogin(req);

  try {
    await verifyMisahinaJwt(token, {
      jwksUrl: JWKS_URL,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return NextResponse.next();
  } catch {
    return redirectToLogin(req);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
