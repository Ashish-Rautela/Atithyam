// SQL for Razorpay orders/payments and the plan periods they grant.
import { one, many, tx } from '../shared/db/pool.js';
import { grantPeriod } from './accounts.js';

const toPayment = (r) => r && ({
  paymentId: r.id,
  plan: r.plan,
  amountPaise: r.amount_paise,
  currency: r.currency,
  days: r.days,
  orderId: r.razorpay_order_id,
  razorpayPaymentId: r.razorpay_payment_id,
  status: r.status,
  createdAt: r.created_at,
  paidAt: r.paid_at,
});

export async function insertOrder({ userId, plan, amountPaise, currency, days, orderId }) {
  return toPayment(await one(
    `INSERT INTO payments (user_id, plan, amount_paise, currency, days, razorpay_order_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, plan, amountPaise, currency, days, orderId],
  ));
}

export async function getByOrderId(orderId) {
  const r = await one('SELECT * FROM payments WHERE razorpay_order_id = $1', [orderId]);
  return r && { ...toPayment(r), userId: r.user_id };
}

export async function listForUser(userId, limit = 50) {
  return (await many('SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit])).map(toPayment);
}

/**
 * Marks an order paid and grants its plan period, exactly once: the checkout callback and the
 * webhook may both arrive, in either order. Returns { payment, period, alreadyPaid }.
 */
export async function markPaid(orderId, razorpayPaymentId) {
  return tx(async (client) => {
    const { rows } = await client.query(
      `UPDATE payments SET status = 'paid', razorpay_payment_id = $2, paid_at = now(), failure_reason = NULL
       WHERE razorpay_order_id = $1 AND status <> 'paid' RETURNING *`,
      [orderId, razorpayPaymentId],
    );
    if (!rows.length) {
      const existing = (await client.query('SELECT * FROM payments WHERE razorpay_order_id = $1', [orderId])).rows[0];
      return { payment: toPayment(existing), period: null, alreadyPaid: Boolean(existing) };
    }
    const p = rows[0];
    const period = await grantPeriod(client, { userId: p.user_id, plan: p.plan, days: p.days, paymentId: p.id });
    return { payment: toPayment(p), period, alreadyPaid: false };
  });
}

export async function markFailed(orderId, reason) {
  await one(
    `UPDATE payments SET status = 'failed', failure_reason = $2 WHERE razorpay_order_id = $1 AND status = 'created' RETURNING id`,
    [orderId, String(reason ?? '').slice(0, 300) || null],
  );
}
