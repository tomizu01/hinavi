import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importPKCS8, importSPKI, exportJWK, type JWK, type KeyLike } from 'jose';

function readKey(envContent: string | undefined, envPath: string | undefined, label: string): string {
  if (envContent && envContent.trim()) {
    return envContent.replace(/\\n/g, '\n');
  }
  if (envPath) {
    const p = resolve(process.cwd(), envPath);
    return readFileSync(p, 'utf-8');
  }
  throw new Error(`${label}: 環境変数で鍵が指定されていません`);
}

let cached: { privateKey: KeyLike; publicKey: KeyLike; publicJwk: JWK; kid: string } | null = null;

export async function getJwtKeys() {
  if (cached) return cached;

  const privatePem = readKey(process.env.JWT_PRIVATE_KEY, process.env.JWT_PRIVATE_KEY_PATH, 'JWT_PRIVATE_KEY');
  const publicPem = readKey(process.env.JWT_PUBLIC_KEY, process.env.JWT_PUBLIC_KEY_PATH, 'JWT_PUBLIC_KEY');

  const privateKey = await importPKCS8(privatePem, 'RS256');
  const publicKey = await importSPKI(publicPem, 'RS256');
  const publicJwk = await exportJWK(publicKey);
  const kid = process.env.JWT_KID ?? 'misahina-dev-1';

  cached = { privateKey, publicKey, publicJwk, kid };
  return cached;
}

export function getJwtIssuer(): string {
  return process.env.JWT_ISSUER ?? 'account.hinavi.mediowl.ai';
}

export function getJwtAudience(): string[] {
  const raw = process.env.JWT_AUDIENCE ?? 'tabikoto.hinavi.mediowl.ai,freetalk.hinavi.mediowl.ai';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function getJwtTtlSeconds(): number {
  const days = Number(process.env.JWT_TTL_DAYS ?? 30);
  return days * 24 * 60 * 60;
}
