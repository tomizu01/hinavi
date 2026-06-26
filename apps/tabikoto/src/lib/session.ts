import { cookies } from 'next/headers';
import { verifyMisahinaJwt, type MisahinaJwtPayload } from '@hinavi/auth-jwt';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  provider: 'google' | 'apple' | 'email';
}

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? '__Secure-misahina.session';
const JWKS_URL = process.env.JWKS_URL ?? 'http://localhost:6501/.well-known/jwks.json';
const ISSUER = process.env.JWT_ISSUER ?? 'account.hinavi.mediowl.ai';
const AUDIENCE = process.env.JWT_AUDIENCE_TABIKOTO ?? 'tabikoto.hinavi.mediowl.ai';
const ACCOUNT_BASE = process.env.ACCOUNT_BASE_URL ?? 'https://account.hinavi.mediowl.ai';

function payloadToUser(p: MisahinaJwtPayload): SessionUser {
  return {
    id: p.sub,
    email: p.email,
    name: p.name ?? null,
    provider: p.provider,
  };
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const payload = await verifyMisahinaJwt(token, {
      jwksUrl: JWKS_URL,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return payloadToUser(payload);
  } catch {
    return null;
  }
}

export function getAccountLoginUrl(returnUrl: string): string {
  return `${ACCOUNT_BASE}/login?return=${encodeURIComponent(returnUrl)}`;
}

export function getAccountLogoutUrl(returnUrl: string): string {
  return `${ACCOUNT_BASE}/logout?return=${encodeURIComponent(returnUrl)}`;
}
