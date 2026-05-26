# hinavi 開発状況

最終更新: 2026-05-26（圏外時の会話ループ復帰問題を修正）

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
│   ├── misaki1.md             案内役 みさき・奇数ターン用 (VOICEVOX speaker 2 / ElevenLabs ugYcuAusTuWCSOpJD0Xd)
│   ├── misaki2.md             案内役 みさき・偶数ターン用
│   ├── hiyori1.md             盛り上げ役 ひより・奇数ターン用 (VOICEVOX speaker 8 / ElevenLabs OSwaPSNdfituxkWcjlkR)
│   └── hiyori2.md             盛り上げ役 ひより・偶数ターン用
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
    │       ├── generate/route.ts        Gemini 3.5 Flash
    │       └── tts/route.ts             VOICEVOX(Sakura) / ElevenLabs を engine で分岐
    ├── components/
    │   ├── MapView.tsx          Google Maps JavaScript API + 現在地追従
    │   ├── SpeechRow.tsx        キャラ画像 + セリフバブル
    │   ├── SettingsOverlay.tsx  地図右上の歯車ボタン+設定ポップアップ(TTS切替/ログアウト)
    │   └── SwRegister.tsx       Service Worker 登録
    └── lib/
        ├── db.ts              mysql2 connection pool
        ├── session.ts         iron-session 設定
        ├── characters.ts      みさき/ひより の定義 (voicevoxSpeakerId, elevenLabsVoiceId)
        ├── prompts.ts         md ファイルを起動時にメモリキャッシュ
        ├── types.ts
        └── client/
            ├── conversationLoop.ts   1〜14ステップの会話ループ
            ├── geo.ts                haversine
            ├── settings.ts           TTSエンジン選択を localStorage に永続化
            ├── tts.ts                クライアント側 TTS 再生
            └── wakeLock.ts           Screen Wake Lock
```

## 4. 外部サービス

| サービス | キー所在 | プロジェクト共有元 |
|---|---|---|
| Google Maps Platform (Maps JS / Places API New) | `.env.local` `GOOGLE_PLACES_API_KEY` / `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `/var/www/aicyc/.env.local` |
| Gemini API (`gemini-3.5-flash`) | `.env.local` `GEMINI_API_KEY` | `/var/www/aicyc/.env.local` |
| VOICEVOX (Sakura AI Engine `https://api.ai.sakura.ad.jp/tts/v1`) | `.env.local` `SAKURA_AI_TOKEN` | `/var/www/aicyc/.env.local` |
| ElevenLabs TTS (`eleven_v3`, `mp3_44100_64`, Proプラン契約済) | `.env.local` `ELEVENLABS_API_KEY` | `/var/www/aicyc/.env.local` |
| MySQL | `.env.local` (host=localhost, db=hinavi, user=ai) | `/var/www/kpi/config/database.php` |

**Gemini 3.x 系は推論モデル**: `thinkingConfig: { thinkingLevel: 'low' }` で思考レベルを調整。`maxOutputTokens` は思考トークン込みなので 4096 確保している（`src/app/api/generate/route.ts`）。

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
  - ターン定義: みさき → ひより の往復1組 = 1ターン（`turnNo` は spot 1個ぶんで +1、両話者に同じ番号で渡る）
  - 各発話後 10 秒ウェイト
  - GPS 500m 移動毎に Places 再取得
  - 履歴は 1時間以内かつ直近10件まで Gemini に渡す
- **プロンプト構成（奇数/偶数で切替）**: `src/app/api/generate/route.ts`
  - **奇数ターン (variant=1)**: `{misaki,hiyori}1.md` を使用。「キャラ設定 + スポット情報 + 会話履歴 + 次の発話指示」
  - **偶数ターン (variant=2)**: `{misaki,hiyori}2.md` を使用。スポット情報を省略し「キャラ設定 + 会話履歴 + 次の発話指示」のみ
  - 判定: `body.turnNo % 2 === 0 ? 2 : 1`（未指定時は variant=1 フォールバック）
- **ユーザー呼称**: `prompts/characters/*.md` 内の `{user_name}` を `users.display_name` で置換（NULL/空時は `'あなた'` フォールバック）。プロンプト側は `{user_name}さん` の形式で運用。
- **画面構成**:
  - 地図に「一時停止」ボタンを左上オーバーレイ
  - 下半分にキャラ会話（みさきは画像右・セリフ左、ひよりは画像左・セリフ右）
  - セリフは `text-xs`、タイプライター表示 7文字/秒
- **TTS**: 直前再生終了後に即次へ。ループ側の 10 秒ウェイトのみが間隔制御
- **TTSエンジン切替**: `src/app/api/tts/route.ts` が `{text, character, engine}` を受け取り、`voicevox` (Sakura) と `elevenlabs` を分岐。
  - クライアントは `src/lib/client/settings.ts` の `getTtsEngine()` で localStorage (`hinavi.ttsEngine`) を読み、リクエストに含める。デフォルトは `voicevox`
  - ElevenLabs パラメータは `docs/elevenlabs-tts-api.md` の推奨値 (stability=1.0, similarity_boost=0.75, style=0.0, eleven_v3, ja)
  - 切替UI: 地図右上の歯車ボタン → ポップアップ(`SettingsOverlay`)で VOICEVOX/ElevenLabs トグル。同ポップアップに LOGOUT ボタンも配置
- **オフライン検知（2段構え）**:
  1. **明示的 offline**: `navigator.onLine === false` を検知
  2. **暗黙的 offline（ハング検知）**: `navigator.onLine` は不正確で有名（接続性ではなくインターフェース有無しか見ない）なため、`/api/{places/nearby,generate,tts}` の各 fetch にタイムアウト（places=12s / generate=25s / tts=20s）を `AbortController` で設定。2回連続失敗で `OFFLINE_AFTER_FAILS = 2` 経由で圏外ブランチへ強制分岐
  - 圏外時は「ここは圏外のようです」とセリフ欄に表示し5秒ループ
  - 圏内復帰: 5秒wait明けに再度 `fetchNearby` を試行 → 成功で `netFails = 0` リセット → 通常運行復帰（復帰検知ラグ目安: 5〜30秒）
  - 音声フォールバック (`/audio/offline_notice.wav`) は SW プリキャッシュ済だが、再生処理は未実装

## 8. 既知の TODO / 改善候補

| 優先度 | 項目 | 内容 |
|---|---|---|
| 高 | プロセス常駐 | systemd unit 化（現在 `nohup &`、サーバ再起動で死ぬ） |
| 高 | 初期パスワード変更 | `ChangeMe123!` のまま運用しない |
| 中 | 会話の単調さ解消 | 奇数/偶数の2拍子サイクルになりがち。改善案 A=`turnNo % 4` で4種variant化 / B=ランダム or 話者ずらし / C=`*2.md` 側に「直前と同じ切り口を避ける」「N発話に1度ユーザー呼びかけ」等の制約を追加。低コストはC。 |
| 中 | Google Maps API キー制限 | HTTPリファラを `hinavi.mediowl.ai/*` に絞る／API スコープを限定 |
| 中 | ALB ヘルスチェック設定 | `GET /login` (200) を使用すれば良い |
| 中 | 圏外フォールバック音声 | SW プリキャッシュ対象には入っているが `/audio/offline_notice.wav` ファイル自体が未配置。配置 + クライアント側の再生処理（`onOfflineNotice` 経路）を追加 |
| 中 | 圏外復帰の早期検知 | 現状ハング検知は2連続失敗（最悪 ~30秒）。軽量ping (`/api/health` を追加して `HEAD` 等) を圏外ブランチ内で叩き、復帰を秒単位で検知することも可能 |
| 低 | ログの永続化 | `/var/log/hinavi/` 等に出力先変更 |
| 低 | 観光的でない `primaryType` のフィルタ | 現状 Places の `includedTypes` で絞っているが、`department_store` や `hotel` も入ってくる。会話に向くものを `primaryType` でさらに絞る |
| 低 | 会話履歴の整理 UI | `conversations` テーブルは溜まる一方なので、簡易ダッシュボードがあると便利 |
| 低 | iOS/Safari 対応 | 仕様上スコープ外だが、Wake Lock 以外は動く可能性あり |
| 低 | TTSデフォルトの再検討 | 現状 `voicevox`。ElevenLabs の常用が確定したら `src/lib/client/settings.ts` の `DEFAULT_ENGINE` を `elevenlabs` に切替 |

## 9. 参考プロジェクト

- `/var/www/aicyc/` — VOICEVOX, Gemini, Sakura AI Engine の利用パターンの参照元
- `/var/www/kpi/` — MySQL 接続情報の参照元

## 10. インフラ（手動設定済み）

- EC2: 現在の本サーバ
- ALB: target group → 本EC2 の TCP 6500 へフォワード
- ACM: `hinavi.mediowl.ai` の証明書発行済
- DNS: `hinavi.mediowl.ai` → ALB

## 11. 直近の作業ログ

### 2026-05-26: 圏外時の会話ループ復帰問題を修正

**背景**: 山奥フィールドテストで、TTS中に電波が切れた後、圏内復帰しても会話が再開しなかった。

**原因**: `/api/generate`, `/api/tts`, `/api/places/nearby` の `fetch` にタイムアウトが無く、TCP接続を張ったまま応答が返らない状態（モバイル網のハンドオフ等で発生）になると `fetch` が永久ハングし、電波復帰してもハングしたコネクションは自動回復しないためループが停止していた。`navigator.onLine` 経路にも入らないので回復ロジックが発火しなかった。

**修正** (`src/lib/client/tts.ts`, `src/lib/client/conversationLoop.ts`):
- `fetchWithTimeout(input, init, timeoutMs)` を `tts.ts` に追加（`AbortController + setTimeout`）。`conversationLoop.ts` からも import
- 3つの fetch にタイムアウト適用: places=12s / generate=25s / tts=20s
- `fetchSpeechAudio` を「エラー時 null 返却」から「throw する」に変更。呼び出し側 `speakAndType` で try/catch して `{ netError: boolean }` を返す形に
- 連続失敗カウンタ `netFails` を導入。`OFFLINE_AFTER_FAILS = 2` 回失敗で `navigator.onLine` を信用せず強制的に「圏外」ブランチに分岐し、`onOfflineNotice` 表示 + 5秒待機 + カウンタリセット
- 任意の `fetchNearby` / `generate` / TTS 取得が成功すれば `netFails = 0` リセット

**注**: タイムアウト値は山奥での Gemini 思考遅延を考慮した余裕値。実機テストで詰める余地あり。

- `.env.local` の `GEMINI_MODEL` を `gemini-3.5-flash` に更新（会話品質が 3.1 Pro 並み、速度向上）
- `src/app/api/generate/route.ts:13` のフォールバック定数は `gemini-3-flash-preview` のまま（env 優先で問題なし）
- `thinkingConfig: { thinkingLevel: 'low' }` は 3.5 でも継続使用

### 2026-05-19（2回目: TTS切替・Settings UI）

1. **ElevenLabs TTS 対応**
   - `.env.local` に `ELEVENLABS_API_KEY` を追加（`/var/www/aicyc/.env.local` から流用）
   - `lib/characters.ts` に `elevenLabsVoiceId` を追加（みさき=`ugYcuAusTuWCSOpJD0Xd` / ひより=`OSwaPSNdfituxkWcjlkR`）
   - `app/api/tts/route.ts` を改修。リクエスト形式を `{text, character, engine}` に変更し、`engine === 'elevenlabs'` で ElevenLabs にプロキシ。`voicevox` は従来通り Sakura AI Engine。
   - `lib/client/tts.ts` の `fetchSpeechAudio(text, character)` へシグネチャ変更し、`getTtsEngine()` を読んで engine を同送
   - `lib/client/conversationLoop.ts` から `CHARACTERS` import を撤去（character ID をそのまま渡す形に）
2. **Settings ポップアップ追加**
   - `lib/client/settings.ts` 新規。`hinavi.ttsEngine` を localStorage に保存（デフォルト `voicevox`）
   - `components/SettingsOverlay.tsx` 新規。地図右上に歯車ボタン、押下でモーダル表示。TTSトグル + LOGOUT
   - `app/page.tsx` に `<SettingsOverlay />` を埋め込み（地図コンテナ内、`absolute` レイアウト）
   - 既存のヘッダーバー等にログアウト導線が無かったので、本ポップアップに集約

### 2026-05-19（1回目: ユーザー呼称/プロンプト2系統化）

1. **`users.display_name` カラム追加**（`sql/schema.sql`）
   - 既存DB向けの `ALTER TABLE` 文をコメントで併記
2. **プロンプト内のユーザー呼称をDB駆動化**
   - `prompts/characters/*.md` 内の固定文字列「とみんさん」→ `{user_name}さん` に変更
   - `/api/generate` で `users.display_name` を SELECT し `{user_name}` を置換
   - NULL/空時は `'あなた'` にフォールバック（→「あなたさん」になる点は運用でカバー）
3. **奇数/偶数ターンでプロンプト構造を切替**
   - `prompts/characters/{misaki,hiyori}1.md` / `{misaki,hiyori}2.md` の2系統に分割
   - `lib/characters.ts` の `Character` を `promptPaths: { 1, 2 }` 構造に変更
   - `lib/prompts.ts` の `loadCharacterPrompt(id, variant)` 化（キャッシュキーも variant 込み）
   - `/api/generate` で `turnNo % 2 === 0` を variant=2 判定、偶数時はスポット情報セクションを省略

### 手動作業 / 未確認

- [ ] 本番DBに `ALTER TABLE users ADD COLUMN display_name VARCHAR(64) DEFAULT NULL AFTER password_hash;` を実行したか確認
- [ ] `UPDATE users SET display_name = ... WHERE username = ...` で各ユーザーに日本語呼称を設定
- [x] `*2.md` のキャラ設定差別化（ユーザー手動編集済み）
- [x] Rakuten Mini 実機での動作確認（会話成立を確認）
- [x] ElevenLabs 音声品質の実機確認（ユーザー評価: VOICEVOX より明確に良い）

### 中断時点の所感（次回の判断材料）

- 奇数/偶数の切替自体は意図通り効いている。ただし2拍子サイクルで単調になりがちと観察（みさき紹介→ひより反応→みさき継続→ひより継続 の繰り返し感）
- 改善方向の選択肢は §8 の TODO 行参照（A/B/C案）
- TTS は ElevenLabs の方が品質が良いと確認済。ただしデフォルトは `voicevox` のまま（ハルシネーション/コスト懸念のフォールバック維持）。常用したい場合は §8 に「デフォルトを elevenlabs に切替」のTODOを追加する判断もあり。
- ElevenLabs ハルシネーション対策の追加防御余地: `playSpeechAudio` のタイムアウト 30秒 → セリフ長×係数の動的算出に変える等。現状暴走報告は無い。

