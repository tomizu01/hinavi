/**
 * `return` パラメータをホワイトリスト検証する。
 * 受理: AUTH_RETURN_URL_ALLOWLIST に列挙された host (カンマ区切り) と同一の URL
 * 不正値: デフォルト URL (AUTH_DEFAULT_RETURN_URL) を返す
 */
export function sanitizeReturnUrl(raw: string | undefined): string {
  const fallback = process.env.AUTH_DEFAULT_RETURN_URL ?? 'https://tabikoto.hinavi.mediowl.ai/';
  if (!raw) return fallback;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fallback;
  }

  const allowlist = (process.env.AUTH_RETURN_URL_ALLOWLIST ?? 'tabikoto.hinavi.mediowl.ai,freetalk.hinavi.mediowl.ai,tabikoto.misahina.com,freetalk.misahina.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!allowlist.includes(url.hostname)) return fallback;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return fallback;
  return url.toString();
}
