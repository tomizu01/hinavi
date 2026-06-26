import mysql from 'mysql2/promise';

declare global {
  // eslint-disable-next-line no-var
  var __misahina_account_pool: mysql.Pool | undefined;
}

function makePool(): mysql.Pool {
  return mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    charset: 'utf8mb4',
  });
}

export const pool: mysql.Pool = global.__misahina_account_pool ?? makePool();
if (process.env.NODE_ENV !== 'production') global.__misahina_account_pool = pool;
