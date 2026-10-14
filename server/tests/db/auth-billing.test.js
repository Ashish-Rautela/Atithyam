// Accounts, access policy and Razorpay payments, end to end on the Postgres test database.
// Razorpay itself is replaced by a tiny local HTTP server, so no keys or network are needed.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import request from 'supertest';

// ---- fake Razorpay Orders API (must run before the app's config is imported)
const KEY_ID = 'rzp_test_FAKEKEY123';
const KEY_SECRET = 'test_secret_abc';
const WEBHOOK_SECRET = 'whsec_test_xyz';
let orderSeq = 0;
const fakeRzp = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const auth = Buffer.from(String(req.headers.authorization).replace('Basic ', ''), 'base64').toString();
    if (auth !== `${KEY_ID}:${KEY_SECRET}`) {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { description: 'Authentication failed' } }));
    }
    if (req.method === 'POST' && req.url === '/v1/orders') {
      const o = JSON.parse(body);
      orderSeq += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ id: `order_TEST${orderSeq}`, entity: 'order', amount: o.amount, currency: o.currency, receipt: o.receipt, status: 'created' }));
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end('{}');
  });
});
await new Promise((r) => fakeRzp.listen(0, '127.0.0.1', r));

Object.assign(process.env, {
  AUTH_REQUIRED: 'true',
  RAZORPAY_KEY_ID: KEY_ID,
  RAZORPAY_KEY_SECRET: KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
  RAZORPAY_API_BASE: `http://127.0.0.1:${fakeRzp.address().port}/v1`,
  ADMIN_EMAILS: 'boss@example.com',
  FREE_HOTEL_LIMIT: '1',
});
const { createApp } = await import('../../src/apps/api/app.js');
const { closePool } = await import('../../src/shared/db/pool.js');
const { testDbAvailable, resetDb } = await import('./helpers.js');

const placeUrl = (n) => `https://www.google.com/maps/place/Hotel${n}/data=!4m2!3m1!1s0xabc${n}:0x12${n}!8m2!3d30.4${n}!4d78.0${n}?hl=en`;
const sign = (payload, secret) => createHmac('sha256', secret).update(payload).digest('hex');
const ok = await testDbAvailable();

describe.skipIf(!ok)('accounts, access and Razorpay payments', () => {
  let app;
  const agents = {};
  // A signed-in "browser": keeps the cookie and sends the app header on every call.
  const as = (who) => {
    const a = agents[who];
    const wrap = (m) => (url) => a[m](url).set('X-Requested-With', 'fetch');
    return { get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete') };
  };

  beforeAll(async () => {
    await resetDb();
    app = createApp();
    for (const who of ['asha', 'ravi', 'boss', 'anon']) agents[who] = request.agent(app);
  });
  afterAll(async () => {
    await closePool();
    fakeRzp.close();
  });

  let hotelA;
  let hotelB;

  it('signed out: public pages work, everything else asks to sign in', async () => {
    expect((await request(app).get('/api/health')).body).toMatchObject({ ok: true, accounts: true, payments: true });
    expect((await request(app).get('/api/auth/me')).body).toMatchObject({ user: null, signupOpen: true });
    expect((await request(app).get('/api/cities')).status).toBe(200);
    const plans = (await request(app).get('/api/billing/plans')).body;
    expect(plans).toMatchObject({ enabled: true, testMode: true, keyId: KEY_ID });
    expect(plans.plans.map((p) => p.id)).toEqual(['free', 'pro', 'destination']);
    expect(plans.plans[1].pricePaise).toBe(99900);
    const denied = await request(app).get('/api/businesses');
    expect(denied.status).toBe(401);
    expect(denied.body.type).toBe('AUTH_REQUIRED');
    expect((await request(app).post('/api/search').set('X-Requested-With', 'fetch').send({ name: 'Hotel' })).status).toBe(401);
  });

  it('registers, rejects duplicates and weak passwords, and sets a safe cookie', async () => {
    const res = await as('asha').post('/api/auth/register').send({ name: 'Asha Negi', email: 'Asha@Example.com', password: 'pahadi-chai-42', organisation: 'Deodar Heights' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Asha Negi', email: 'Asha@Example.com', role: 'user' });
    expect(res.body.access).toMatchObject({ tier: 'free', hotelLimit: 1, hotelsUsed: 0 });
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/^rip_session=[\w-]{40,};/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).not.toMatch(/Secure/); // plain http in tests

    const dupe = await request(app).post('/api/auth/register').send({ name: 'Xy Z', email: 'asha@example.com', password: 'another-pass-1' });
    expect(dupe.status).toBe(409);
    expect((await request(app).post('/api/auth/register').send({ name: 'Y Z', email: 'y@example.com', password: 'short' })).status).toBe(400);
    expect((await request(app).post('/api/auth/register').send({ name: 'Y Z', email: 'not-an-email', password: 'long-enough-1' })).status).toBe(400);

    expect((await as('asha').get('/api/auth/me')).body.user.email).toBe('Asha@Example.com');
  });

  it('signs in with the right password only (case-insensitive email)', async () => {
    const bad = await request(app).post('/api/auth/login').send({ email: 'asha@example.com', password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(bad.body.type).toBe('INVALID_CREDENTIALS');
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever-123' });
    expect(unknown.status).toBe(401);
    const good = await request(app).post('/api/auth/login').send({ email: 'ASHA@example.com', password: 'pahadi-chai-42' });
    expect(good.status).toBe(200);
    expect(good.headers['set-cookie'][0]).toMatch(/^rip_session=/);
  });

  it('blocks cross-site style requests without the app header', async () => {
    const res = await agents.asha.post('/api/businesses').set('content-type', 'text/plain').send('name=x');
    expect(res.status).toBe(403);
  });

  it('free plan: one hotel, its overview only; other people’s hotels are private', async () => {
    const a = await as('asha').post('/api/businesses').send({ name: 'Hotel A', location: 'Mussoorie', googleUrl: placeUrl(1) });
    expect(a.status).toBe(202);
    hotelA = a.body.bizId;

    const second = await as('asha').post('/api/businesses').send({ name: 'Hotel B', location: 'Mussoorie', googleUrl: placeUrl(2) });
    expect(second.status).toBe(402);
    expect(second.body).toMatchObject({ type: 'PLAN_REQUIRED', detail: { requiredPlan: 'pro' } });

    // Re-opening the hotel she already has is fine.
    expect((await as('asha').post('/api/businesses').send({ hotelId: hotelA })).status).toBe(202);

    const mine = (await as('asha').get('/api/businesses')).body.items.map((h) => h.bizId);
    expect(mine).toEqual([hotelA]);
    expect((await as('asha').get(`/api/businesses/${hotelA}`)).status).toBe(200);
    const events = await as('asha').get(`/api/businesses/${hotelA}/events`);
    expect(events.status).toBe(402);
    expect(events.body.detail.requiredPlan).toBe('pro');
    expect((await as('asha').get('/api/cities/1/destination')).body.detail.requiredPlan).toBe('destination');

    // Ravi adds hotel B; Asha (free) cannot look at it.
    await as('ravi').post('/api/auth/register').send({ name: 'Ravi Rawat', email: 'ravi@example.com', password: 'kumaon-trek-77' });
    const b = await as('ravi').post('/api/businesses').send({ name: 'Hotel B', location: 'Nainital', googleUrl: placeUrl(2) });
    expect(b.status).toBe(202);
    hotelB = b.body.bizId;
    expect((await as('asha').get(`/api/businesses/${hotelB}`)).status).toBe(403);
    expect((await as('asha').post(`/api/businesses/${hotelB}/refresh`).send({})).status).toBe(403);
    expect((await as('ravi').get(`/api/businesses/${hotelA}`)).status).toBe(403);
  });

  let orderId;
  it('checkout: creates a Razorpay order and only accepts a correctly signed payment', async () => {
    expect((await request(app).post('/api/billing/checkout').set('X-Requested-With', 'fetch').send({ plan: 'pro' })).status).toBe(401);
    expect((await as('asha').post('/api/billing/checkout').send({ plan: 'gold' })).status).toBe(400);

    const co = await as('asha').post('/api/billing/checkout').send({ plan: 'pro' });
    expect(co.status).toBe(201);
    expect(co.body).toMatchObject({ keyId: KEY_ID, amountPaise: 99900, currency: 'INR', plan: 'pro', prefill: { email: 'Asha@Example.com' }, testMode: true });
    orderId = co.body.orderId;
    expect(orderId).toMatch(/^order_TEST/);

    const paymentId = 'pay_TESTabc123';
    const forged = await as('asha').post('/api/billing/verify').send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: 'a'.repeat(64) });
    expect(forged.status).toBe(400);
    expect(forged.body.type).toBe('PAYMENT_NOT_VERIFIED');

    // Someone else's order is not visible.
    const sig = sign(`${orderId}|${paymentId}`, KEY_SECRET);
    expect((await as('ravi').post('/api/billing/verify').send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig })).status).toBe(404);

    const paid = await as('asha').post('/api/billing/verify').send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig });
    expect(paid.status).toBe(200);
    expect(paid.body.payment).toMatchObject({ status: 'paid', plan: 'pro', amountPaise: 99900 });
    expect(paid.body.account.access).toMatchObject({ tier: 'pro', hotelLimit: null });
    const days = (Date.parse(paid.body.period.endsAt) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);

    // Replaying the same confirmation does not grant a second month.
    const again = await as('asha').post('/api/billing/verify').send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig });
    expect(again.status).toBe(200);
    expect(again.body.period).toBeNull();
  });

  it('Hotel Pro unlocks pro features, more hotels and read-only access to other hotels', async () => {
    expect((await as('asha').get(`/api/businesses/${hotelA}/events`)).status).toBe(200);
    expect((await as('asha').get(`/api/businesses/${hotelB}`)).status).toBe(200); // look at a competitor
    expect((await as('asha').post(`/api/businesses/${hotelB}/refresh`).send({})).status).toBe(403); // but not change it
    expect((await as('asha').post('/api/businesses').send({ hotelId: hotelB })).status).toBe(202); // or add it to her hotels
    expect((await as('asha').post(`/api/businesses/${hotelB}/refresh`).send({})).status).toBe(202);
    expect((await as('asha').get('/api/cities/1/destination')).status).toBe(402); // still not Destination
  });

  it('a second purchase extends the plan instead of overlapping it', async () => {
    const co = await as('asha').post('/api/billing/checkout').send({ plan: 'pro' });
    const sig = sign(`${co.body.orderId}|pay_TESTsecond`, KEY_SECRET);
    const res = await as('asha').post('/api/billing/verify').send({ razorpay_order_id: co.body.orderId, razorpay_payment_id: 'pay_TESTsecond', razorpay_signature: sig });
    const days = (Date.parse(res.body.period.endsAt) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(59.9);
    expect(days).toBeLessThan(60.1);
    const pays = (await as('asha').get('/api/billing/payments')).body.items;
    expect(pays.filter((p) => p.status === 'paid')).toHaveLength(2);
  });

  it('webhook: confirms a payment even if the browser never came back, and rejects bad signatures', async () => {
    const co = await as('ravi').post('/api/billing/checkout').send({ plan: 'destination' });
    expect(co.body.amountPaise).toBe(499900);
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_TESTwebhook', order_id: co.body.orderId, status: 'captured' } } } });

    const bad = await request(app).post('/api/billing/webhook').set('content-type', 'application/json').set('x-razorpay-signature', sign(body, 'wrong')).send(body);
    expect(bad.status).toBe(400);
    expect((await as('ravi').get('/api/auth/me')).body.access.tier).toBe('free');

    const good = await request(app).post('/api/billing/webhook').set('content-type', 'application/json').set('x-razorpay-signature', sign(body, WEBHOOK_SECRET)).send(body);
    expect(good.status).toBe(200);
    expect(good.body).toMatchObject({ ok: true, handled: true });
    expect((await as('ravi').get('/api/auth/me')).body.access.tier).toBe('destination');
    // Destination includes Hotel Pro features.
    expect((await as('ravi').get(`/api/businesses/${hotelB}/events`)).status).toBe(200);

    // The late browser confirmation is accepted without a second grant.
    const sig = sign(`${co.body.orderId}|pay_TESTwebhook`, KEY_SECRET);
    const late = await as('ravi').post('/api/billing/verify').send({ razorpay_order_id: co.body.orderId, razorpay_payment_id: 'pay_TESTwebhook', razorpay_signature: sig });
    expect(late.body.period).toBeNull();
  });

  it('admins (ADMIN_EMAILS) see everything', async () => {
    const res = await as('boss').post('/api/auth/register').send({ name: 'Admin', email: 'boss@example.com', password: 'devbhoomi-admin-1' });
    expect(res.body.user.role).toBe('admin');
    expect(res.body.access.tier).toBe('admin');
    const all = (await as('boss').get('/api/businesses')).body.items.map((h) => h.bizId).sort();
    expect(all).toEqual([hotelA, hotelB].sort());
    expect((await as('boss').post(`/api/businesses/${hotelA}/refresh`).send({})).status).toBe(202);
  });

  it('changing the password signs out other devices; logout ends the session', async () => {
    const other = request.agent(app);
    await other.post('/api/auth/login').send({ email: 'asha@example.com', password: 'pahadi-chai-42' });
    expect((await other.get('/api/auth/me')).body.user).not.toBeNull();

    expect((await as('asha').post('/api/auth/password').send({ currentPassword: 'nope-nope-1', newPassword: 'new-password-2026' })).status).toBe(400);
    expect((await as('asha').post('/api/auth/password').send({ currentPassword: 'pahadi-chai-42', newPassword: 'new-password-2026' })).status).toBe(204);
    expect((await other.get('/api/auth/me')).body.user).toBeNull();
    expect((await as('asha').get('/api/auth/me')).body.user).not.toBeNull();

    expect((await as('asha').post('/api/auth/logout').send({})).status).toBe(204);
    expect((await as('asha').get('/api/auth/me')).body.user).toBeNull();
    expect((await as('asha').get('/api/businesses')).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: 'asha@example.com', password: 'new-password-2026' })).status).toBe(200);
  });
});
