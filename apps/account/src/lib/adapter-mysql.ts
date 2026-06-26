import { randomUUID } from 'node:crypto';
import type { Adapter, AdapterUser, AdapterAccount, VerificationToken } from '@auth/core/adapters';
import { pool } from './db';

function rowsToUser(row: Record<string, unknown>): AdapterUser {
  return {
    id: row.id as string,
    email: row.email as string,
    emailVerified: (row.email_verified as Date | null) ?? null,
    name: (row.name as string | null) ?? null,
    image: (row.image as string | null) ?? null,
  };
}

export function MisahinaMysqlAdapter(): Adapter {
  return {
    async createUser(user) {
      const id = randomUUID();
      await pool.execute(
        'INSERT INTO users (id, email, email_verified, name, image) VALUES (?, ?, ?, ?, ?)',
        [id, user.email, user.emailVerified ?? null, user.name ?? null, user.image ?? null]
      );
      return { ...user, id };
    },

    async getUser(id) {
      const [rows] = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
      const r = (rows as Record<string, unknown>[])[0];
      return r ? rowsToUser(r) : null;
    },

    async getUserByEmail(email) {
      const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
      const r = (rows as Record<string, unknown>[])[0];
      return r ? rowsToUser(r) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const [rows] = await pool.execute(
        `SELECT u.* FROM users u
         JOIN accounts a ON a.user_id = u.id
         WHERE a.provider = ? AND a.provider_account_id = ? LIMIT 1`,
        [provider, providerAccountId]
      );
      const r = (rows as Record<string, unknown>[])[0];
      return r ? rowsToUser(r) : null;
    },

    async updateUser(user) {
      const fields: string[] = [];
      const values: Array<string | number | Date | null> = [];
      if (user.email !== undefined) { fields.push('email = ?'); values.push(user.email); }
      if (user.emailVerified !== undefined) { fields.push('email_verified = ?'); values.push(user.emailVerified); }
      if (user.name !== undefined) { fields.push('name = ?'); values.push(user.name ?? null); }
      if (user.image !== undefined) { fields.push('image = ?'); values.push(user.image ?? null); }
      if (fields.length === 0) {
        const [rows] = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [user.id]);
        return rowsToUser((rows as Record<string, unknown>[])[0]);
      }
      values.push(user.id);
      await pool.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
      const [rows] = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [user.id]);
      return rowsToUser((rows as Record<string, unknown>[])[0]);
    },

    async deleteUser(userId) {
      await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
    },

    async linkAccount(account: AdapterAccount) {
      const id = randomUUID();
      await pool.execute(
        `INSERT INTO accounts
         (id, user_id, type, provider, provider_account_id, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          account.userId,
          account.type,
          account.provider,
          account.providerAccountId,
          account.refresh_token ?? null,
          account.access_token ?? null,
          account.expires_at ?? null,
          account.token_type ?? null,
          account.scope ?? null,
          account.id_token ?? null,
          (account.session_state ?? null) as string | null,
        ]
      );
      return account;
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await pool.execute('DELETE FROM accounts WHERE provider = ? AND provider_account_id = ?', [provider, providerAccountId]);
    },

    async createVerificationToken(token: VerificationToken) {
      await pool.execute(
        'INSERT INTO verification_tokens (identifier, token, expires) VALUES (?, ?, ?)',
        [token.identifier, token.token, token.expires]
      );
      return token;
    },

    async useVerificationToken({ identifier, token }) {
      const [rows] = await pool.execute(
        'SELECT identifier, token, expires FROM verification_tokens WHERE identifier = ? AND token = ? LIMIT 1',
        [identifier, token]
      );
      const r = (rows as Record<string, unknown>[])[0];
      if (!r) return null;
      await pool.execute('DELETE FROM verification_tokens WHERE identifier = ? AND token = ?', [identifier, token]);
      return {
        identifier: r.identifier as string,
        token: r.token as string,
        expires: r.expires as Date,
      };
    },
  };
}
