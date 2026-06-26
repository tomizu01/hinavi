import { SignJWT, importPKCS8 } from 'jose';

let cached: { secret: string; expiresAt: number } | null = null;

/**
 * Apple Sign In の client_secret は 6ヶ月有効な ES256 JWT。
 * 起動時に生成しキャッシュ、5ヶ月で再生成する。
 */
export async function getAppleClientSecret(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt - now > 7 * 24 * 60 * 60) {
    return cached.secret;
  }

  const teamId = process.env.AUTH_APPLE_TEAM_ID;
  const keyId = process.env.AUTH_APPLE_KEY_ID;
  const clientId = process.env.AUTH_APPLE_ID;
  const privateKeyPem = (process.env.AUTH_APPLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');

  if (!teamId || !keyId || !clientId || !privateKeyPem) {
    throw new Error('Apple Sign In の環境変数が不足しています (AUTH_APPLE_TEAM_ID / AUTH_APPLE_KEY_ID / AUTH_APPLE_ID / AUTH_APPLE_PRIVATE_KEY)');
  }

  const privateKey = await importPKCS8(privateKeyPem, 'ES256');
  const exp = now + 5 * 30 * 24 * 60 * 60;
  const secret = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setAudience('https://appleid.apple.com')
    .setSubject(clientId)
    .sign(privateKey);

  cached = { secret, expiresAt: exp };
  return secret;
}
