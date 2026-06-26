import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export type MisahinaJwtPayload = JWTPayload & {
  sub: string;
  email: string;
  email_verified?: boolean;
  provider: 'google' | 'apple' | 'email';
  name?: string | null;
};

type VerifyOptions = {
  jwksUrl: string;
  issuer: string;
  audience: string;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(jwksUrl: string) {
  let jwks = jwksCache.get(jwksUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
    jwksCache.set(jwksUrl, jwks);
  }
  return jwks;
}

export async function verifyMisahinaJwt(token: string, opts: VerifyOptions): Promise<MisahinaJwtPayload> {
  const jwks = getJwks(opts.jwksUrl);
  const { payload } = await jwtVerify(token, jwks, {
    issuer: opts.issuer,
    audience: opts.audience,
    algorithms: ['RS256'],
  });
  return payload as MisahinaJwtPayload;
}
