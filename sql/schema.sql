-- hinavi schema (旅コト + misahina account)
-- 2026-06-26 SaaS化に伴い Auth.js v5 標準スキーマへ移行
-- セッションは JWT (RS256) のため `sessions` テーブルは不要
--
-- フレッシュインストール:
--   mysql -u ai -p hinavi < sql/schema.sql
--
-- ※ 既存データは DROP TABLE で全削除される

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS osm_places_compare;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS topics;
DROP TABLE IF EXISTS point_transactions;
DROP TABLE IF EXISTS user_grants;
DROP TABLE IF EXISTS point_lots;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS verification_tokens;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- Auth.js 標準テーブル
-- ============================================================

-- users: account.misahina.com が発行するユーザー。id は UUID v4
CREATE TABLE users (
  id              VARCHAR(36) PRIMARY KEY,
  name            VARCHAR(255) DEFAULT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  email_verified  TIMESTAMP NULL DEFAULT NULL,
  image           TEXT DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- accounts: OAuth プロバイダごとの紐付け (Google / Apple) と Magic Link
CREATE TABLE accounts (
  id                   VARCHAR(36) PRIMARY KEY,
  user_id              VARCHAR(36) NOT NULL,
  type                 VARCHAR(16) NOT NULL,    -- 'oauth' | 'oidc' | 'email' | 'webauthn'
  provider             VARCHAR(32) NOT NULL,    -- 'google' | 'apple' | 'email'
  provider_account_id  VARCHAR(255) NOT NULL,
  refresh_token        TEXT DEFAULT NULL,
  access_token         TEXT DEFAULT NULL,
  expires_at           BIGINT DEFAULT NULL,
  token_type           VARCHAR(64) DEFAULT NULL,
  scope                VARCHAR(255) DEFAULT NULL,
  id_token             TEXT DEFAULT NULL,
  session_state        TEXT DEFAULT NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_account (provider, provider_account_id),
  INDEX idx_user (user_id),
  CONSTRAINT fk_account_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- verification_tokens: Magic Link 用の使い捨てトークン (有効期限15分)
CREATE TABLE verification_tokens (
  identifier  VARCHAR(255) NOT NULL,
  token       VARCHAR(255) NOT NULL,
  expires     TIMESTAMP NOT NULL,
  PRIMARY KEY (identifier, token),
  INDEX idx_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 旅コト本体のテーブル
-- ============================================================

-- conversations: みさき/ひなた 1発話 = 1行
CREATE TABLE conversations (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      VARCHAR(36) NOT NULL,
  session_id   VARCHAR(64) NOT NULL,
  turn_no      INT UNSIGNED NOT NULL,
  mode         VARCHAR(16) DEFAULT NULL,
  speaker      VARCHAR(32) NOT NULL,
  spot_name    VARCHAR(255) DEFAULT NULL,
  spot_lat     DECIMAL(10, 7) DEFAULT NULL,
  spot_lng     DECIMAL(10, 7) DEFAULT NULL,
  text         TEXT NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at),
  INDEX idx_session (session_id),
  CONSTRAINT fk_conv_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- topics: 雑談モードの話題候補
CREATE TABLE topics (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  topic      VARCHAR(255) NOT NULL,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO topics (topic) VALUES
  ('最近ハマってる飲み物'),
  ('行ってみたい旅行先'),
  ('100万円もらえたら何に使う？'),
  ('好きな季節は'),
  ('健康のために気を遣っていること'),
  ('最近見て面白かった映画やドラマ'),
  ('子供の頃の夢'),
  ('休日の過ごし方'),
  ('最近食べて美味しかったもの'),
  ('行ってみたいお店'),
  ('好きな音楽のジャンル'),
  ('ペットを飼うならどんな動物'),
  ('無人島に1つだけ持っていくなら'),
  ('生まれ変わったらなりたい職業'),
  ('最近覚えた便利な小ワザ'),
  ('もう一度行きたい思い出の場所'),
  ('やってみたい習い事'),
  ('好きなおにぎりの具'),
  ('朝型か夜型か'),
  ('落ち込んだときの気分転換');

-- ============================================================
-- 課金・ポイント (コトポ) - 2026-06-29 追加 STATUS.md §14
-- ============================================================

-- point_lots: 付与単位のポイントロット。FIFO 消費の管理単位
CREATE TABLE point_lots (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           VARCHAR(36) NOT NULL,
  source            VARCHAR(32) NOT NULL,
    -- 'initial_trial' | 'plan_chokotto' | 'plan_light'
    -- | 'campaign_chokotto_free' | 'invite_inviter' | 'invite_invitee'
  stripe_ref        VARCHAR(128) DEFAULT NULL,
    -- 由来: Stripe payment_intent / invoice / checkout.session.id
  initial_points    INT UNSIGNED NOT NULL,
  remaining_points  INT UNSIGNED NOT NULL,
  granted_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at        TIMESTAMP NOT NULL,
  expired           TINYINT(1) NOT NULL DEFAULT 0,
    -- 失効バッチで 1 にセット。残量はそのまま残し履歴として保持
  INDEX idx_user_active (user_id, expired, expires_at),
  INDEX idx_user_granted (user_id, granted_at),
  INDEX idx_stripe_ref (stripe_ref),
  CONSTRAINT fk_lot_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- point_transactions: 消費・補填の全履歴。問い合わせ対応・不正検知用
CREATE TABLE point_transactions (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL,
  lot_id        BIGINT UNSIGNED NOT NULL,
  amount        INT NOT NULL,
    -- 負: 消費 / 正: 補填 (失敗時返金など)
  reason        VARCHAR(32) NOT NULL,
    -- 'consume_generate' | 'refund_generate_failed' | 'expire' 等
  session_id    VARCHAR(64) DEFAULT NULL,
  turn_no       INT UNSIGNED DEFAULT NULL,
  mode          VARCHAR(16) DEFAULT NULL,
  ip            VARCHAR(64) DEFAULT NULL,
  user_agent    VARCHAR(255) DEFAULT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_created (user_id, created_at),
  INDEX idx_lot (lot_id),
  CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tx_lot  FOREIGN KEY (lot_id)  REFERENCES point_lots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- user_grants: 1ユーザー1回限り付与 (initial_trial / campaign 等) の重複防止
CREATE TABLE user_grants (
  user_id     VARCHAR(36) NOT NULL,
  grant_type  VARCHAR(32) NOT NULL,
  lot_id      BIGINT UNSIGNED NOT NULL,
  granted_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, grant_type),
  INDEX idx_lot (lot_id),
  CONSTRAINT fk_grant_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_grant_lot  FOREIGN KEY (lot_id)  REFERENCES point_lots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- subscriptions: ライトプラン契約状態。Stripe Subscription のミラー
CREATE TABLE subscriptions (
  id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id                 VARCHAR(36) NOT NULL,
  stripe_subscription_id  VARCHAR(128) NOT NULL UNIQUE,
  stripe_customer_id      VARCHAR(128) NOT NULL,
  price_id                VARCHAR(128) NOT NULL,
  status                  VARCHAR(32) NOT NULL,
    -- 'active' | 'past_due' | 'canceled' | 'incomplete' | 'trialing' 等
  current_period_start    TIMESTAMP NULL DEFAULT NULL,
  current_period_end      TIMESTAMP NULL DEFAULT NULL,
  cancel_at               TIMESTAMP NULL DEFAULT NULL,
  canceled_at             TIMESTAMP NULL DEFAULT NULL,
  created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_status (status),
  CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- osm_places_compare: スポット取得3段フォールバックの計測ログ
CREATE TABLE osm_places_compare (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL,
  session_id    VARCHAR(64) DEFAULT NULL,
  request_lat   DECIMAL(10, 7) NOT NULL,
  request_lng   DECIMAL(10, 7) NOT NULL,
  osm_count     INT UNSIGNED NOT NULL DEFAULT 0,
  places_count  INT UNSIGNED NOT NULL DEFAULT 0,
  osm_types     TEXT DEFAULT NULL,
  places_types  TEXT DEFAULT NULL,
  osm_error     VARCHAR(255) DEFAULT NULL,
  places_error  VARCHAR(255) DEFAULT NULL,
  used_source   VARCHAR(16) NOT NULL,
  osm_ms        INT UNSIGNED DEFAULT NULL,
  places_ms     INT UNSIGNED DEFAULT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session (session_id),
  INDEX idx_created (created_at),
  CONSTRAINT fk_compare_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
