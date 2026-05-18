# hinavi 開発状況

最終更新: 2026-05-18

## 1. 概要

自転車用 観光・飲食ガイド PWA。Android Chrome 向け。
要件は `REQUIREMENTS.md` 参照。

## 2. 動作状況

- **本番URL**: `https://hinavi.mediowl.ai` (ALB + ACM 経由、ALB → EC2 6500 ポートにフォワード)
- **PWA インストール確認済み**（Android Chrome でホーム画面追加成功）
- 起動中プロセス: `next start -p 6500`（`/var/www/hinavi/` で起動）
- ログ: `/tmp/hinavi-server.log`（再起動で消える点は要改善）

## 3. ディレクトリ構成

```
/var/www/hinavi/
├── REQUIREMENTS.md            要件定義
├── STATUS.md                  このファイル
├── package.json               next 16.2.3 / react 19 / mysql2 / iron-session / bcryptjs / @googlemaps/js-api-loader
├── next.config.ts
├── tsconfig.json
├── .env.local                 機密(DB/API キー類) — git管理外
├── sql/schema.sql             users, conversations テーブル
├── scripts/create-user.mjs    bcrypt ユーザー作成スクリプト
├── prompts/characters/
│   ├── misaki.md              案内役 みさき (VOICEVOX speaker 2)
│   └── hiyori.md              盛り上げ役 ひより (VOICEVOX speaker 8)
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js                  Service Worker (本番でのみ登録)
│   ├── icon-512.png           PWA アイコン
│   ├── characters/{misaki,hiyori}.png
│   └── audio/                 圏外フォールバック音声置き場(未配置)
└── src/
    ├── proxy.ts               Next 16 の旧 middleware (セッション保護)
    ├── app/
    │   ├── layout.tsx
    │   ├── globals.css        Tailwind v4
    │   ├── page.tsx           メイン画面 (開始 → 地図+会話)
    │   ├── login/page.tsx     ログインフォーム
    │   └── api/
    │       ├── auth/login/route.ts
    │       ├── auth/logout/route.ts
    │       ├── places/nearby/route.ts   Google Places API (New)
    │       ├── generate/route.ts        Gemini 3 Flash Preview
    │       └── tts/route.ts             VOICEVOX (Sakura AI Engine)
    ├── components/
    │   ├── MapView.tsx        Google Maps JavaScript API + 現在地追従
    │   ├── SpeechRow.tsx      キャラ画像 + セリフバブル
    │   └── SwRegister.tsx     Service Worker 登録
    └── lib/
        ├── db.ts              mysql2 connection pool
        ├── session.ts         iron-session 設定
        ├── characters.ts      みさき/ひより の定義
        ├── prompts.ts         md ファイルを起動時にメモリキャッシュ
        ├── types.ts
        └── client/
            ├── conversationLoop.ts   1〜14ステップの会話ループ
            ├── geo.ts                haversine
            ├── tts.ts                クライアント側 TTS 再生
            └── wakeLock.ts           Screen Wake Lock
```

## 4. 外部サービス

| サービス | キー所在 | プロジェクト共有元 |
|---|---|---|
| Google Maps Platform (Maps JS / Places API New) | `.env.local` `GOOGLE_PLACES_API_KEY` / `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `/var/www/aicyc/.env.local` |
| Gemini API (`gemini-3-flash-preview`) | `.env.local` `GEMINI_API_KEY` | `/var/www/aicyc/.env.local` |
| VOICEVOX (Sakura AI Engine `https://api.ai.sakura.ad.jp/tts/v1`) | `.env.local` `SAKURA_AI_TOKEN` | `/var/www/aicyc/.env.local` |
| MySQL | `.env.local` (host=localhost, db=hinavi, user=ai) | `/var/www/kpi/config/database.php` |

**Gemini 3 系は推論モデル**: `thinkingConfig: { thinkingLevel: 'low' }` 必須。`maxOutputTokens` は思考トークン込みなので 4096 確保している（`src/app/api/generate/route.ts`）。

## 5. 初期アカウント

- ユーザー名: `tomi`
- パスワード: `ChangeMe123!`（未変更なら早めに変更推奨）
- 変更コマンド: `cd /var/www/hinavi && node scripts/create-user.mjs tomi <新パスワード>`

## 6. オペレーション

### 再起動

```bash
kill -9 $(lsof -ti tcp:6500) 2>/dev/null
cd /var/www/hinavi
npm run build
nohup npm run start > /tmp/hinavi-server.log 2>&1 &
disown
```

### プロンプト編集後

`prompts/characters/*.md` は起動時にメモリキャッシュされるため、編集後は **必ず再起動** が必要。

### ログ確認

```bash
tail -f /tmp/hinavi-server.log
```

### DB 確認

```bash
mysql -u ai -p hinavi
# パスワード: t7ARP#vMU
# 主なテーブル: users, conversations
```

## 7. 仕様メモ（実装上のキモ）

- **会話ループ**: `src/lib/client/conversationLoop.ts` の `startConversationLoop()` がエントリ
  - ターン定義: みさき → ひより の往復1組 = 1ターン
  - 各発話後 10 秒ウェイト
  - GPS 500m 移動毎に Places 再取得
  - 履歴は 1時間以内かつ直近10件まで Gemini に渡す
- **画面構成**:
  - 地図に「一時停止」ボタンを左上オーバーレイ
  - 下半分にキャラ会話（みさきは画像右・セリフ左、ひよりは画像左・セリフ右）
  - セリフは `text-xs`、タイプライター表示 7文字/秒
- **TTS**: 直前再生終了後に即次へ。ループ側の 10 秒ウェイトのみが間隔制御
- **オフライン**: `navigator.onLine` で検知。圏外時は「ここは圏外のようです」とセリフ欄に表示し5秒ループ。音声フォールバック (`/audio/offline_notice.wav`) は未配置

## 8. 既知の TODO / 改善候補

| 優先度 | 項目 | 内容 |
|---|---|---|
| 高 | プロセス常駐 | systemd unit 化（現在 `nohup &`、サーバ再起動で死ぬ） |
| 高 | 初期パスワード変更 | `ChangeMe123!` のまま運用しない |
| 中 | Google Maps API キー制限 | HTTPリファラを `hinavi.mediowl.ai/*` に絞る／API スコープを限定 |
| 中 | ALB ヘルスチェック設定 | `GET /login` (200) を使用すれば良い |
| 中 | 圏外フォールバック音声 | `public/audio/offline_notice.wav` を用意して Service Worker のプリキャッシュに乗せる |
| 低 | ログの永続化 | `/var/log/hinavi/` 等に出力先変更 |
| 低 | 観光的でない `primaryType` のフィルタ | 現状 Places の `includedTypes` で絞っているが、`department_store` や `hotel` も入ってくる。会話に向くものを `primaryType` でさらに絞る |
| 低 | 会話履歴の整理 UI | `conversations` テーブルは溜まる一方なので、簡易ダッシュボードがあると便利 |
| 低 | iOS/Safari 対応 | 仕様上スコープ外だが、Wake Lock 以外は動く可能性あり |

## 9. 参考プロジェクト

- `/var/www/aicyc/` — VOICEVOX, Gemini, Sakura AI Engine の利用パターンの参照元
- `/var/www/kpi/` — MySQL 接続情報の参照元

## 10. インフラ（手動設定済み）

- EC2: 現在の本サーバ
- ALB: target group → 本EC2 の TCP 6500 へフォワード
- ACM: `hinavi.mediowl.ai` の証明書発行済
- DNS: `hinavi.mediowl.ai` → ALB
