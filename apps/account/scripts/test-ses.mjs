#!/usr/bin/env node
// SES SMTP 疎通テスト
// 使用: cd /var/www/hinavi && node apps/account/scripts/test-ses.mjs <宛先メールアドレス>
//
// ※ Sandbox 状態の SES は、宛先も SES で Verified Identity 登録済でないと送れない
//   429 "Email address is not verified" が出たら、Console で宛先アドレスを Verified に追加するか
//   Production access を申請する

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');

// .env.local を最小限パース（クォート対応）
function loadEnv() {
  const envPath = resolve(ROOT, '.env.local');
  const raw = readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v.replace(/\\n/g, '\n');
  }
  return env;
}

const env = loadEnv();
const to = process.argv[2];
if (!to) {
  console.error('Usage: node apps/account/scripts/test-ses.mjs <to-email>');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: env.SES_SMTP_HOST,
  port: Number(env.SES_SMTP_PORT ?? 587),
  secure: false,
  requireTLS: true,
  auth: { user: env.SES_SMTP_USER, pass: env.SES_SMTP_PASS },
});

console.log(`Sending test from ${env.AWS_SES_FROM} to ${to} via ${env.SES_SMTP_HOST}...`);
try {
  const info = await transporter.sendMail({
    from: env.AWS_SES_FROM,
    to,
    subject: '【みさひな】SES 疎通テスト',
    text: 'これは SES SMTP の疎通テストです。受信できれば設定 OK。',
    html: '<p>これは SES SMTP の疎通テストです。受信できれば設定 OK。</p>',
  });
  console.log('OK:', info.messageId);
} catch (e) {
  console.error('FAILED:', e?.message ?? e);
  process.exit(1);
}
