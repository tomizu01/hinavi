# 旅コト（旧 hinavi）開発状況

最終更新: 2026-06-26（SaaS 化に向けた認証基盤移行計画策定 — Auth.js v5 + Google/Apple/Magic Link、RS256 JWT、monorepo 化 `apps/{account,tabikoto}`。§13 参照）

> ※ プロジェクトディレクトリ・本番URL・GitHub 上のリポジトリ名・DB 名・cookie 名等の **内部識別子は引き続き `hinavi`**。アプリの **表示名のみ「旅コト」** に変更している。

## 1. 概要

AI 観光・飲食ガイド PWA。Android Chrome 向け。移動手段は問わない汎用設計（電車・車・徒歩・自転車）。
要件は `REQUIREMENTS.md` 参照。

**当初は自転車専用ナビとして設計**したが、第2回耐久テスト (2026-06-07) 後の振り返りで「自転車運転中のスマホ操作は道交法違反（2024年11月改正で罰則強化）」という社会的リスクを再認識し、2026-06-08 に「移動手段を問わない汎用音声コンパニオン」へ方針転換。プロンプト・モード設計・アプリ名・PWA メタデータ等を順次汎用化中（§11 の 2026-06-08 / 2026-06-19 エントリ参照）。

## 2. 動作状況

- **本番URL**: `https://hinavi.mediowl.ai` (ALB + ACM 経由、ALB → EC2 6500 ポートにフォワード)
- **PWA インストール確認済み**（Android Chrome でホーム画面追加成功）
- **PWA 表示名**: `旅コト`（`public/manifest.webmanifest` の `name` / `short_name`）。**ホーム画面追加済端末は再インストールしないとラベル更新されない** (Android Chrome 仕様)
- 起動中プロセス: `next start -p 6500`（`/var/www/hinavi/` で起動）
- ログ: `/var/log/hinavi/server-YYYYMMDD-HHMMSS.log`（起動毎にタイムスタンプ付きで永続化）

## 3. ディレクトリ構成

```
/var/www/hinavi/
├── REQUIREMENTS.md            要件定義
├── STATUS.md                  このファイル
├── package.json               next 16.2.3 / react 19 / mysql2 / iron-session / bcryptjs / leaflet
├── next.config.ts
├── tsconfig.json
├── .env.local                 機密(DB/API キー類) — git管理外
├── sql/schema.sql             users / conversations / osm_places_compare / topics テーブル定義
├── docs/                      ベンダー API リファレンス等の参考資料
├── scripts/create-user.mjs    bcrypt ユーザー作成スクリプト
├── prompts/
│   ├── characters/
│   │   ├── misaki.md          案内役 みさき・キャラ設定 (Aivis model e9339137... / ElevenLabs ugYcuAusTuWCSOpJD0Xd)
│   │   └── hiyori.md          盛り上げ役 ひより・キャラ設定 (Aivis model a670e6b8... / ElevenLabs OSwaPSNdfituxkWcjlkR)
│   └── kaiwa/
│       ├── kaiwa1.md          スポットモード用シーン指示
│       ├── kaiwa2.md          雑談モード用シーン指示（6 ターン毎、{current_topic} に topics から1件ランダム注入）
│       └── kaiwa3.md          時間モード用シーン指示（30 ターン毎）
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
    │   ├── page.tsx           メイン画面 (MapView を next/dynamic で SSR 無効化して読込)
    │   ├── login/page.tsx     ログインフォーム
    │   └── api/
    │       ├── auth/login/route.ts
    │       ├── auth/logout/route.ts
    │       ├── places/nearby/route.ts   OSM 2km → 0件なら OSM 5km → 0件なら Google Places 2km の3段直列フォールバック、`osm_places_compare` に記録
    │       ├── generate/route.ts        Gemini 3.1 Flash Lite + responseSchema で {misaki, hiyori} JSON 出力。rest モードで `topics` から話題注入、spot モードで `distance.ts` 整形済距離を注入
    │       └── tts/route.ts             Aivis / ElevenLabs 分岐。送信直前に tts-readings の置換を適用
    ├── components/
    │   ├── MapView.tsx          Leaflet + 地理院タイル(pale) + 現在地 circleMarker
    │   ├── SpeechRow.tsx        キャラ画像 + セリフバブル
    │   ├── SettingsOverlay.tsx  地図右上の歯車ボタン+設定ポップアップ(TTS切替/ログアウト)
    │   └── SwRegister.tsx       Service Worker 登録
    └── lib/
        ├── db.ts              mysql2 connection pool
        ├── session.ts         iron-session 設定
        ├── characters.ts      みさき/ひより の定義 (aivisModelUuid, elevenLabsVoiceId, promptPath)
        ├── prompts.ts         loadCharacterPrompt / loadKaiwaPrompt（ファイル単位メモリキャッシュ）
        ├── osm.ts             Overpass API クライアント。観光・歴史・飲食・公園・宿泊・駅・温泉・湧水・山頂等を取得、最大100件サンプル
        ├── distance.ts        スポット距離の表示整形（<1km は 100m 単位「約N00m」、≧1km は 0.1km 単位「約N.Nkm」）
        ├── tts-readings.ts    TTS 読み間違い対策の強制置換辞書（送信直前に適用、画面表示は無変更）
        ├── types.ts           ConversationMode = 'spot' | 'rest' | 'time' などを定義
        └── client/
            ├── conversationLoop.ts   モード判定→2話者1コール→順次再生 のループ
            ├── geo.ts                haversine
            ├── settings.ts           TTSエンジン選択を localStorage に永続化
            ├── tts.ts                クライアント側 TTS 再生
            └── wakeLock.ts           Screen Wake Lock
```

## 4. 外部サービス

| サービス | キー所在 | プロジェクト共有元 |
|---|---|---|
| Google Places API (New, Nearby Search) | `.env.local` `GOOGLE_PLACES_API_KEY` | `/var/www/aicyc/.env.local` |
| 地理院タイル (`https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png`) | キー不要、規約に基づく帰属表示のみ必要 | — |
| OSM Overpass API (`https://overpass-api.de/api/interpreter`) | キー不要、User-Agent 設定済 | — |
| Gemini API (デフォルト `gemini-3.1-flash-lite`、env `GEMINI_MODEL` で上書き可) | `.env.local` `GEMINI_API_KEY` | `/var/www/aicyc/.env.local` |
| Aivis Cloud API (`POST /v1/tts/synthesize`, Premium プラン定額, RPM 10) | `.env.local` `AIVIS_CLOUD_API_TOKEN` | hinavi 専用に発行 |
| ElevenLabs TTS (`eleven_v3`, `mp3_44100_64`, Proプラン契約済) | `.env.local` `ELEVENLABS_API_KEY` | `/var/www/aicyc/.env.local` |
| MySQL | `.env.local` (host=localhost, db=hinavi, user=ai) | `/var/www/kpi/config/database.php` |

**Gemini 3.x 系は推論モデル**: `thinkingConfig: { thinkingLevel: 'low' }` で思考レベルを調整。2話者1コール化に合わせ `maxOutputTokens: 1024`（不足時は段階的に増やす）。`responseSchema` で `{misaki, hiyori}` JSON 形式を強制。
**`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`**: 2026-06-01 に Leaflet + 地理院タイル化したため未参照。`.env.local` に残置されているが削除可。

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

**⚠️ タイムスタンプは UTC 保存**: EC2 / MySQL ともシステム TZ が UTC のため、`created_at` 等の TIMESTAMP は UTC。JST で集計する際は `DATE_ADD(created_at, INTERVAL 9 HOUR)` を必ずかける（MySQL に tz テーブル未投入のため `CONVERT_TZ` は NULL を返す）。

## 7. 仕様メモ（実装上のキモ）

- **会話ループ**: `src/lib/client/conversationLoop.ts` の `startConversationLoop()` がエントリ
  - ターン定義: みさき・ひより が 1回ずつ発言する 1往復 = 1ターン（`turnNo` は両話者に同じ番号で渡る）
  - **モード判定**（優先度: 時間 > 休憩 > スポット）:
    - `turnNo % 30 === 0` → 時間モード（kaiwa3.md、サーバで JST 現在時刻を注入）
    - `turnNo % 6 === 0` → 雑談モード（kaiwa2.md、`topics` から1件ランダム選択して `{current_topic}` に注入。スポット情報は使わない）
    - それ以外 → スポットモード（kaiwa1.md）
  - **再フェッチ**: GPS 1.5km 移動毎に Places/OSM 再取得（スポットモード時のみ）
  - **スポット継続**: 同一スポットで最低 2 ターン継続。継続時はプロンプトに「会話継続中」、切替時は「スポット変更」の注意書きを注入
  - **履歴**: 直近 5 件を Gemini に渡す
  - **各発話後 10 秒ウェイト**
- **生成エンドポイント**: `src/app/api/generate/route.ts`
  - リクエスト: `{ mode, turnNo, sessionId, history, spot?, isSpotContinuation? }`
  - 1コールで `{ misaki: string, hiyori: string }` の JSON を取得（`responseMimeType: application/json` + `responseSchema`）
  - プロンプト構成: `[misaki.md, hiyori.md, kaiwa<N>.md, モード別コンテキスト, 履歴, 出力指示]`
  - **失敗時**: HTTP/タイムアウト/JSON 不正のいずれも 1 回リトライ。2 回失敗で 502
  - 各ターン 2 行（misaki, hiyori）を `conversations` テーブルに `mode` 付きで保存
- **ユーザー呼称**: `prompts/**/*.md` 内の `{user_name}` を `users.display_name` で置換（NULL/空時は `'あなた'` フォールバック）。現状の `misaki.md` / `hiyori.md` / `kaiwa*.md` に placeholder は無いが、機能は維持
- **雑談話題**: `kaiwa2.md` の `{current_topic}` を `topics` テーブルから `ORDER BY RAND() LIMIT 1` で選択して置換。`rest` モード時のみ実行。`topics.is_active = 1` のレコードが対象
- **スポット距離注入**: `src/lib/distance.ts` の `formatDistance()` で整形（< 1km は 100m 単位四捨五入で「約N00m」、≧ 1km は 0.1km 単位で「約N.Nkm」、最小 100m）。client (`conversationLoop.ts`) はターン毎に最新 GPS とスポット間の haversine 距離を計算し `distanceMeters` として `/api/generate` に送付。サーバ側でスポットコンテキストに「距離: 約XXX（…曖昧表現禁止）」として注入。`kaiwa1.md` にも距離表現ルールを明記
- **スポット取得**: `src/app/api/places/nearby/route.ts`
  - **3段直列フォールバック**: OSM 2km → 0件なら OSM 5km → 0件なら Google Places 2km
  - 都会では 2km で十分ヒットして遠目のスポットを拾わない、田舎では 5km/Places で救済する設計
  - OSM 1段あたり 12s タイムアウト、Places 10s タイムアウト。最悪ケース合計 34s（クライアント側 `PLACES_TIMEOUT_MS=38s` で吸収）
  - 各リクエストを `osm_places_compare` テーブルへログ（件数・種別分布・所要 ms・エラー・使用ソース）
    - `used_source`: `osm_2k` / `osm_5k` / `places` / `none`
    - `osm_count` は使用した OSM 段の件数。`osm_ms` は実行した OSM 段の所要時間合計（2k のみなら 2k 分、5k まで走ったら 2k+5k の合計）
    - `places_count` / `places_ms` は Places を実コールした時のみ非0
  - OSM は urban で数千件返るため、サーバ側で 100 件にランダムサンプル
- **画面構成**:
  - 地図: Leaflet + 地理院タイル(pale)。現在地は緑の circleMarker。右下に「地理院タイル」帰属表示
  - 地図上に「一時停止」ボタンを左上、設定（歯車）ボタンを右上にオーバーレイ（**`z-[1100]`**: Leaflet pane は z-index 1000 以下なので必ずこれを超えること）
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
- **TTS 読み間違い対策**: `src/lib/tts-readings.ts` の `TTS_READING_OVERRIDES` に `[元の表記, 読み]` の組を列挙。TTS API 送信直前に置換（画面表示は元のまま）。順序が効くので長い語を先に書く
- **オフライン検知（2段構え）**:
  1. **明示的 offline**: `navigator.onLine === false` を検知
  2. **暗黙的 offline（ハング検知）**: `navigator.onLine` は不正確で有名（接続性ではなくインターフェース有無しか見ない）なため、`/api/{places/nearby,generate,tts}` の各 fetch にタイムアウト（places=30s / generate=25s / tts=20s）を `AbortController` で設定。2回連続失敗で `OFFLINE_AFTER_FAILS = 2` 経由で圏外ブランチへ強制分岐
  - places タイムアウトを 30s に拡大したのは Overpass のレスポンス時間変動を吸収するため
  - 圏外時は「ここは圏外のようです」とセリフ欄に表示し5秒ループ
  - 圏内復帰: 5秒wait明けに再度 `fetchNearby` を試行 → 成功で `netFails = 0` リセット → 通常運行復帰（**実測 5分以内に会話復帰**: 第2回耐久テスト 2026-06-07）
  - 音声フォールバック (`/audio/offline_notice.wav`) は SW プリキャッシュ済だが、再生処理は未実装
  - 地図のオフライン挙動（**2レイヤー**）:
    1. **グレー圏外オーバーレイ** (`MapView.tsx`): Leaflet コンテナは常時マウント、`online === false` 時に半透明オーバーレイを上に重ねる。解除トリガーは `window.online` イベント → `setOnline(true)`（`page.tsx`）
    2. **タイル充填**: 地理院タイルは cross-origin で SW (`sw.js`) のキャッシュ対象外。電波復帰後の実 fetch 待ち
    - 体感の「地図復帰」はタイル充填の方で、自転車走行中は常に新エリアに進むため SW キャッシュの恩恵は薄い。仕様として受容
  - Map インスタンスは破棄しないので復帰時のリセット不要

## 8. 既知の TODO / 改善候補

| 優先度 | 項目 | 内容 |
|---|---|---|
| 高 | プロセス常駐 | systemd unit 化（現在 `nohup &`、サーバ再起動で死ぬ） |
| 高 | 初期パスワード変更 | `ChangeMe123!` のまま運用しない |
| 中 | Google Places API キー制限 | HTTPリファラ／API スコープを `hinavi.mediowl.ai/*` 相当に絞る（OSM フォールバック用に Places はまだ使用するため） |
| 中 | ALB ヘルスチェック設定 | `GET /login` (200) を使用すれば良い |
| 中 | 圏外フォールバック音声 | SW プリキャッシュ対象には入っているが `/audio/offline_notice.wav` ファイル自体が未配置。配置 + クライアント側の再生処理（`onOfflineNotice` 経路）を追加 |
| 中 | 圏外復帰の早期検知 | 現状ハング検知は2連続失敗（最悪 ~30秒）。軽量ping (`/api/health` を追加して `HEAD` 等) を圏外ブランチ内で叩き、復帰を秒単位で検知することも可能 |
| 中 | Aivis Cloud 本番運用方針 | 当初は自前サーバ（AivisSpeech Engine セルフホスト）移管予定だったが、第2回耐久テスト (2026-06-07) で「**GPU 固定費 vs ユーザー数**」のコスト回収リスクを再認識。ユーザー数が伸びるまでは Aivis Cloud Premium (RPM 10 / 定額) で粘る方が合理的か。RPM 10 上限が同時利用ボトルネックになる閾値（同時アクティブユーザー数）を見極めて判断 |
| 中 | Gemini Context Caching の検証 | §12.5 ⑤ として保留。Gemini の最小キャッシュサイズ（4k〜32k tok）を本プロジェクトの prompt 規模で満たせるか検証。満たせない場合は諦め |
| 低 | ログのローテーション | `/var/log/hinavi/` に永続化済（2026-05-28）。長期運用するなら logrotate 設定追加を検討 |
| 低 | 観光的でない `primaryType` のフィルタ | OSM フォールバックの Places で `department_store` や `hotel` が混じることがある。会話に向くものを `primaryType` でさらに絞る |
| 中 | OSM の name 必須要件を緩める | 第2回耐久テスト (2026-06-07) で Places フォールバック 17% 発生。市街地でも住宅地・幹線沿いで `name`/`name:ja` 付き POI が薄い区間がある。`tourism=*` / `historic=*` 系だけは name 無しでも採用すれば Places 依存を下げられる可能性 |
| 低 | 会話プロンプトの微調整 | 第2回耐久テスト後の所感。「お互いに話しかけ合う」変更は機能しているがさらに磨ける余地あり |
| 中 | 移動手段別のモード閾値最適化 | 汎用化方針 (2026-06-08) に伴う宿題。徒歩 1.5km再フェッチは過大、車 1.5kmは過小、電車は GPS が不安定。移動手段別に閾値を切り替える設計が必要 |
| 中 | 距離注入の Gemini 遵守度確認 | 2026-06-19 で導入。曖昧表現禁止指示が効くかは試走で要確認。漏れた場合は kaiwa1.md の禁止語リストを追加 |
| 低 | 雑談 topics の充実 | 現在 20 件。試走で「同じ話題が繰り返し当たる」感が出るようなら追加検討。SQL 直接 INSERT で増減可能 |
| 低 | 内部識別子の汎用化 | アプリ名は「旅コト」に変更済だが、cookie 名 / localStorage キー / DB 名等は `hinavi` のまま。既存ユーザーへの影響と引き換えに揃えるか保留 |
| 低 | 会話履歴／比較ログの整理 UI | `conversations`（mode 別ターン分布）と `osm_places_compare`（カバレッジ）の簡易ダッシュボードがあると便利 |
| 低 | iOS/Safari 対応 | 仕様上スコープ外だが、Wake Lock 以外は動く可能性あり |
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

### 2026-06-19: 第3回耐久テストに向けた事前準備

週末（晴天時）に第3回耐久テスト予定。確認ポイント:
- OSM カテゴリ拡張 (2026-06-08) と 3 段直列フォールバック化 (2026-06-02) 後の `used_source` 分布（前回 6/07 実測: osm_2k 68% / osm_5k 16% / places 17%）
- 雑談ターン化・距離注入・「お互いに話しかけ合う」プロンプト微調整の体感
- 全般的な品質・コスト・バッテリーの再確認

**事前準備**:
- ✅ DB バックアップ済（ユーザー実施）
- ✅ `osm_places_compare` をクリア（148 件 → 0 件）。次回試走分のみが記録される
- `conversations` は意図的に温存（過去会話の履歴解析用）

**事後集計クエリ例**（試走後にユーザー判断で実行）:
```sql
-- OSM/Places 段別の利用割合
SELECT used_source, COUNT(*) AS n
FROM osm_places_compare
GROUP BY used_source
ORDER BY n DESC;

-- 段別の所要時間
SELECT used_source, AVG(osm_ms) AS avg_osm_ms, AVG(places_ms) AS avg_places_ms
FROM osm_places_compare
GROUP BY used_source;

-- 試走中のモード分布（今回 session の範囲を絞って）
SELECT mode, COUNT(*)/2 AS turns
FROM conversations
WHERE created_at >= '2026-06-XX 00:00:00'  -- 試走開始日時 (UTC) に置換
GROUP BY mode;
```

### 2026-06-19: アプリ表示名を「旅コト」へ変更

PWA インストール時 / 起動画面 / ログイン画面の表示名を `hinavi` → `旅コト` に変更。

**変更点**:
- `public/manifest.webmanifest`: `name` / `short_name` を `hinavi` → `旅コト`、`description` を `自転車用 観光・飲食ガイド` → `AI観光・飲食ガイド`
- `src/app/layout.tsx`: `metadata.title` / `appleWebApp.title` を `hinavi` → `旅コト`
- `src/app/page.tsx`: 開始画面の `<h1>` を `hinavi` → `旅コト`
- `src/app/login/page.tsx`: `<h1>` を `hinavi ログイン` → `旅コト ログイン`
- `public/sw.js`: `CACHE_NAME` を `hinavi-v7` → `hinavi-v8` にバンプ（manifest 変更を確実に取り込ませるため）

**触っていない箇所（内部識別子。変更すると既存ユーザーに影響）**:
- `src/lib/session.ts` `cookieName: 'hinavi_session'` — 変更すると既存セッションが切れる
- `src/lib/client/settings.ts` `TTS_ENGINE_KEY = 'hinavi.ttsEngine'` — 変更すると TTS エンジン設定がリセット
- `src/lib/osm.ts` Overpass User-Agent — 第三者通信用、見えない
- `src/lib/db.ts` `__hinavi_pool` グローバル — 完全に内部

**PWA インストール済端末の挙動**:
- 既にホーム画面に追加済のアイコンは **ラベルが自動更新されない**（Android Chrome 仕様）。新名称を反映するには再インストール（一度削除→ホーム画面追加）が必要
- 新規インストール時は manifest 通り「旅コト」で表示される

**ステータス**:
- ✅ 本番ビルド OK
- ⏳ 本番反映後、新規 PWA インストールで表示確認

### 2026-06-19: 画像素材差し替え（みさき / ひより / PWA アイコン）

新キャラ画像は縦長（520×600）、PWA アイコンは 512×512。素材は `/home/ec2-user/sozai/` から `public/` 配下にコピー。

**変更点**:
- `public/characters/misaki.png`, `public/characters/hiyori.png` を新素材で上書き（旧 500×417 横長 → 新 520×600 縦長）
- `public/icon-512.png` を新 PWA アイコン (`tabikoto_pwa_icon.png`) で上書き
- `src/components/SpeechRow.tsx`: `<Image>` を `width=80 height=67` から `width=70 height=81` へ変更（縦長アスペクト比 520:600 ≒ 70:81 に合わせる）
- `public/sw.js`: `CACHE_NAME` を `hinavi-v6` → `hinavi-v7` にバンプ。これで古いキャラ画像 / 旧アイコンキャッシュが activate 時に破棄される

**ステータス**:
- ✅ 本番ビルド OK
- ⏳ 本番反映後、PWA インストール済端末は SW の更新検知（次回起動 or 数十分以内）で新キャッシュへ切り替わる
- ⏳ 実機での見た目確認（バブルとの高さバランス、`items-end` での揃え方）

### 2026-06-19: スポット会話に距離注入（曖昧表現禁止）

OSM フォールバックで最大 5km 先のスポットが選ばれることがあり、Gemini が「近くに」「あと少しで」と一律に表現してしまうため、距離を明示的に渡して曖昧表現を禁止。

**変更点**:
- `src/lib/distance.ts` 新規。`formatDistance(meters)` を提供
  - `< 1000m`: 100m 単位で四捨五入し「約N00m」（最小 100m）
  - `≧ 1000m`: 0.1km 単位で「約N.Nkm」
  - 境界 950m → 「約1.0km」、4,999m → 「約5.0km」、5,050m → 「約5.1km」
- `src/lib/types.ts` `GenerateRequest` に `distanceMeters?: number` を追加
- `src/lib/client/conversationLoop.ts`: spot ターン毎に `haversineMeters(pos, spot)` を計算し `distanceMeters` を同送。継続ターンでも毎回再計算（移動中に距離が縮むので)
- `src/app/api/generate/route.ts`:
  - `validBody` で `distanceMeters` を任意 number として受理
  - spot コンテキストに `- 距離: 約N00m（…「近く」「あと少し」等の曖昧表現は禁止）` の行を追記
- `prompts/kaiwa/kaiwa1.md`: 距離表現ルールを明記（「与えられた距離をそのまま使う」「『近くに』『あと少しで』『もうすぐ』は禁止」「例：『ここから約500mで〇〇があります』」）

**ステータス**:
- ✅ 型チェック / 本番ビルド OK
- ✅ formatDistance のエッジケース検証済（30/100/149/150/450/949/950/999/1000/1450/2500/4999/5050m）
- ⏳ 本番反映（再起動）はユーザー判断
- ⏳ 実機での距離表現確認（Gemini が指示に従うかは要検証。従わない場合は kaiwa1.md の禁止表現リストを増やす）

### 2026-06-19: 休憩モード→雑談モードへ転換（topics テーブル新設）

汎用観光案内アプリへの方針転換（§11 の 2026-06-08 エントリ参照）に合わせ、`turnNo % 6` の「休憩モード」を「雑談モード」に再設計。

**目的**: 「自転車休憩」を前提とした文言を排除し、移動手段を問わず違和感のない雑談ターンにする。

**変更点**:
- `sql/schema.sql` に `topics` テーブル新設（`id, topic, is_active, created_at`）+ 初期 20 トピック投入（「最近ハマってる飲み物」「行ってみたい旅行先」「100万円もらえたら何に使う？」等）
- `prompts/kaiwa/kaiwa2.md`: ユーザー手動で「雑談タイム」用の指示に書き換え済。`{current_topic}` placeholder で話題を埋め込む方式
- `src/app/api/generate/route.ts`:
  - `pickRandomTopic()` を新設。`SELECT topic FROM topics WHERE is_active = 1 ORDER BY RAND() LIMIT 1`
  - `req2.mode === 'rest'` のときのみ topic を取得し、`buildPrompt` の `fillTopic` で `{current_topic}` を置換
  - DB エラー時のフォールバックは「最近ハマってること」
- `prompts/characters/misaki.md`: 「走行中に耳で聞ける長さ」→「移動中に耳で聞ける長さ」に変更（汎用化）
- `prompts/characters/{misaki,hiyori}.md` / `prompts/kaiwa/kaiwa1.md` / `prompts/kaiwa/kaiwa2.md` / `prompts/kaiwa/kaiwa3.md` のシーン指示は「旅行中」前提に書き換え済（ユーザー手動編集）

**運用上のメモ**:
- topics は SQL 直接編集で増減可能。`UPDATE topics SET is_active = 0 WHERE id = ?` で論理削除
- 1回の rest ターン = 2発話（みさき/ひより）= 1話題で完結する想定。連続 rest ターンは無いので「同じ話題が続く」現象は基本起きない
- 履歴 5 件には引きずられるので、直前の rest 話題は次の rest までに高確率で履歴から押し出される

**ステータス**:
- ✅ 型チェック OK (`npx tsc --noEmit` 通過)
- ✅ topics テーブル投入済（本番 hinavi DB、20 件 INSERT 済）
- ⏳ 本番反映（再起動）はユーザー判断。手順は §6 「再起動」参照
- ⏳ 実機での雑談ターン動作確認

**プロンプト外の自転車表現も追って更新**（汎用観光案内アプリ化に合わせて、ユーザー指示で書き換え）:
- `src/app/layout.tsx:7` `description: 'AI観光・飲食ガイド'`（PWA メタデータ、旧「自転車用 観光・飲食ガイド」）
- `src/app/page.tsx:125` 「自転車走行中のスマホ操作は法令で禁止されています。」（旧「走行中はスマホ画面を見ない・操作しない運用を前提としています。」。道交法改正への注意喚起へ表現を寄せた）
- `src/lib/osm.ts:4` Overpass User-Agent `hinavi/0.1 (AI tourism guidance PWA)`（旧 `cycling navigation PWA`）

### 2026-06-11: ひよりの Aivis モデル UUID を差し替え

ひよりの音声が安定しない（推定: 抑揚や子音の暴れ）所見を受け、Aivis Cloud 上の別モデルへ差し替え。

- `src/lib/characters.ts:25` `hiyori.aivisModelUuid`
  - 旧: `734c12b6-eaf2-4dbd-8596-8663c72d2afa`
  - 新: `a670e6b8-0852-45b2-8704-1bc9862f2fe6`
- みさき (`e9339137-...`) は変更なし
- `tempo_dynamics: 1.5` は維持（送信パラメタ側は触っていない）
- 本番ビルド + 6500 プロセス入れ替え済（新 PID 1341374、`/login` 200 OK 確認）

**実機聴感（差し替え直後 2026-06-11）**: 声の調子が安定し、違和感も少ないことをユーザー確認済。新 UUID を継続採用。

**残課題**: 長時間走行時の挙動は次回試走で再確認。問題があれば旧 UUID へロールバック可能（差分は1行）。Aivis 音声モデルの独自化（§8 低優先）は別途継続。

### 2026-06-08: プロダクト方針見直し（自転車専用 → 汎用モビリティへ・検討中）

第2回耐久テスト後の振り返りで、自転車専用ナビとして前面に出すリスクを再認識:

- 道路交通法上、**自転車運転中のスマホ操作は違法**（2024年11月改正で罰則強化）
- 本サービスは**ハンズフリー設計**で走行中操作は不要だが、「自転車専用」を謳うと社会的批判の対象になりうる
- → コンセプトを **「移動中の汎用音声コンパニオン（電車・車・徒歩・自転車、何でも使える）」** に転換する方向で検討

**残課題（検討中、未着手）**:
- サービス正式名称の見直し（現「hinavi」は自転車前提のネーミング）
- プロンプト調整（「サイクリング中」固定文言の汎用化）
- モード再設計（移動手段別の速度／再フェッチ閾値／会話間隔の最適化）
  - 例: 徒歩 1.5km再フェッチは過大、車 1.5kmは過小、電車は GPS 更新自体が不安定
- 用途別マネタイズポイントの整理（ユーザー検討中）

**実装方針**: 根本構造（会話ループ／Gemini／TTS／OSM スポット取得）は流用可能。差し替えは主にプロンプトとモード閾値・速度依存ロジック。

### 2026-06-08: OSM 取得カテゴリ拡張（Places フォールバック削減策）

第2回耐久テスト (2026-06-07) で Places フォールバック 17% 発生していたため、`src/lib/osm.ts:buildQuery` に駅・宿泊・補給・自然系を追加。

**追加カテゴリ**:
- `railway~"station|halt"` — 駅（`name` 付き率ほぼ100%、信越線等の沿線で確実にカバー）
- `tourism~"hotel|hostel|guest_house|alpine_hut|camp_site"` — 宿泊・キャンプ場
- `amenity~"drinking_water|public_bath"` — 給水・温泉
- `natural~"peak|waterfall|spring"` — 山頂・滝・湧き水
- ※バス停 (`highway=bus_stop`) は密度高すぎてノイズになるため**意図的に除外**

`extractTypes` にも `railway` / `natural` を追加。

**ステータス**: 実装・型チェック OK、本番未反映（次回再起動時に有効化）。次回試走で Places フォールバック比率の変化を観測予定。

### 2026-06-07: 第2回フィールド耐久テスト実施 (東京→信濃町 280km / 18hr)

**走行概要**: 2026-06-07 00:00 JST 東京スタート → 09:00 軽井沢通過 → 18:00 信濃町（野尻湖方面）到着。約 280km。車通り多い区間／下り坂区間は使用停止。

**プロンプト微修正** (試走前 6/07 朝 / 試走中の手入れ):
- `kaiwa1.md` / `kaiwa2.md` / `kaiwa3.md` の会話順指示を「みさきは話題の後にひよりへ話しかける」→「みさきとひよりがお互いに話しかけ合う」に変更（2拍子の単調感を緩和）
- `kaiwa2.md` の架空スポット禁止例を「公園、ベンチ、店舗等」に拡張。OK例として「持参した水や補給食」を追記
- `tts-readings.ts` を `何を/何に/何が` の個別登録から `何回/何で/何と/何` の汎用登録に再構成（順序で具体語を先に処理）

**実機検証結果**

| 項目 | 結果 |
|---|---|
| 会話の繋がり（「お互いに話しかけ合う」効果） | おおむね良好。プロンプトの微調整余地はあり |
| Places 段分布（試走 18hr の実測） | `osm_2k` 69件 (68%) / `osm_5k` 16件 (16%) / `places` 17件 (17%) |
| Overpass 応答時間 | 平均 7.5s (2km段) / 16s (5km まで走った場合の合計) |
| Places フォールバック発生位置 | 深夜の市街地帯（さいたま〜熊谷の幹線沿い、`name` 付き POI が薄い区間）と長野県北部（信濃町・山間部）に集中 |
| 圏外復帰 | 会話は 5分以内に復帰、地図のタイル充填はそれより少し遅れる（仕様、§7 参照）。実用上問題なし |
| バッテリー消費 | 18時間連続走行（Wake Lock 常時ON / GPS常時 / TTS / 地図）で **約 8000mAh**。10000mAh モバイルバッテリーで1日完走可、長距離は 20000mAh 推奨 |
| TTS (Aivis Cloud) | 1日通して聞いて品質・抑揚に問題なし。**本番運用方針の懸念**: GPU セルフホスト移管時、ユーザー数が少ないと GPU 固定費の回収が困難。当面 Aivis Cloud Premium (RPM 10 / 定額) で運用継続が妥当か |
| 地図・コスト | （試走報告継続中） |

**Places 16% の所見**: 都会区間でも 国道17号沿いの住宅地・幹線沿いで Overpass の `name` 付きが枯れる区間がある。山間部の Places フォールバックは想定通り。下記 §8 TODO に「OSM の name 必須要件を緩めて `tourism=*`/`historic=*` だけは name 無しでも採用」検討項目として追加。

**集計時の注意**: DB の `created_at` は UTC 保存。当日の集計時に JST と勘違いして「6/6 の試走？」と誤読する事故あり。§6 末尾に注記済。

### 2026-06-02: スポット取得を3段直列フォールバックへ変更

第2回耐久テスト前の歩行検証で「都会で遠目のスポットを拾いがち」という所見。一方、田舎では 2km まで絞ると枯渇する懸念が残るため、半径違いの 2段 OSM + Places の 3段直列に変更。

**変更点** (`src/app/api/places/nearby/route.ts`):
- 旧: OSM 5km + Places 2km の **並列コール**、OSM 0件のとき Places を採用
- 新: **OSM 2km → 0件なら OSM 5km → 0件なら Places 2km** の直列フォールバック。1件でも取れた段で即返却
- OSM の per-call タイムアウトを 22s → 12s（最悪 12+12+10=34s に収める）
- `osm_places_compare.used_source` の取りうる値を `osm_2k` / `osm_5k` / `places` / `none` に拡張（DDL 変更なし、VARCHAR(16) に収まる）
- 案3方式の運用: `osm_count` は使用 OSM 段の件数、`osm_ms` は走った OSM 段の合計 ms、`places_count`/`places_ms` は Places を実コールした時のみ非0

**クライアント** (`src/lib/client/conversationLoop.ts`):
- `PLACES_TIMEOUT_MS` を 30s → 38s（サーバ側最悪 34s をカバー）

**呼びかけ消失の解消** (2026-06-02 追記)
- 当初はプロンプト「ユーザーへの問いかけ」指定の強弱が原因かと疑ったが、真因は **`{user_name}` プレースホルダがプロンプトから抜けていたこと**だった
- 呼称が分からないと AI は呼びかけを諦める挙動。`misaki.md` / `hiyori.md` の「ユーザーへの呼びかけ：{user_name}さん」と `kaiwa3.md` の時刻読み上げ例文に placeholder を復活させて解消
- `users.display_name` 側は既に `tomi → とみん` が設定済。NULL 時のフォールバック `あなた` 経路は維持

**キャラ画像の角丸化** (`src/components/SpeechRow.tsx`)
- 旧: `relative w-20 h-20` 正方形ラッパー + `fill` + `object-contain`（80×80 内に 80×67 で letterbox 表示、角は直角）
- 新: ラッパー削除し `<Image width={80} height={67}>` の実寸表示 + `rounded-lg` (8px)
- 表示サイズは実質変わらず、視認できる角だけが軽く丸まる

**実機確認状況** (2026-06-02 時点)
- ✅ ビルド + 本番反映完了 (`:6500` 稼働中)
- ✅ ユーザー呼びかけ復活を実機で確認（「とみんさん」呼称が会話に登場）
- ✅ キャラ画像角丸の見た目 OK
- ⏳ 3段直列フォールバックの段分布（`SELECT used_source, COUNT(*) FROM osm_places_compare GROUP BY used_source`）は次回耐久テスト後に集計
- ⏳ 都会で `osm_2k` で十分ヒットし「遠目スポット」問題が解消するかは次回耐久テストで実機検証

### 2026-06-01: 第2回耐久テストに向けた §12 改修一括実装

第1回耐久テスト（16hr）の所見を受けた改修計画 §12 を Phase A/B/C すべて実装・本番反映。

**Phase A — 地図差し替え**
- 圏外時の地図ブラックアウト修正（`MapView.tsx` をコンテナ常時マウント + オフライン半透明オーバーレイ方式へ）
- Google Maps JS API → Leaflet + 地理院タイル(pale) に全面差し替え。`@googlemaps/js-api-loader` 撤去、`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` 未参照化
- マーカーは default icon ではなく `circleMarker`（緑塗 + 白縁）でアイコンパス問題回避
- `MapView` を `next/dynamic({ ssr: false })` で読み込み（Leaflet が SSR で `window` 参照のため）
- 一時停止／歯車ボタンの `z-index` を `z-10` → `z-[1100]` に修正（Leaflet pane が z-index 1000 まで使うため）

**Phase B — 会話コア再構築**
- プロンプト構造を 2 層化: `prompts/characters/{misaki,hiyori}.md`（共通キャラ設定） + `prompts/kaiwa/kaiwa{1,2,3}.md`（シーン別指示）。旧 `{misaki,hiyori}{1,2}.md` 4 ファイルを削除
- 会話ループを 3 モード化: `turnNo % 30` 時間 > `turnNo % 6` 休憩 > その他スポット
- `/api/generate` を 2話者 1コール化。`responseSchema` で `{misaki, hiyori}` JSON 出力を強制。HTTP / JSON パース失敗時は 1 回リトライ
- 履歴 10 → 5 件、`maxOutputTokens` 4096 → 1024、Gemini モデル `gemini-3.5-flash` → `gemini-3.1-flash-lite`（`.env.local` の `GEMINI_MODEL` で上書き可）
- 時間モードはサーバ側で `Intl.DateTimeFormat` の JST 現在時刻をプロンプトに注入
- スポットモードは「会話継続中」「スポット変更」の注意書きを `isSpotContinuation` フラグから自動注入

**Phase C — Places API 二段構え化 + 比較ロギング**
- `src/lib/osm.ts` 新規。Overpass API クライアント（観光・歴史・飲食・公園系の `nwr` クエリ、5km）。`name`/`name:ja` 付きのみ採用、重複除去、最大 100 件ランダムサンプル
- `/api/places/nearby` を OSM 5km + Places 2km の **並列コール**に改修。OSM 1件以上で OSM 使用、0件なら Places フォールバック
- `osm_places_compare` テーブル新設。検証期間中は両 API のレスポンス（件数・種別分布・所要 ms・エラー・使用ソース）を毎回記録
- 再フェッチ閾値 500m → **1.5km**、スポット毎に**最低 2 ターン継続**

**その他**
- `src/lib/tts-readings.ts` 新規。TTS 読み間違い対策の強制置換辞書（送信直前に適用、画面表示は無変更）。`辛い→からい` `お腹→おなか` `何を/何に/何が` `街中→まちなか` を初期登録
- `conversations` テーブルに `mode` カラム追加。同一ターンの 2 行（misaki, hiyori）にモードが入る
- `package.json` から `@googlemaps/js-api-loader` 削除、`leaflet` / `@types/leaflet` 追加

**コスト目標**: 30hr 連続走行で総額 ¥980 / AI ¥450 以下。試算では AI ¥280〜400 着地見込み（実測は次回耐久テスト後）

**実機確認状況**
- ✅ ビルド + 本番反映完了
- ✅ Gemini 3.1 Flash Lite + responseSchema の JSON 出力動作確認（直接コールで `{misaki, hiyori}` 取得）
- ✅ Overpass 5km @ 清水寺周辺で 5,810 POI / 7.5s
- ✅ 休憩ターン（turnNo=6）の実機動作確認
- ⏳ 時間モード（turnNo=30）、TTS 読み替え、OSM/Places 比較ログ集計、Lite モデルの長時間品質は次回耐久テストで検証

### 2026-05-28: VOICEVOX(Sakura) → Aivis Cloud API へ差し替え

**背景**: 音声品質向上のため、Sakura AI Engine の VOICEVOX を Aivis Cloud API へ置き換え。ElevenLabs は継続。
実機での聴感比較で Aivis ≫ VOICEVOX を確認し、**VOICEVOX は廃止確定**。
ElevenLabs vs Aivis は ElevenLabs の方が円滑だが、定額運用しやすい Aivis をデフォルトに採用。

**変更点**:
- `.env.local` に `AIVIS_CLOUD_API_TOKEN` を追加（Premium プラン定額、RPM 10）
- `src/lib/characters.ts`: `voicevoxSpeakerId` を削除し `aivisModelUuid` に置換
  - みさき: `e9339137-2ae3-4d41-9394-fb757a7e61e6`
  - ひより: `734c12b6-eaf2-4dbd-8596-8663c72d2afa` ← 2026-06-11 に `a670e6b8-0852-45b2-8704-1bc9862f2fe6` へ差し替え（音声安定性の改善目的）
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

## 12. 第2回フィールド耐久テストに向けた改修計画 [2026-06-07 実機検証完了]

策定日: 2026-06-01。第1回耐久テスト（16hr）の所見を踏まえた決定版計画。
**実装ステータス**: §12.1 / §12.2 / §12.3 / §12.4 / §12.5 / §12.6 / §12.7 すべて本番反映済み。
**検証ステータス**: 2026-06-07 第2回フィールド耐久テスト (東京→信濃町 280km / 18hr) で実機検証完了。詳細は §11 の 2026-06-07 エントリ参照。

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

## 13. 認証基盤移行計画 — SaaS 化に向けて [Phase 1 着手中, 策定 2026-06-26]

### 13.0 背景と目的

旅コトを SaaS として公開するにあたり、認証方式を刷新する。
- 現状の **email + password (bcrypt + iron-session) を廃止**
- 新方式は **Google ID / Apple Sign In / Email Magic Link** の3経路
- 同時に **無料デモサイト（freetalk = みさき×ひよりのフリートーク, 別開発者・別リポジトリ）→ 旅コト本体** の動線を作るため、サブドメイン間で SSO を共有する

### 13.1 アーキテクチャ（確定）

```
[本番]
misahina.com                  LP（静的、後日構築）
account.misahina.com          認証専用アプリ（Auth.js v5）
tabikoto.misahina.com         旅コト本体（現 hinavi.mediowl.ai を移行）
freetalk.misahina.com         無料デモ（別開発者・別リポジトリ）

[開発]
account.hinavi.mediowl.ai     port 6501 → ALB
tabikoto.hinavi.mediowl.ai    port 6500 → ALB（現 hinavi.mediowl.ai を差し替え）
```

- **コードベース**: 本リポジトリ `/var/www/hinavi/` を **npm workspaces モノレポ化**。`apps/account/` と `apps/tabikoto/` の2アプリ + `packages/auth-jwt/` 共有ライブラリ。
- **認証ライブラリ**: Auth.js v5 (`next-auth@5`)。Adapter は MySQL2 用の自前 adapter（既存の `lib/db.ts` 流用）。
- **セッション**: **RS256 JWT**（DB セッション不使用）。Auth.js の `session.strategy = 'jwt'` に加え、自前の署名鍵を使う。
- **cookie**: 名前 `__Secure-misahina.session`、`Domain=.misahina.com`（dev は `.hinavi.mediowl.ai`）、`Secure; HttpOnly; SameSite=Lax`。
- **JWT 公開鍵配布**: `https://account.<domain>/.well-known/jwks.json`。tabikoto / freetalk はこれを fetch して検証（キャッシュは jose 標準の `createRemoteJWKSet` に任せる）。
- **メール送信**: Amazon SES。dev 送信元 `noreply@hinavi.mediowl.ai`、prod 送信元 `noreply@misahina.com`（どちらも要 SES Verified Identity 登録）。
- **DB**: 既存 `users` 破棄。Auth.js 標準テーブル `users` / `accounts` / `verification_tokens` を新設。`conversations.user_id` の型は再設計。

### 13.2 JWT スペック（freetalk 開発者にも渡す仕様）

| 項目 | 値 |
|---|---|
| アルゴリズム | **RS256** |
| 公開鍵配布 | `https://account.misahina.com/.well-known/jwks.json` (dev: `https://account.hinavi.mediowl.ai/.well-known/jwks.json`) |
| cookie 名 | `__Secure-misahina.session` |
| cookie Domain | `.misahina.com` (prod) / `.hinavi.mediowl.ai` (dev) |
| cookie 属性 | `Secure; HttpOnly; SameSite=Lax; Path=/` |
| 有効期限 | 30 日（`exp` で表現、リフレッシュ無し。期限切れは再ログイン） |
| 発行者 | `iss = "account.misahina.com"`（dev は `account.hinavi.mediowl.ai`） |
| Audience | `aud = ["tabikoto.misahina.com", "freetalk.misahina.com"]`（dev は対応する `.hinavi.mediowl.ai`） |

ペイロード:
```json
{
  "sub": "<users.id (uuid v4)>",
  "email": "user@example.com",
  "email_verified": true,
  "provider": "google" | "apple" | "email",
  "name": "<users.display_name or null>",
  "iat": 1735000000,
  "exp": 1737592000,
  "iss": "account.misahina.com",
  "aud": ["tabikoto.misahina.com", "freetalk.misahina.com"]
}
```

未ログイン時の動線:
- 未ログイン → `https://account.<domain>/login?return=<encoded URL>` にリダイレクト
- ログイン成功後 `return` URL に 302 で戻す（`return` は同一 eTLD+1 配下のみ許可、ホワイトリスト検証）

ログアウト:
- `https://account.<domain>/logout?return=<encoded URL>` を叩くと cookie を空文字 + `Max-Age=0` で上書き → 親ドメイン配下全アプリで一斉ログアウト

検証側コード例（Node）:
```ts
import { jwtVerify, createRemoteJWKSet } from 'jose'
const JWKS = createRemoteJWKSet(new URL('https://account.misahina.com/.well-known/jwks.json'))
const { payload } = await jwtVerify(token, JWKS, {
  issuer: 'account.misahina.com',
  audience: 'freetalk.misahina.com',
})
```

### 13.3 monorepo ディレクトリ構成（新）

```
/var/www/hinavi/
├── package.json               npm workspaces ルート (private)
├── apps/
│   ├── account/               port 6501（Auth.js）
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   ├── src/
│   │   │   ├── auth.ts        Auth.js 設定（providers, jwt callback で RS256 再署名）
│   │   │   ├── app/
│   │   │   │   ├── login/page.tsx       3ボタン + magic link メール送信フォーム
│   │   │   │   ├── logout/route.ts      cookie クリア + return リダイレクト
│   │   │   │   ├── api/auth/[...nextauth]/route.ts
│   │   │   │   └── .well-known/jwks.json/route.ts
│   │   │   └── lib/
│   │   │       ├── db.ts
│   │   │       ├── jwt.ts                JWT 発行（jose, RS256, .env から鍵読込）
│   │   │       └── adapter-mysql.ts      Auth.js 用 MySQL adapter
│   │   └── public/
│   └── tabikoto/              port 6500（旅コト本体、現 src/ をここへ移動）
│       └── ...（既存構造を維持）
├── packages/
│   └── auth-jwt/              JWT 検証ライブラリ（tabikoto / freetalk 用）
│       ├── package.json
│       └── src/index.ts       verifyMisahinaJwt(cookie, { audience }) を export
├── keys/                      RS256 鍵（gitignore）
│   ├── jwt-private-dev.pem
│   └── jwt-public-dev.pem
├── deploy/
│   └── systemd/
│       ├── hinavi-account.service
│       └── hinavi-tabikoto.service
├── docs/
│   └── auth-integration.md    freetalk 開発者向け仕様書
├── sql/schema.sql             users 再設計 + accounts + verification_tokens
├── STATUS.md
└── REQUIREMENTS.md
```

### 13.4 開発・本番運用

**開発**: フォアグラウンド or `nohup` で2プロセス起動
```bash
# 旅コト
cd /var/www/hinavi && npm run -w apps/tabikoto start  # port 6500
# 認証
cd /var/www/hinavi && npm run -w apps/account start   # port 6501
```

**本番**: systemd 2 unit に分割
- `hinavi-account.service` (port 6501 想定 / 本番では 80→ALB 経由)
- `hinavi-tabikoto.service` (port 6500)

### 13.5 確定事項 (2026-06-26 ユーザー決定)

| 項目 | 決定 |
|---|---|
| コードベース配置 | (a) **同一リポジトリでモノレポ化**（npm workspaces） |
| マジックリンクメール | **Amazon SES**（他プロジェクトで実績あり） |
| 既存 users | **全削除可**（DBバックアップ取得済） |
| JWT アルゴリズム | **RS256 固定**（freetalk へ公開鍵で配布） |
| ポート | account=6501 / tabikoto=6500 |
| dev サブドメイン | `account.hinavi.mediowl.ai` / `tabikoto.hinavi.mediowl.ai` |
| prod サブドメイン | `account.misahina.com` / `tabikoto.misahina.com` |
| 本番サーバ | dev とは別サーバ（後日構築） |
| ACM 証明書 | `*.hinavi.mediowl.ai` ワイルドカード（これから取得） |
| 送信元（dev） | `noreply@hinavi.mediowl.ai`（これから SES Verified Identity 登録） |
| 送信元（prod） | `noreply@misahina.com`（本番サーバ構築時に SES 登録） |

### 13.6 ユーザー側 TODO（コードでは完結しないもの）

実装と並行で進めていただきたい外部設定:

- [ ] **Google Cloud Console → OAuth 2.0 Client ID 作成**
  - 種類: Web Application
  - 承認済リダイレクト URI（dev）: `https://account.hinavi.mediowl.ai/api/auth/callback/google`
  - 承認済リダイレクト URI（prod）: `https://account.misahina.com/api/auth/callback/google`
  - 取得値を `.env.local` に: `AUTH_GOOGLE_ID=` `AUTH_GOOGLE_SECRET=`

- [ ] **Apple Developer Portal → Sign In with Apple 設定**
  - App ID（または Service ID）を作成し Sign In with Apple を有効化
  - Service ID identifier（例: `ai.mediowl.hinavi.account`）を作成し、Return URLs を登録
    - dev: `https://account.hinavi.mediowl.ai/api/auth/callback/apple`
    - prod: `https://account.misahina.com/api/auth/callback/apple`
  - Sign In with Apple 用 Key (.p8) を作成し Key ID をメモ、ダウンロード
  - 取得値を `.env.local` に: `AUTH_APPLE_ID=<Service ID>` `AUTH_APPLE_TEAM_ID=` `AUTH_APPLE_KEY_ID=` `AUTH_APPLE_PRIVATE_KEY=<.p8 内容を改行込で>`

- [ ] **Amazon SES → Verified Identity 登録**
  - dev: `noreply@hinavi.mediowl.ai`（DKIM/SPF 設定込）
  - prod は本番サーバ構築時に `noreply@misahina.com` を追加
  - サンドボックス状態なら本番アクセスへの移行申請（受信側ドメインも Verified にすれば dev のうちは申請不要でも回る）
  - IAM ユーザー or インスタンスロールで `ses:SendEmail` 権限付与
  - 取得値を `.env.local` に: `AWS_REGION=` `AWS_SES_FROM=noreply@hinavi.mediowl.ai`（IAM Key/Secret は他プロジェクト同様に設定）

- [ ] **ACM ワイルドカード証明書発行**
  - `*.hinavi.mediowl.ai`（DNS 検証、ap-northeast-1 リージョン or ALB と同じリージョン）
  - 発行完了後 ALB リスナー (HTTPS:443) に追加証明書として紐付け

- [ ] **DNS（Route53 等）**
  - `account.hinavi.mediowl.ai` → ALB Alias
  - `tabikoto.hinavi.mediowl.ai` → ALB Alias

- [ ] **ALB リスナールール追加**
  - Host header = `account.hinavi.mediowl.ai` → 新 target group (TCP 6501)
  - Host header = `tabikoto.hinavi.mediowl.ai` → 既存 target group (TCP 6500)
  - 既存 `hinavi.mediowl.ai` ルールは互換目的でしばらく残す（旧URL から `tabikoto.hinavi.mediowl.ai` への 301 でも可）

- [ ] **RS256 鍵ペア生成**（dev 用、サーバ上で）
  ```bash
  cd /var/www/hinavi && mkdir -p keys && cd keys
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt-private-dev.pem
  openssl rsa -in jwt-private-dev.pem -pubout -out jwt-public-dev.pem
  ```
  本番鍵は本番サーバ構築時に同様に生成（dev とは別鍵）。

### 13.7 Phase 別進捗

#### Phase 1: 計画 & インフラ準備 [完了]
- [x] 認証方式の決定（Google/Apple/Magic Link, Auth.js v5, RS256 JWT）
- [x] STATUS.md §13 への計画記載
- [x] RS256 dev 鍵生成（`keys/jwt-{private,public}-dev.pem`、private は 600 / 公開は 644、gitignore 済）
- [ ] 残りの §13.6 TODO はユーザー側作業

#### Phase 2: monorepo 化 [完了 2026-06-26]
- [x] ルート `package.json` を workspaces 化（`apps/*` + `packages/*`）
- [x] 現 `src/` `public/` `prompts/` `scripts/` `next.config.ts` `tsconfig.json` `next-env.d.ts` `postcss.config.mjs` `eslint.config.mjs` を `apps/tabikoto/` へ `git mv` で移動（履歴維持）
- [x] `apps/tabikoto/package.json` → `@hinavi/tabikoto`, port 6500 で `npm run -w apps/tabikoto build && start` 動作確認
- [x] `apps/account/` を Next.js 16.2.3 で初期化（port 6501）、skeleton ページ起動確認
- [x] `packages/auth-jwt/` を `jose` ベースで雛形作成（`verifyMisahinaJwt()` を export、JWKS リモート取得 + RS256 検証）
- [x] `.env.local` は単一 root にまとめ、`apps/{tabikoto,account}/.env.local` から symlink
- [x] `.gitignore` を monorepo 用に更新（`apps/*/.next/`, `keys/*.pem` 等）
- [x] `restart.sh` を `npm run build:tabikoto && npm run start:tabikoto` に更新
- [x] tabikoto を本番ログ (`/var/log/hinavi/server-*.log`) で再起動、`/login` 200 OK
- [x] next-auth は v5.0.0-beta.31（Next 16 対応版）を採用

#### Phase 3: apps/account 実装 [完了 2026-06-26 — OAuth/SES 認証情報の投入待ち]
- [x] Auth.js v5 セットアップ（`apps/account/src/auth.ts`）
- [x] MySQL adapter（自前。`apps/account/src/lib/adapter-mysql.ts`）
- [x] Google / Apple / Nodemailer(SES) の3プロバイダ設定
- [x] `jwt.encode/decode` を上書きして cookie の中身を **RS256 で署名した JWT** にする（Auth.js デフォルトの JWE/HS256 を捨てた）
- [x] `apps/account/src/lib/jwt-keys.ts` で PEM 鍵を読込み、`jose` の `importPKCS8/importSPKI` で署名鍵化、`exportJWK` で JWKS 化
- [x] cookie 名 `__Secure-misahina.session`, Domain `.hinavi.mediowl.ai` を `cookies.sessionToken` 設定で固定
- [x] `/login/page.tsx` UI（Google / Apple / Magic Link 3経路、`?return=` でホワイトリスト検証）
- [x] `/login/verify-request` / `/login/error` の補助ページ
- [x] `/api/jwks.json` + `/.well-known/jwks.json` (rewrite 経由) で公開鍵配布
- [x] `/logout?return=...` カスタムエンドポイント（Auth.js `signOut(redirect:false)` + 302）
- [x] Apple client_secret JWT を ES256 で起動時生成し 5ヶ月キャッシュ（`apps/account/src/lib/apple-secret.ts`）
- [x] Magic Link メールは Amazon SES v2 SDK 直接送信（`apps/account/src/lib/email-ses.ts`）
- [x] `.env.local` に Auth.js / JWT / SES の placeholder を追加（`AUTH_SECRET` は自動生成済）
- [x] **重要**: `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH` は **絶対パス**で指定（npm workspaces の cwd が `apps/account/` になるため）
- [x] 起動テスト: `/api/jwks.json` が RS256 公開鍵を返し、`/login` 200, `/logout` 307 を確認

#### Phase 4: apps/tabikoto 移行 [完了 2026-06-26]
- [x] `src/lib/session.ts` を JWT 検証ベースに刷新（`getSession()` は `SessionUser | null` を返す。iron-session 撤去）
- [x] `src/proxy.ts` を `@hinavi/auth-jwt` の `verifyMisahinaJwt()` 利用に切替。未ログイン時は `account.hinavi.mediowl.ai/login?return=<encoded>` へ 307
- [x] `src/app/login/` と `src/app/api/auth/login/` を `git rm`
- [x] `src/app/api/auth/logout/route.ts` を `account.hinavi.mediowl.ai/logout?return=/` への 302 リダイレクタに刷新
- [x] `src/app/api/{generate,places/nearby,tts}/route.ts` を新 `getSession()` API に対応（`session.userId: number` → `session.id: string`）
- [x] プロンプト置換の `display_name` → `name` 切替
- [x] `conversations.user_id` / `osm_places_compare.user_id` への INSERT を UUID 文字列で実行
- [x] `SettingsOverlay` のログアウトを `window.location.href = '/api/auth/logout'`（→ account へ転送）に変更
- [x] `apps/tabikoto/scripts/create-user.mjs` を `git rm`
- [x] `bcryptjs` / `iron-session` / `@types/bcryptjs` を `package.json` から削除
- [x] `.env.local` から `SESSION_PASSWORD` / `SESSION_COOKIE_NAME` を削除し、`ACCOUNT_BASE_URL` / `JWKS_URL` / `JWT_AUDIENCE_TABIKOTO` を追加
- [x] **JWKS 取得は dev では `http://localhost:6501/.well-known/jwks.json` を利用**（同 EC2 内なので ALB 経由不要）。prod で別サーバになったらフル URL に差し替え
- [x] 起動テスト: 未認証で `/` 叩くと `https://account.hinavi.mediowl.ai/login?return=...` に 307 リダイレクトされることを確認

#### Phase 5: スキーマ移行
- [ ] `sql/schema.sql` の users を Auth.js 標準に置き換え（`id TEXT PK`, `email`, `name`, `image`, `email_verified` 等）
- [ ] `accounts` / `verification_tokens` 追加
- [ ] `conversations.user_id` の型変更（INT → TEXT）

#### Phase 6: 仕様書 & systemd [完了 2026-06-26]
- [x] `docs/auth-integration.md` — freetalk 開発者へそのまま渡せる仕様書（JWT スペック / JWKS / Node・Python サンプル / ログイン誘導 / ログアウト / トラブルシュート / 連絡先）
- [x] `deploy/systemd/hinavi-tabikoto.service` — port 6500 用 unit（User=ec2-user, Restart=always, ログ `/var/log/hinavi/tabikoto.log`）
- [x] `deploy/systemd/hinavi-account.service` — port 6501 用 unit
- [x] `deploy/systemd/README.md` — インストール / 運用コマンド / 注意点

#### Phase 7: 本番化（後日、本番サーバ構築後）
- [ ] 本番 RS256 鍵生成
- [ ] `.env` 本番値設定
- [ ] systemd 起動、ALB ルール、DNS 切替
- [ ] 旧 `hinavi.mediowl.ai` から `tabikoto.misahina.com` への 301 / または開発環境用に保持

### 13.8 リスクと方針

- **既存 PWA インストール済端末**: cookie 名 (`hinavi_session` → `__Secure-misahina.session`) と URL (`hinavi.mediowl.ai` → `tabikoto.hinavi.mediowl.ai`) が変わるため、**全端末でログアウト状態**になる。新規ログイン誘導はやむなし（テスト用のみのため許容）。
- **ホーム画面アイコン**: PWA scope が変わるため、既存インストール端末は一度削除→再インストール推奨。
- **freetalk 側の Apple Sign In 設定**: 別開発者の Service ID にもこのプロジェクトと同じ Team ID / Key を共有する必要あり。Apple Developer 上で freetalk 用の追加 Service ID を発行する形が綺麗（同一 App ID 配下の異なる Service ID で別 Return URL を許容）。
- **Magic Link のリンク有効期限**: Auth.js デフォルト 24h を **15 分に短縮**（フィッシング耐性）。
- **CSRF**: cookie `SameSite=Lax` + Auth.js の標準 CSRF 対策で十分。`return` パラメータは厳格にホワイトリスト検証する。

