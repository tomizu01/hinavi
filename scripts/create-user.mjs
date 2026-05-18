#!/usr/bin/env node
// Usage: node scripts/create-user.mjs <username> <password>
// Creates or updates a user with bcrypt-hashed password.

import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '..', '.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=');
      const key = l.slice(0, idx).trim();
      let val = l.slice(idx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      return [key, val];
    }),
);

const [, , username, password] = process.argv;
if (!username || !password) {
  console.error('Usage: node scripts/create-user.mjs <username> <password>');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);

const conn = await mysql.createConnection({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
});

await conn.execute(
  `INSERT INTO users (username, password_hash) VALUES (?, ?)
   ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
  [username, hash],
);

console.log(`User "${username}" registered.`);
await conn.end();
