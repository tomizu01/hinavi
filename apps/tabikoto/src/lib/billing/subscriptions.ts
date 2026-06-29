import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type Stripe from 'stripe';
import { pool } from '@/lib/db';

interface SubRow extends RowDataPacket {
  id: number;
  user_id: string;
  status: string;
}

function tsToMysql(unixSec: number | null | undefined): Date | null {
  if (!unixSec) return null;
  return new Date(unixSec * 1000);
}

export async function upsertSubscriptionFromStripe(
  sub: Stripe.Subscription,
  userId: string,
): Promise<void> {
  const item = sub.items.data[0];
  const priceId = item?.price.id ?? '';

  const periodStart = tsToMysql(
    (item as { current_period_start?: number } | undefined)?.current_period_start ??
      (sub as unknown as { current_period_start?: number }).current_period_start,
  );
  const periodEnd = tsToMysql(
    (item as { current_period_end?: number } | undefined)?.current_period_end ??
      (sub as unknown as { current_period_end?: number }).current_period_end,
  );

  await pool.execute<ResultSetHeader>(
    `INSERT INTO subscriptions
       (user_id, stripe_subscription_id, stripe_customer_id, price_id, status,
        current_period_start, current_period_end, cancel_at, canceled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       price_id = VALUES(price_id),
       current_period_start = VALUES(current_period_start),
       current_period_end = VALUES(current_period_end),
       cancel_at = VALUES(cancel_at),
       canceled_at = VALUES(canceled_at)`,
    [
      userId,
      sub.id,
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      priceId,
      sub.status,
      periodStart,
      periodEnd,
      tsToMysql(sub.cancel_at),
      tsToMysql(sub.canceled_at),
    ],
  );
}

export async function findUserIdBySubscription(
  subscriptionId: string,
): Promise<string | null> {
  const [rows] = await pool.execute<SubRow[]>(
    `SELECT user_id FROM subscriptions WHERE stripe_subscription_id = ? LIMIT 1`,
    [subscriptionId],
  );
  return rows[0]?.user_id ?? null;
}

export async function findActiveSubscriptionByCustomer(
  customerId: string,
): Promise<{ userId: string; subscriptionId: string } | null> {
  const [rows] = await pool.execute<(SubRow & { stripe_subscription_id: string })[]>(
    `SELECT user_id, stripe_subscription_id
       FROM subscriptions
      WHERE stripe_customer_id = ?
      ORDER BY id DESC
      LIMIT 1`,
    [customerId],
  );
  const r = rows[0];
  return r ? { userId: r.user_id, subscriptionId: r.stripe_subscription_id } : null;
}
