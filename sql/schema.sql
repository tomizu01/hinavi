-- hinavi schema
-- mysql -u ai -p hinavi < sql/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username     VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(64) DEFAULT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 既存環境向け（display_name 後付け用。未適用なら手動実行）:
-- ALTER TABLE users ADD COLUMN display_name VARCHAR(64) DEFAULT NULL AFTER password_hash;

CREATE TABLE IF NOT EXISTS conversations (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
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

-- 既存環境向け（mode 後付け用。未適用なら手動実行）:
-- ALTER TABLE conversations ADD COLUMN mode VARCHAR(16) DEFAULT NULL AFTER turn_no;

-- hinavi2（エベレスティング応援版）専用テーブル。
-- GPS スポットの代わりに、ここに登録された話題からランダムに1件を選び
-- kaiwa1.md の {topic} プレースホルダに差し込む。
CREATE TABLE IF NOT EXISTS topics (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  topic       TEXT NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS osm_places_compare (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
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
