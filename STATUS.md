# hinavi 開発状況

最終更新: 2026-06-11（ひよりの Aivis モデルを `a670e6b8-...` に差し替え。音声安定性の改善を目的）

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
├── package.json               next 16.2.3 / react 19 / mysql2 / iron-session / bcryptjs / leaflet
├── next.config.ts
├── tsconfig.json
├── .env.local                 機密(DB/API キー類) — git管理外
├── sql/schema.sql             users / conversations / osm_places_compare テーブル
├── scripts/create-user.mjs    bcrypt ユーザー作成スクリプト
├── prompts/
│   ├── characters/
│   │   ├── misaki.md          案内役 みさき・キャラ設定 (Aivis model e9339137... / ElevenLabs ugYcuAusTuWCSOpJD0Xd)
│   │   └── hiyori.md          盛り上げ役 ひより・キャラ設定 (Aivis model a670e6b8... / ElevenLabs OSwaPSNdfituxkWcjlkR)
│   └── kaiwa/
│       ├── kaiwa1.md          スポットモード用シーン指示
│       ├── kaiwa2.md          休憩モード用シーン指示（6 ターン毎）
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
    │       ├── places/nearby/route.ts   OSM (Overpass) 5km → 0件なら Google Places 2km フォールバック、両者を osm_places_compare に記録
    │       ├── generate/route.ts        Gemini 3.1 Flash Lite + responseSchema で {misaki, hiyori} JSON 出力
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
    - `turnNo % 6 === 0` → 休憩モード（kaiwa2.md）
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

