// Sends a correctly signed, fake Razorpay webhook to your server to prove the webhook setup works.
//   npm run webhook:check                                  -> http://localhost:4000
//   npm run webhook:check -- https://your-site.example     -> a deployed server
//   npm run webhook:check -- http://localhost:4000 order_ABC123  -> also credits that order (it must exist)
// Uses RAZORPAY_WEBHOOK_SECRET from server/.env (or the environment).
import { createHmac } from 'node:crypto';

const base = (process.argv[2] || 'http://localhost:4000').replace(/\/$/, '');
const orderId = process.argv[3] || 'order_WEBHOOKCHECK';
const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
if (!secret) {
  console.error('✗ RAZORPAY_WEBHOOK_SECRET is not set (server/.env). Use the same secret you entered in the Razorpay dashboard.');
  process.exit(1);
}

const body = JSON.stringify({
  entity: 'event',
  event: 'payment.captured',
  payload: { payment: { entity: { id: `pay_CHECK${Date.now()}`, order_id: orderId, status: 'captured', amount: 100, currency: 'INR' } } },
  created_at: Math.floor(Date.now() / 1000),
});
const url = `${base}/api/billing/webhook`;

async function send(signature) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature }, body });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

try {
  const good = await send(createHmac('sha256', secret).update(body).digest('hex'));
  const bad = await send('0'.repeat(64));
  if (good.status === 200 && bad.status === 400) {
    console.log(`✓ ${url}`);
    console.log('  correctly signed event accepted, wrongly signed event rejected.');
    console.log(good.json.handled ? `  Order ${orderId} was marked paid.` : '  (No such order - nothing was credited. That is expected for a check.)');
  } else if (good.status === 503) {
    console.error(`✗ The server does not have RAZORPAY_WEBHOOK_SECRET set. Add it and restart the server. (${good.json.title ?? ''})`);
    process.exit(1);
  } else if (good.status === 400) {
    console.error('✗ Signature rejected: the secret here differs from the one the server uses. They must be identical.');
    process.exit(1);
  } else {
    console.error(`✗ Unexpected answer: good=${good.status} ${JSON.stringify(good.json)} bad=${bad.status}`);
    process.exit(1);
  }
} catch (err) {
  console.error(`✗ Could not reach ${url}: ${err.message}`);
  process.exit(1);
}
