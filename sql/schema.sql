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

CREATE TABLE IF NOT EXISTS topics (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  topic      VARCHAR(255) NOT NULL,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- topics 初期データ（雑談ターン用の話題候補）
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
