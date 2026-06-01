# hinavi 開発状況

最終更新: 2026-06-01（第2回耐久テストに向けた改修計画を §12 に追加）

## 1. 概要

自転車用 観光・飲食ガイド PWA。Android Chrome 向け。
要件は `REQUIREMENTS.md` 参照。

## 2. 動作状況

- **本番URL**: `https://hinavi.mediowl.ai` (ALB + ACM 経由、ALB → EC2 6500 ポートにフォワード)
- **PWA インストール確認済み**（Android Chrome でホーム画面追加成功）
- 起動中プロセス: `next start -p 6500`（`/var/www/hinavi/` で起動）
- ログ: `/var/log/hinavi/server-YYYYMMDD-HHMMSS.log`（起動毎にタイムスタンプ付きで永続化）

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
│   ├── misaki1.md             案内役 みさき・奇数ターン用 (Aivis model e9339137... / ElevenLabs ugYcuAusTuWCSOpJD0Xd)
│   ├── misaki2.md             案内役 みさき・偶数ターン用
│   ├── hiyori1.md             盛り上げ役 ひより・奇数ターン用 (Aivis model 734c12b6... / ElevenLabs OSwaPSNdfituxkWcjlkR)
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
    │       └── tts/route.ts             Aivis Cloud / ElevenLabs を engine で分岐
    ├── components/
    │   ├── MapView.tsx          Google Maps JavaScript API + 現在地追従
    │   ├── SpeechRow.tsx        キャラ画像 + セリフバブル
    │   ├── SettingsOverlay.tsx  地図右上の歯車ボタン+設定ポップアップ(TTS切替/ログアウト)
    │   └── SwRegister.tsx       Service Worker 登録
    └── lib/
        ├── db.ts              mysql2 connection pool
        ├── session.ts         iron-session 設定
        ├── characters.ts      みさき/ひより の定義 (aivisModelUuid, elevenLabsVoiceId)
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
| Aivis Cloud API (`POST /v1/tts/synthesize`, Premium プラン定額, RPM 10) | `.env.local` `AIVIS_CLOUD_API_TOKEN` | hinavi 専用に発行 |
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
# 6500 を握っているプロセスを落とす（lsof は権限の都合で失敗することがあるので ss から取得）
PID=$(ss -tlnp 2>/dev/null | awk '/:6500 /{match($0,/pid=([0-9]+)/,a); print a[1]; exit}')
[ -n "$PID" ] && kill -9 $PID
cd /var/www/hinavi
npm run build
LOGFILE="/var/log/hinavi/server-$(date +%Y%m%d-%H%M%S).log"
nohup npm run start > "$LOGFILE" 2>&1 &
disown
echo "log: $LOGFILE"
```

ログディレクトリ `/var/log/hinavi/` は ec2-user 所有・755。起動毎に新規ファイルが作られるので、古いログは適宜 `find /var/log/hinavi -name 'server-*.log' -mtime +30 -delete` 等で間引き。

### プロンプト編集後

`prompts/characters/*.md` は起動時にメモリキャッシュされるため、編集後は **必ず再起動** が必要。

### ログ確認

```bash
# 最新のサーバーログを追尾
tail -f $(ls -t /var/log/hinavi/server-*.log | head -1)
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
- **TTSエンジン切替**: `src/app/api/tts/route.ts` が `{text, character, engine}` を受け取り、`aivis` (Aivis Cloud API) と `elevenlabs` を分岐。
  - クライアントは `src/lib/client/settings.ts` の `getTtsEngine()` で localStorage (`hinavi.ttsEngine`) を読み、リクエストに含める。デフォルトは `aivis`
  - Aivis Cloud: `POST https://api.aivis-project.com/v1/tts/synthesize` に `{model_uuid, text, output_format:"mp3", use_ssml:false, tempo_dynamics:1.5}` を Bearer 認証で送信、`audio/mpeg` を直接返す
  - `tempo_dynamics: 1.5` は抑揚を強める目的（デフォルト 1.0 では ElevenLabs と比べて棒読み寄りに聞こえたため）
  - ElevenLabs パラメータは `docs/elevenlabs-tts-api.md` の推奨値 (stability=1.0, similarity_boost=0.75, style=0.0, eleven_v3, ja)
  - 切替UI: 地図右上の歯車ボタン → ポップアップ(`SettingsOverlay`)で Aivis/ElevenLabs トグル。同ポップアップに LOGOUT ボタンも配置
  - Aivis Cloud のレート制限: Premium プラン**定額**で RPM 10。開発中は同時利用しない前提。本番は自前サーバ（AivisSpeech Engine セルフホスト）への移管を検討
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
| 低 | ログのローテーション | `/var/log/hinavi/` に永続化済（2026-05-28）。長期運用するなら logrotate 設定追加を検討 |
| 低 | 観光的でない `primaryType` のフィルタ | 現状 Places の `includedTypes` で絞っているが、`department_store` や `hotel` も入ってくる。会話に向くものを `primaryType` でさらに絞る |
| 低 | 会話履歴の整理 UI | `conversations` テーブルは溜まる一方なので、簡易ダッシュボードがあると便利 |
| 低 | iOS/Safari 対応 | 仕様上スコープ外だが、Wake Lock 以外は動く可能性あり |
| 中 | Aivis Cloud 本番運用検討 | 本番は自前サーバ（AivisSpeech Engine セルフホスト）への移管予定。Cloud は Premium 定額だが RPM 10 上限が複数ユーザー同時運用時のボトルネック |
| 中 | Places API の二段構え化 | 複数ユーザー展開時の Nearby Search (Pro) 課金抑制目的。1段目を OSM (Overpass API) + Wikipedia/Wikidata に置き、ヒット薄い時のみ Places にフォールバック。景観/歴史話は無料側で完結、飲食レコメンドだけ Places に寄せる想定。Overpass 公開エンドポイントのレート制限と田舎の POI 密度不足が要検証。**次回耐久テスト時の検証項目**: `/api/places/nearby` 内で OSM/Places 両方コールしてレスポンスをログ出力（DB 保存 or サーバログ）→ 同経路における OSM カバレッジ実測（POI 密度、ヒット率、種別偏り）。検証フェーズではユーザー向けには Places の結果のみを返却し、OSM 側はログ専用に走らせる |
| 中 | 地図を Google Maps → 地理院タイル化 | 走行中の地図閲覧優先度は低いため、Maps JavaScript API の従量課金を切る。Leaflet + 地理院タイル (`https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png`) に差し替え、`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` 依存も解消。要件: 「地理院タイル」帰属表示を地図右下に常時表示。規模拡大時（月数十万アクセス超）は国土地理院への届出が必要 |
| 中 | Gemini コスト削減（複合施策） | 16hr 耐久で ¥1,100 程度発生。ユーザー割り込みが無い前提を活かして以下を組み合わせる: ① **2話者1コール化**: `/api/generate` を `{misaki, hiyori}` の JSON 構造化出力に変更（`responseSchema` 利用）。conversationLoop は `generatePair()` → 順次再生に。入力 token 50%減 + 会話の繋がりも向上 / ② **モデル lite 化**: `gemini-3.5-flash` → `gemini-3-flash-lite` 等（雑談に推論モデルは過剰、単価 1/3〜1/5） / ③ **履歴を 10 → 5 件**（`conversationLoop.ts` `HISTORY_MAX`） / ④ **`maxOutputTokens: 4096 → 1024`** / ⑤ **Gemini Context Caching**（キャラプロンプト固定部の明示キャッシュ）。①②③④まとめると ¥1,100 → ¥150 オーダーまで落とせる試算。実装は generate ルート + conversationLoop の2ファイル改修。失敗時は2コール方式へフォールバック実装すること |
| 低 | Aivis 音声モデルの独自化 | 現状は研究開発用モデル（みさき / ひより）。実用化時は独自モデルを作成予定 |
| 低 | ElevenLabs 切替の運用判断 | 聴感比較で ElevenLabs > Aivis（円滑さ）。Aivis Cloud の RPM 10 で本番運用が厳しい場合、Aivis セルフホストよりも ElevenLabs 主軸に倒す選択肢もあり |

## 9. 参考プロジェクト

- `/var/www/aicyc/` — Gemini, Sakura AI Engine の利用パターンの参照元（VOICEVOX は本プロジェクトでは Aivis に置き換え済）
- `/var/www/kpi/` — MySQL 接続情報の参照元

## 10. インフラ（手動設定済み）

- EC2: 現在の本サーバ
- ALB: target group → 本EC2 の TCP 6500 へフォワード
- ACM: `hinavi.mediowl.ai` の証明書発行済
- DNS: `hinavi.mediowl.ai` → ALB

## 11. 直近の作業ログ

### 2026-05-28: VOICEVOX(Sakura) → Aivis Cloud API へ差し替え

**背景**: 音声品質向上のため、Sakura AI Engine の VOICEVOX を Aivis Cloud API へ置き換え。ElevenLabs は継続。
実機での聴感比較で Aivis ≫ VOICEVOX を確認し、**VOICEVOX は廃止確定**。
ElevenLabs vs Aivis は ElevenLabs の方が円滑だが、定額運用しやすい Aivis をデフォルトに採用。

**変更点**:
- `.env.local` に `AIVIS_CLOUD_API_TOKEN` を追加（Premium プラン定額、RPM 10）
- `src/lib/characters.ts`: `voicevoxSpeakerId` を削除し `aivisModelUuid` に置換
  - みさき: `e9339137-2ae3-4d41-9394-fb757a7e61e6`
  - ひより: `734c12b6-eaf2-4dbd-8596-8663c72d2afa`
  - ※研究開発用モデル。実用化時は独自モデル作成予定
- `src/app/api/tts/route.ts`: `synthesizeVoicevox` を削除し `synthesizeAivis` を実装
  - エンドポイント: `POST https://api.aivis-project.com/v1/tts/synthesize`
  - 認証: `Authorization: Bearer $AIVIS_CLOUD_API_TOKEN`
  - リクエスト: `{model_uuid, text, output_format:"mp3", use_ssml:false, tempo_dynamics:1.5}`
  - `tempo_dynamics:1.5` はデフォルト 1.0 では棒読み気味に聞こえたため抑揚を強める方向で固定
  - レスポンス: `audio/mpeg` をそのままクライアントへ返す（VOICEVOX 時代の audio_query → synthesis の2段呼び出しは不要に）
- `src/lib/client/settings.ts`: engine 名を `voicevox` → `aivis` に変更、デフォルトも `aivis` に
- `src/components/SettingsOverlay.tsx`: トグルラベルを「VOICEVOX」→「Aivis」へ
- 旧 `SAKURA_AI_TOKEN` は `.env.local` から削除（VOICEVOX 廃止確定により不要）

**注意点**:
- Aivis Cloud は SSML を text に書くと解釈する仕様（デフォルト ON）。Gemini 生成テキストに記号が紛れる可能性があるので、念のため `use_ssml: false` で固定
- VOICEVOX 互換と聞いていたが、実際は Aivis 独自の `/v1/tts/synthesize` 単一エンドポイント。互換性は内部の音声合成エンジン（AivisSpeech / VOICEVOX 系列）レベルの話で、API 形状は別物
- 出力 MP3 は 192kbps / 44.1kHz / Mono（モデルデフォルト）
- Premium プランは**定額**だが RPM 10 上限あり。複数ユーザー同時運用が必要になったらセルフホストへ移管

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

## 12. 第2回フィールド耐久テストに向けた改修計画

策定日: 2026-06-01。第1回耐久テスト（16hr）の所見を踏まえた決定版計画。

### 12.0 第1回耐久テストの所見

- 圏外復帰時、会話は自動再開するが **地図が真っ黒のまま復帰しない** 現象を確認 → §12.1 で対応
- プロンプトが2バリアントしかなく長時間走行で **同じ定型** に感じる → §12.2 で多モード化
- Gemini API 課金が 16hr で ¥1,100 程度発生 → §12.4 / §12.5 で削減
- Places API・Maps JS は無料枠内に収まったが、複数ユーザー展開時のリスクを §12.6 / §12.7 で先回り対応

**コスト目標（30hr 連続走行で）**: 総額 ¥980 以下 / AI 部分 ¥450 以下。

### 12.1 圏外時の地図ブラックアウト [対応済]

`MapView.tsx` でオフライン時にコンテナ DOM をアンマウントしていたため、復帰時に `mapRef.current` がオーフィン化（古い DOM を握ったまま）して新コンテナに再アタッチされない問題があった。

修正方針: コンテナを常時マウントし、オフライン時のみ半透明オーバーレイ（「圏外」表示）を上に重ねる。Map インスタンスは破棄せず維持。

状態: 2026-06-01 修正済、ビルド・本番反映済、実機での圏外復帰検証待ち。

### 12.2 会話ループの3モード化

ターン定義: みさき・ひよりが1回ずつ発言する1往復 = 1ターン。

| 優先 | モード | 条件 | 内容 | プロンプト |
|---|---|---|---|---|
| 1 | 時間モード | `turnNo % 30 === 0` | 現在時刻を取得し、時間帯（日の出/朝食/昼食/日没/夕食/ナイトラン等）で話題を変える | `prompts/kaiwa/kaiwa3.md` |
| 2 | 休憩モード | `turnNo % 6 === 0` | そろそろ休憩したい旨の話 | `prompts/kaiwa/kaiwa2.md` |
| 3 | スポットモード | デフォルト | 近くのスポット情報をネタに会話 | `prompts/kaiwa/kaiwa1.md` |

優先順位: 時間 > 休憩 > スポット。閾値（6/30）は実機検証で調整する前提で **定数1箇所で管理**。時間モードの粒度（30ターン ≒ 25〜30分）は実機印象で再調整。

### 12.3 プロンプトファイル再構成

現行の `{misaki,hiyori}{1,2}.md` 4ファイル構成を廃止し、キャラ設定とシーン指示を2層化:

```
prompts/
├── characters/
│   ├── misaki.md          みさきのキャラ設定（共通・口調・性格・呼称ルール）
│   └── hiyori.md          ひよりのキャラ設定（共通）
└── kaiwa/
    ├── kaiwa1.md          スポットモード用シーン指示
    ├── kaiwa2.md          休憩モード用シーン指示
    └── kaiwa3.md          時間モード用シーン指示
```

`/api/generate` 側で `[misaki.md, hiyori.md, kaiwa<N>.md]` を結合してプロンプト生成。キャラ設定変更時に1箇所修正で済むようになる。

### 12.4 2話者1コール化（Gemini 呼出回数半減）

ユーザー割り込みが無い前提を活かして、みさき発話＋ひより回答を **1コールで JSON 出力** に変更。

- レスポンス: `{misaki: string, hiyori: string}`
- Gemini `responseSchema`（Structured Output）で JSON 形式を強制
- `conversationLoop.ts` のフロー: `generatePair(mode, turnNo, ...)` → みさき再生 → 10秒待ち → ひより再生 → 10秒待ち

**リトライ規則**:
- HTTP / タイムアウトエラー: 1回リトライ
- JSON パース失敗: 1回リトライ（responseSchema があれば通常発生しない）
- 2回目失敗で従来通り `netFails` 加算 → 圏外ブランチへ

副次効果として、Gemini が両話者の発話を同時に設計するため **会話の繋がりが自然になる** 期待あり。

### 12.5 Gemini モデル / パラメタ変更

| 項目 | 現行 | 変更後 |
|---|---|---|
| モデル | `gemini-3.5-flash` | `gemini-3-flash-lite`（雑談用途には十分） |
| 履歴最大件数 | 10 | 5 |
| `maxOutputTokens` | 4096 | 1024（不足ログが出たら段階的に増やす） |
| `thinkingConfig` | `{ thinkingLevel: 'low' }` | 維持 |
| Context Caching | 未使用 | **使えれば使う**（最小キャッシュサイズ制約 4k〜32k tok を満たせない可能性大、エラー出たら諦める） |

**単調さ対策**: Lite モデルは表現幅が狭まる懸念。`kaiwa*.md` 内に「直前と同じ切り口を避ける」「N発話に1度ユーザーに呼びかける」等の制約をプロンプトで補完する。

**コスト試算**: 2話者1コール化 + Lite 化で 30hr あたり ¥280〜400 着地見込み（現状 ¥1,100/16hr → ¥2,060/30hr 換算からの削減）。

### 12.6 Places API 二段構え化

**再フェッチ閾値**: 500m → **1.5km** に拡大（呼出 1/3 削減）。

**取得フロー**:
1. **OSM (Overpass API)** で **半径5km** のスポット取得（無料、広めに取って後でフィルタ）
2. 0件のときのみ **Google Places API** で **半径2km** をフォールバック
3. 種別は現行と同じ（観光関連 + 飲食関連）

**会話継続管理**（田舎で同じスポット繰り返し懸念への対処）:
- スポット毎に **最低2ターン** 継続する。2ターン未満なら 1.5km 移動しても切り替えない
- 同一スポット継続時はプロンプトに以下を注入:
  ```
  現在、以下のスポット情報について会話を継続中です。
  （スポット情報）
  ```
- スポット切替時はプロンプトに以下を注入:
  ```
  話題にするスポットの情報が変更されました。下記のスポットを話題にして新規に会話してください。
  （スポット情報）
  ```
- 田舎で同じスポットが続くのは致し方なしの方針

### 12.7 地図の地理院タイル化

走行中の地図閲覧優先度は低い前提で、Maps JS API の従量課金を切る。

- Leaflet + 地理院タイル `https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` 依存解消、`@googlemaps/js-api-loader` 撤去
- 「地理院タイル」帰属表示を地図右下に常時表示（規約要件）
- 月数十万アクセス超で国土地理院への届出が必要だが本プロジェクト規模では不要

### 12.8 音声モデル（現状維持）

Aivis 継続（品質 OK）。ElevenLabs は将来削除予定だが、当面は切替UI込みで残置。

### 12.9 検証用ロギング（次回耐久テスト時）

- **OSM/Places 並走ログ**: 検証フェーズは OSM/Places の両方を常時コールし結果を比較保存
  - DB に `osm_places_compare` テーブル新設（位置・OSM件数・Places件数・種別分布・タイムスタンプ）
  - ユーザー応答は §12.6 のフォールバックロジック通り（OSM 優先、0件のとき Places）
  - 検証後は Places 側コールを `if (DEBUG_COMPARE)` ガードでオフ可能に
- **モード遷移ログ**: `conversations` テーブルに `mode` カラム（spot/rest/time）追加 → 耐久テスト後にモード分布を可視化
- **設定値の集約**: モード切替閾値（6, 30, 1.5km, 2ターン継続）は **定数1箇所**で管理し、env or 設定ファイルから上書き可能に

### 12.10 改修対象ファイル一覧（実装時の見取り図）

- `src/components/MapView.tsx` … §12.1 [完了] / §12.7 で Leaflet 化
- `src/app/api/generate/route.ts` … §12.4 (JSON 化) / §12.5 (モデル変更) / §12.2 (モード受け取り → kaiwa選択)
- `src/lib/prompts.ts` … §12.3 (新ファイル構成への対応)
- `src/lib/characters.ts` … §12.3 (`promptPaths` を廃止し共通キャラ設定パスへ)
- `src/lib/client/conversationLoop.ts` … §12.2 (モード判定) / §12.4 (`generatePair`) / §12.6 (再フェッチ閾値・2ターン継続・継続/切替注意書き)
- `src/app/api/places/nearby/route.ts` … §12.6 (OSM 二段構え + 並走ログ)
- `sql/schema.sql` … §12.9 (`conversations.mode` カラム追加、`osm_places_compare` 新設)
- `prompts/` … §12.3 (ディレクトリ再構成、kaiwa*.md 新設)
- `package.json` … §12.7 (`@googlemaps/js-api-loader` 削除 / `leaflet` 追加)

