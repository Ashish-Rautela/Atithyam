// Plans and Razorpay checkout: create an order, verify the payment, grant the plan.
import { config } from '../../shared/config/env.js';
import { AppError } from '../../shared/errors/AppError.js';
import { logger } from '../../shared/logging/logger.js';
import * as payments from '../../data/payments.js';
import { billingEnabled, isTestMode, createOrder, verifyCheckoutSignature, verifyWebhookSignature } from './razorpay.js';

const FEATURES = {
  free: [
    'Your own account',
    `${config.auth.freeHotelLimit} hotel: overview, ratings and every review`,
    'Reviews read in English, हिंदी and Hinglish',
  ],
  pro: [
    'Unlimited hotels',
    'Benchmark against the hotels guests compare you with',
    'Competitor discovery and collection',
    'Topic trends, early warnings and AI summaries',
    'Change log: did your changes work?',
  ],
  destination: [
    'Everything in Hotel Pro',
    'Seed and refresh whole towns',
    'Destination dashboards and micro-markets',
    'Town-wide issues with evidence export (CSV)',
  ],
};

/** Public plan list for the pricing page. */
export function listPlans() {
  const paid = Object.values(config.billing.plans).map((p) => ({
    id: p.id, name: p.name, pricePaise: p.pricePaise, currency: config.billing.currency, days: p.days, features: FEATURES[p.id],
  }));
  return {
    enabled: billingEnabled(),
    testMode: isTestMode(),
    keyId: billingEnabled() ? config.billing.keyId : null, // public key id - safe to share
    plans: [{ id: 'free', name: 'Free', pricePaise: 0, currency: config.billing.currency, days: null, features: FEATURES.free }, ...paid],
  };
}

/** Step 1: create a Razorpay order for the signed-in user. The browser then opens Razorpay Checkout. */
export async function startCheckout(user, planId) {
  if (!billingEnabled()) throw new AppError(503, 'PAYMENTS_DISABLED', 'Payments are not set up yet (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).');
  const plan = config.billing.plans[planId];
  if (!plan) throw AppError.badRequest('Unknown plan');
  const receipt = `rip_${user.userId}_${Date.now().toString(36)}`; // <= 40 chars
  const order = await createOrder({
    amountPaise: plan.pricePaise,
    currency: config.billing.currency,
    receipt,
    notes: { userId: String(user.userId), plan: plan.id, email: user.email },
  });
  await payments.insertOrder({ userId: user.userId, plan: plan.id, amountPaise: plan.pricePaise, currency: config.billing.currency, days: plan.days, orderId: order.id });
  return {
    keyId: config.billing.keyId,
    orderId: order.id,
    amountPaise: plan.pricePaise,
    currency: config.billing.currency,
    plan: plan.id,
    planName: plan.name,
    description: `${plan.name} · ${plan.days} days`,
    prefill: { name: user.name, email: user.email },
    testMode: isTestMode(),
  };
}

/** Step 2: the Checkout success handler posts the three razorpay_* values here. */
export async function confirmCheckout(user, { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature }) {
  const order = await payments.getByOrderId(orderId);
  if (!order || order.userId !== user.userId) throw AppError.notFound('Order not found');
  if (!verifyCheckoutSignature({ orderId, paymentId, signature })) {
    logger.warn({ orderId, userId: user.userId }, 'Razorpay signature mismatch');
    throw new AppError(400, 'PAYMENT_NOT_VERIFIED', 'We could not verify this payment. If money was taken, it will be confirmed automatically or refunded by Razorpay.');
  }
  const result = await payments.markPaid(orderId, paymentId);
  logger.info({ orderId, paymentId, userId: user.userId, plan: order.plan, alreadyPaid: result.alreadyPaid }, 'Payment confirmed');
  return result;
}

/** The Checkout was closed or the payment failed in the browser (informational). */
export async function reportFailure(user, { orderId, reason }) {
  const order = await payments.getByOrderId(orderId);
  if (order && order.userId === user.userId) await payments.markFailed(orderId, reason);
}

/**
 * Razorpay webhook (payment.captured, order.paid, payment.failed). A safety net for when the
 * browser closes before step 2. Configure it in Dashboard -> Webhooks with RAZORPAY_WEBHOOK_SECRET.
 */
export async function handleWebhook(rawBody, signature) {
  if (!config.billing.webhookSecret) throw new AppError(503, 'WEBHOOK_DISABLED', 'RAZORPAY_WEBHOOK_SECRET is not set');
  if (!verifyWebhookSignature(rawBody, signature)) throw new AppError(400, 'BAD_SIGNATURE', 'Invalid webhook signature');
  const event = JSON.parse(rawBody.toString('utf8'));
  const payment = event?.payload?.payment?.entity;
  const orderId = payment?.order_id ?? event?.payload?.order?.entity?.id;
  if (!orderId || !(await payments.getByOrderId(orderId))) return { handled: false, event: event?.event };
  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    const result = await payments.markPaid(orderId, payment?.id ?? null);
    logger.info({ orderId, event: event.event, alreadyPaid: result.alreadyPaid }, 'Webhook payment');
    return { handled: true, event: event.event };
  }
  if (event.event === 'payment.failed') {
    await payments.markFailed(orderId, payment?.error_description);
    return { handled: true, event: event.event };
  }
  return { handled: false, event: event.event };
}

export const listPayments = (user) => payments.listForUser(user.userId);
