import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '@/lib/db';
import {
  calcExpiresAt,
  type GrantSource,
  type OneTimeGrantType,
} from './config';

export interface BalanceLot {
  lotId: number;
  source: string;
  remaining: number;
  granted_at: string;
  expires_at: string;
}

export interface BalanceSummary {
  total: number;
  lots: BalanceLot[];
}

interface LotRow extends RowDataPacket {
  id: number;
  source: string;
  remaining_points: number;
  granted_at: Date;
  expires_at: Date;
}

// 残高取得: 失効していない・残量がある・期限内のロットのみ
export async function getBalance(userId: string): Promise<BalanceSummary> {
  const [rows] = await pool.execute<LotRow[]>(
    `SELECT id, source, remaining_points, granted_at, expires_at
       FROM point_lots
      WHERE user_id = ?
        AND expired = 0
        AND remaining_points > 0
        AND expires_at > NOW()
      ORDER BY granted_at ASC, id ASC`,
    [userId],
  );
  const lots: BalanceLot[] = rows.map((r) => ({
    lotId: r.id,
    source: r.source,
    remaining: r.remaining_points,
    granted_at: r.granted_at.toISOString(),
    expires_at: r.expires_at.toISOString(),
  }));
  const total = lots.reduce((sum, l) => sum + l.remaining, 0);
  return { total, lots };
}

export interface ConsumeContext {
  sessionId?: string;
  turnNo?: number;
  mode?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  reason?: string;
}

// 残高チェックのみ。生成前のゲートに使う
export async function hasEnoughBalance(
  userId: string,
  amount: number,
): Promise<boolean> {
  const { total } = await getBalance(userId);
  return total >= amount;
}

// FIFO 消費。複数ロットにまたがる場合は分割。
// 同一トランザクション内でロックを取り、整合性を保つ。
export async function consumePoints(
  userId: string,
  amount: number,
  ctx: ConsumeContext = {},
): Promise<void> {
  if (amount <= 0) return;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute<LotRow[]>(
      `SELECT id, source, remaining_points, granted_at, expires_at
         FROM point_lots
        WHERE user_id = ?
          AND expired = 0
          AND remaining_points > 0
          AND expires_at > NOW()
        ORDER BY granted_at ASC, id ASC
        FOR UPDATE`,
      [userId],
    );

    let need = amount;
    const reason = ctx.reason ?? 'consume_generate';
    for (const lot of rows) {
      if (need <= 0) break;
      const take = Math.min(lot.remaining_points, need);
      await conn.execute<ResultSetHeader>(
        `UPDATE point_lots SET remaining_points = remaining_points - ? WHERE id = ?`,
        [take, lot.id],
      );
      await conn.execute<ResultSetHeader>(
        `INSERT INTO point_transactions
         (user_id, lot_id, amount, reason, session_id, turn_no, mode, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          lot.id,
          -take,
          reason,
          ctx.sessionId ?? null,
          ctx.turnNo ?? null,
          ctx.mode ?? null,
          ctx.ip ?? null,
          ctx.userAgent ?? null,
        ],
      );
      need -= take;
    }

    if (need > 0) {
      await conn.rollback();
      throw new Error(`insufficient points: need ${amount}, short ${need}`);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

// 新規ロット付与。Stripe Webhook 受信時や初回お試し付与時に呼ぶ
export async function grantPoints(opts: {
  userId: string;
  source: GrantSource;
  points: number;
  stripeRef?: string | null;
  grantedAt?: Date;
}): Promise<number> {
  const grantedAt = opts.grantedAt ?? new Date();
  const expiresAt = calcExpiresAt(grantedAt);
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO point_lots
     (user_id, source, stripe_ref, initial_points, remaining_points, granted_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.userId,
      opts.source,
      opts.stripeRef ?? null,
      opts.points,
      opts.points,
      grantedAt,
      expiresAt,
    ],
  );
  return result.insertId;
}

// 1ユーザー1回限り付与 (initial_trial / campaign_chokotto_free 等)
// すでに付与済みなら何もしない。重複は user_grants の PK で防ぐ
export async function grantOnceIfAbsent(opts: {
  userId: string;
  grantType: OneTimeGrantType;
  source: GrantSource;
  points: number;
}): Promise<{ granted: boolean; lotId?: number }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.execute<RowDataPacket[]>(
      `SELECT 1 FROM user_grants WHERE user_id = ? AND grant_type = ? LIMIT 1`,
      [opts.userId, opts.grantType],
    );
    if (existing.length > 0) {
      await conn.commit();
      return { granted: false };
    }
    const grantedAt = new Date();
    const expiresAt = calcExpiresAt(grantedAt);
    const [lotRes] = await conn.execute<ResultSetHeader>(
      `INSERT INTO point_lots
       (user_id, source, initial_points, remaining_points, granted_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [opts.userId, opts.source, opts.points, opts.points, grantedAt, expiresAt],
    );
    const lotId = lotRes.insertId;
    await conn.execute<ResultSetHeader>(
      `INSERT INTO user_grants (user_id, grant_type, lot_id) VALUES (?, ?, ?)`,
      [opts.userId, opts.grantType, lotId],
    );
    await conn.commit();
    return { granted: true, lotId };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

// 期限切れロットを失効化（日次バッチで実行）
export async function expireLots(): Promise<{ expiredCount: number }> {
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE point_lots
        SET expired = 1
      WHERE expired = 0
        AND expires_at <= NOW()`,
  );
  return { expiredCount: result.affectedRows };
}
