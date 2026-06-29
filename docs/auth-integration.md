# misahina 認証連携仕様（freetalk 開発者向け）

最終更新: 2026-06-26
担当窓口: tomi@mediowl.co.jp

## 0. 一言で言うと

ログイン UI / アカウント DB / セッション発行は **`account.misahina.com` 側で完結**します。freetalk 側は:

1. 未ログイン時に `account.misahina.com/login?return=<freetalk のURL>` へリダイレクト
2. ログイン済みなら共有 cookie の **RS256 JWT を JWKS で検証**してユーザー情報を取得
3. ログアウト時は `account.misahina.com/logout?return=<freetalk のURL>` へ飛ばす

これだけ。サインアップ / Google・Apple・Magic Link / メール送信 / セッション管理は account 側が面倒見ます。

## 1. 環境別エンドポイント

| 環境 | account ベース URL | freetalk ベース URL |
|---|---|---|
| 開発 | `https://account.hinavi.mediowl.ai` | `https://freetalk.hinavi.mediowl.ai`（freetalk 開発者で構築） |
| 本番 | `https://account.misahina.com` | `https://freetalk.misahina.com`（freetalk 開発者で構築） |

以降の表記は本番 URL を使用。dev に置き換える場合は単純に `misahina.com` → `hinavi.mediowl.ai`。

## 2. ログイン誘導

freetalk 側で「ログインが必要」と判断したとき:

```
HTTP/1.1 302 Found
Location: https://account.misahina.com/login?return=https%3A%2F%2Ffreetalk.misahina.com%2Fchat
```

- `return` の値は URL エンコード済の完全な戻り先 URL
- account 側で **ホワイトリスト検証**が走る。`freetalk.misahina.com` `freetalk.hinavi.mediowl.ai` `tabikoto.*` は既に登録済
- 別ホスト（攻撃用 URL 等）を渡すと無視されて `tabikoto.misahina.com/` にフォールバックする
- 新しい freetalk サブドメインを使う場合は account 側の `AUTH_RETURN_URL_ALLOWLIST` 環境変数に追加が必要

ログイン成功すると、ユーザーは `return` で指定した URL に 302 で戻ってくる。同時に共有 cookie が発行される（次節参照）。

## 3. 共有セッション cookie

| 項目 | 値 |
|---|---|
| Cookie 名 | `__Secure-misahina.session` |
| Domain | `.misahina.com`（dev は `.hinavi.mediowl.ai`） |
| Path | `/` |
| HttpOnly | true |
| Secure | true（HTTPS 必須） |
| SameSite | Lax |
| 中身 | **RS256 で署名された JWT**（JWS、JWE ではない） |
| 有効期限 | 30 日（`exp` クレームに反映） |

cookie の Domain が親ドメイン `.misahina.com` なので、`account.` `tabikoto.` `freetalk.` すべてのサブドメインで自動的に共有される。freetalk 側で改めて cookie を発行する必要はなく、**読み取って検証するだけ**。

## 4. JWT ペイロード仕様

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "email_verified": true,
  "provider": "google",
  "name": "山田 太郎",
  "iat": 1735000000,
  "exp": 1737592000,
  "iss": "account.misahina.com",
  "aud": ["tabikoto.misahina.com", "freetalk.misahina.com"]
}
```

| クレーム | 説明 |
|---|---|
| `sub` | ユーザー ID（UUID v4 文字列、users.id と一致）。freetalk 側で履歴等を紐付けるキー |
| `email` | メールアドレス。Apple 非公開選択時は `xxxxx@privaterelay.appleid.com` |
| `email_verified` | 認証済かどうか。3経路すべて true で発行 |
| `provider` | `"google" \| "apple" \| "email"`（email = Magic Link） |
| `name` | プロバイダ提供の表示名。Magic Link 経由は null になりうる |
| `iat` / `exp` | 発行・失効時刻（UNIX 秒） |
| `iss` | 必ず `account.misahina.com`（dev: `account.hinavi.mediowl.ai`） |
| `aud` | `freetalk.misahina.com` を含むことを必ず検証する |

## 5. 公開鍵（JWKS）取得

JWKS エンドポイント:

```
https://account.misahina.com/.well-known/jwks.json
```

レスポンス例:

```json
{
  "keys": [
    {
      "kty": "RSA",
      "n": "qmiR8SScTveYQFJpgRjpnUAhgUIzHlaMly-5b1nWNFy...",
      "e": "AQAB",
      "kid": "misahina-dev-1",
      "use": "sig",
      "alg": "RS256"
    }
  ]
}
```

- ライブラリの JWKS クライアントは **キャッシュ機能込み**のものを使うのが基本（毎回 fetch しない）
- 鍵のローテーションが発生した場合は `keys` 配列に新旧並ぶ。`kid` で照合
- `Cache-Control: public, max-age=3600` を返しているので最大 1時間の遅延あり

## 6. 検証ロジックの必須条件

| 項目 | 値 |
|---|---|
| 署名アルゴリズム | **RS256**（他は拒否） |
| `iss` | `account.misahina.com` と完全一致 |
| `aud` | `freetalk.misahina.com` を含む（配列の場合、要素いずれかに一致） |
| `exp` | 現在時刻より未来 |
| `iat` | 大幅に未来でない（5分の許容で十分） |

これ以外の検証は不要。`provider` / `email_verified` / `name` の値はトラスト前提（account 側がすでに検証済）。

## 7. サンプル実装

### Node.js（推奨ライブラリ: jose）

```ts
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://account.misahina.com/.well-known/jwks.json'));
const ISSUER = 'account.misahina.com';
const AUDIENCE = 'freetalk.misahina.com';
const COOKIE_NAME = '__Secure-misahina.session';

type MisahinaUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  provider: 'google' | 'apple' | 'email';
  name: string | null;
};

export async function getMisahinaUser(cookieHeader: string): Promise<MisahinaUser | null> {
  // cookieHeader 例: "__Secure-misahina.session=eyJhbGc...; other=foo"
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  const token = decodeURIComponent(match[1]);

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['RS256'],
    });
    const p = payload as JWTPayload & {
      email?: string;
      email_verified?: boolean;
      provider?: 'google' | 'apple' | 'email';
      name?: string | null;
    };
    if (!p.sub || !p.email) return null;
    return {
      id: p.sub,
      email: p.email,
      emailVerified: p.email_verified ?? false,
      provider: p.provider ?? 'email',
      name: p.name ?? null,
    };
  } catch {
    return null;
  }
}
```

### Python（推奨ライブラリ: PyJWT + requests + cachetools）

```python
import jwt
import requests
from cachetools import TTLCache
from jwt.algorithms import RSAAlgorithm

ISSUER = 'account.misahina.com'
AUDIENCE = 'freetalk.misahina.com'
JWKS_URL = 'https://account.misahina.com/.well-known/jwks.json'
COOKIE_NAME = '__Secure-misahina.session'

_jwks_cache = TTLCache(maxsize=1, ttl=3600)

def _get_jwks():
    if 'jwks' not in _jwks_cache:
        _jwks_cache['jwks'] = requests.get(JWKS_URL, timeout=5).json()
    return _jwks_cache['jwks']

def _get_key(kid: str):
    for k in _get_jwks()['keys']:
        if k['kid'] == kid:
            return RSAAlgorithm.from_jwk(k)
    # キャッシュミス時に再フェッチ（ローテ対応）
    _jwks_cache.clear()
    for k in _get_jwks()['keys']:
        if k['kid'] == kid:
            return RSAAlgorithm.from_jwk(k)
    raise ValueError(f'kid {kid} not found in JWKS')

def get_misahina_user(token: str) -> dict | None:
    if not token:
        return None
    try:
        header = jwt.get_unverified_header(token)
        key = _get_key(header['kid'])
        payload = jwt.decode(
            token, key,
            algorithms=['RS256'],
            issuer=ISSUER,
            audience=AUDIENCE,
        )
        return {
            'id': payload['sub'],
            'email': payload['email'],
            'email_verified': payload.get('email_verified', False),
            'provider': payload.get('provider', 'email'),
            'name': payload.get('name'),
        }
    except (jwt.InvalidTokenError, KeyError):
        return None
```

## 8. ログアウト

freetalk 側でログアウトボタンを押された場合:

```
HTTP/1.1 302 Found
Location: https://account.misahina.com/logout?return=https%3A%2F%2Ffreetalk.misahina.com%2F
```

account 側で cookie を削除（`Max-Age=0` で上書き）し、`return` URL に 302。`Domain=.misahina.com` での削除なので、tabikoto を含む全サブドメインで一斉ログアウトされる。

## 9. 動作ガイドライン

### 推奨

- JWT は **リクエストごとに検証**する（cookie を読むだけで信用しない）
- jose / PyJWT の **JWKS キャッシュ機能を利用**して、毎回 JWKS をフェッチしない
- 検証 NG 時は `null` を返してログイン誘導に流す（401 で API を返す等）
- ユーザー情報を独自 DB に保存する場合は `sub`（UUID）をキーにする。`email` は変更されうるので主キーにしない

### 非推奨

- JWT の中身をそのまま信用してユーザー情報を **DB から再取得しない**（JWT には必要情報全部入ってる）
- JWT を URL クエリやログに出力する（漏れたらセッション乗っ取り）
- 自前で cookie を `Domain=.misahina.com` で発行する（衝突するのでやらない）
- HS256 等の対称鍵での署名検証を試みる（必ず RS256）

## 10. トラブルシュート

| 症状 | 原因候補 |
|---|---|
| cookie が freetalk に届かない | freetalk のオリジンが `.misahina.com` のサブドメインになっているか確認。localhost テストでは cookie が立たないので必ず HTTPS + サブドメインで |
| `JWKSNoMatchingKey` / `kid not found` | キャッシュした JWKS と現行サーバの鍵がずれた。キャッシュをクリアして再フェッチ |
| `JWTClaimValidationFailed: iss` | `iss` の値が `account.misahina.com` でない（dev と prod のドメイン取り違え等） |
| `JWTClaimValidationFailed: aud` | freetalk の `audience` 設定が `freetalk.misahina.com` でない or account 側の AUDIENCE allowlist に未登録 |
| `JWTExpired` | 30日経過。ログイン誘導でOK |
| 検証ライブラリが `RS256` を knownAlg として拒否 | ライブラリ依存。`algorithms: ['RS256']` を明示するなど対応 |

## 11. 連絡先

- account 側の挙動・エンドポイント・鍵ローテに関する問い合わせ: tomi@mediowl.co.jp
- JWT のクレーム追加・変更要望は事前すり合わせ。後方互換性の制約があるため
