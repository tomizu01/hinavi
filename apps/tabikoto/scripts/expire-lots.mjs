#!/usr/bin/env node
// 期限切れの point_lots を失効化する日次バッチ
// 実行例 (cron, JST 04:00 / UTC 19:00):
//   0 19 * * * cd /var/www/hinavi/apps/tabikoto && node scripts/expire-lots.mjs >> /var/log/hinavi/expire-lots.log 2>&1
//
// .env.local の DB_* を使うため dotenv 経由 or env を別途渡す:
//   set -a; . /var/www/hinavi/apps/tabikoto/.env.local; set +a; node scripts/expire-lots.mjs

import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 2,
  charset: 'utf8mb4',
});

try {
  const [r] = await pool.execute(
    `UPDATE point_lots
        SET expired = 1
      WHERE expired = 0
        AND expires_at <= NOW()`,
  );
  const affected = (r && typeof r === 'object' && 'affectedRows' in r) ? r.affectedRows : 0;
  console.log(`[${new Date().toISOString()}] expired ${affected} lots`);
} catch (err) {
  console.error('expire-lots failed:', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
