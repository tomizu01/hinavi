-- コトポ (ポイント) & Stripe サブスク用テーブル追加
-- 実行: mysql -u <user> -p <db> < sql/migrations/20260629_add_billing_tables.sql

CREATE TABLE IF NOT EXISTS point_lots (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           VARCHAR(36) NOT NULL,
  source            VARCHAR(32) NOT NULL,
  stripe_ref        VARCHAR(128) DEFAULT NULL,
  initial_points    INT UNSIGNED NOT NULL,
  remaining_points  INT UNSIGNED NOT NULL,
  granted_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at        TIMESTAMP NOT NULL,
  expired           TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_user_active (user_id, expired, expires_at),
  INDEX idx_user_granted (user_id, granted_at),
  INDEX idx_stripe_ref (stripe_ref),
  CONSTRAINT fk_lot_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS point_transactions (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL,
  lot_id        BIGINT UNSIGNED NOT NULL,
  amount        INT NOT NULL,
  reason        VARCHAR(32) NOT NULL,
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

CREATE TABLE IF NOT EXISTS user_grants (
  user_id     VARCHAR(36) NOT NULL,
  grant_type  VARCHAR(32) NOT NULL,
  lot_id      BIGINT UNSIGNED NOT NULL,
  granted_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, grant_type),
  INDEX idx_lot (lot_id),
  CONSTRAINT fk_grant_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_grant_lot  FOREIGN KEY (lot_id)  REFERENCES point_lots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscriptions (
  id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id                 VARCHAR(36) NOT NULL,
  stripe_subscription_id  VARCHAR(128) NOT NULL UNIQUE,
  stripe_customer_id      VARCHAR(128) NOT NULL,
  price_id                VARCHAR(128) NOT NULL,
  status                  VARCHAR(32) NOT NULL,
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
