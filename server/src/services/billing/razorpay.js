// Minimal Razorpay client (REST, no SDK): create orders and verify the two kinds of signatures.
// Docs: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../../shared/config/env.js';
import { AppError } from '../../shared/errors/AppError.js';

export const billingEnabled = () => Boolean(config.billing.keyId && config.billing.keySecret);
export const isTestMode = () => String(config.billing.keyId ?? '').startsWith('rzp_test_');

async function call(method, path, body) {
  const auth = Buffer.from(`${config.billing.keyId}:${config.billing.keySecret}`).toString('base64');
  let res;
  try {
    res = await fetch(`${config.billing.apiBase}${path}`, {
      method,
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new AppError(502, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Could not reach Razorpay. Please try again.', { cause: err.message });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = data?.error?.description ?? `HTTP ${res.status}`;
    throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', `Razorpay: ${reason}`);
  }
  return data;
}

/** https://razorpay.com/docs/api/orders/create/ — amount in paise. */
export function createOrder({ amountPaise, currency, receipt, notes }) {
  return call('POST', '/orders', { amount: amountPaise, currency, receipt, notes });
}

export function fetchPayment(paymentId) {
  return call('GET', `/payments/${encodeURIComponent(paymentId)}`);
}

function hmacEquals(secret, payload, signature) {
  if (!secret || typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(payload).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

/** Checkout success handler: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  return hmacEquals(config.billing.keySecret, `${orderId}|${paymentId}`, signature);
}

/** Webhooks: HMAC_SHA256(raw request body, webhook_secret) in the X-Razorpay-Signature header. */
export function verifyWebhookSignature(rawBody, signature) {
  return hmacEquals(config.billing.webhookSecret, rawBody, signature);
}
