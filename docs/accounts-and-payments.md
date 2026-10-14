# Accounts and payments (Razorpay)

## Who can see what

| | Signed out | Free | Hotel Pro | Destination | Admin |
|---|---|---|---|---|---|
| Homepage, Plans page | ✓ | ✓ | ✓ | ✓ | ✓ |
| Search, add hotels | – | 1 hotel | unlimited | unlimited | unlimited |
| Hotel overview, reviews, refresh (own hotels) | – | ✓ | ✓ | ✓ | ✓ |
| Look at other hotels (read only) | – | – | ✓ | ✓ | ✓ |
| Benchmark, competitors, trends, AI summaries, change log | – | – | ✓ | ✓ | ✓ |
| Towns list and town page | list only | ✓ | ✓ | ✓ | ✓ |
| Destination dashboards, seed/refresh towns, CSV export | – | – | – | ✓ | ✓ |

The server enforces every rule. The single table of rules is `POLICY` in
`server/src/services/auth/middleware.js`. The website hides or explains what an account can't
use: a sign-in redirect, an upgrade card, or an upgrade dialog after an action.

## How sign-in works

- **Passwords** are hashed with scrypt; the plain password is never stored.
- **Sessions:** a random token is kept in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` on HTTPS).
  Only its SHA-256 is stored in the `sessions` table. Sessions last 30 days and slide while in use.
- **Changing a password** signs out every other device.
- **Request checks:**
  - Every state-changing request must carry `X-Requested-With: fetch` or a JSON body, which an
    HTML form on another site cannot send.
  - Sign-in is rate-limited: 10 tries per 15 minutes per address and email.
- **Admins:** emails listed in `ADMIN_EMAILS` become administrators when they sign up or sign in.
- **Forgotten passwords:** there is no email reset yet. An administrator can set a new password
  from a server shell:
  ```bash
  node -e "import('./src/services/auth/password.js').then(async m=>console.log(await m.hashPassword(process.argv[1])))" 'new-password'
  # then: UPDATE users SET password_hash = '<output>' WHERE lower(email) = lower('someone@example.com');
  ```

## How payments work (Razorpay Standard Checkout)

1. The Plans page calls `POST /api/billing/checkout {plan}`. The server creates a Razorpay
   **order** for the plan's price. The browser never chooses the amount.
2. Razorpay Checkout opens in its own window. Card and UPI details go only to Razorpay.
3. On success the browser sends `razorpay_order_id`, `razorpay_payment_id` and
   `razorpay_signature` to `POST /api/billing/verify`.
4. The server checks `HMAC_SHA256(order_id|payment_id, key_secret)`. If it matches, the server
   marks the order paid and adds 30 days of the plan. If the plan is still running, the 30 days
   are added after it ends.
5. **Optional webhook:** `POST /api/billing/webhook` handles `payment.captured`, `order.paid`
   and `payment.failed`, signed with `RAZORPAY_WEBHOOK_SECRET`. It confirms payments even if the
   buyer closed the browser too early. An order is credited exactly once, whichever of the two
   arrives first.

Plans are 30-day passes, not subscriptions: nothing renews by itself. Prices and lengths are set
in `.env` (`PLAN_PRO_PRICE_INR`, `PLAN_DESTINATION_PRICE_INR`, `PLAN_*_DAYS`).

## Setup on your laptop

Add to `server/.env`:

```
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx
ADMIN_EMAILS=you@example.com
```

Restart `npm run dev`. The server log prints `payments: razorpay (test mode)`. In test mode,
pay in the Razorpay window with UPI ID `success@razorpay`, or with a test card from
Razorpay's docs.

Webhooks can't reach `localhost`. Use the webhook on AWS, or a tunnel such as ngrok.

## Setup on AWS

1. Open Secrets Manager → the secret whose name starts with `AppSecret-` → *Edit*.
2. Add these keys next to `GEMINI_API_KEY`:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_WEBHOOK_SECRET` (optional)
   - `ADMIN_EMAILS`

   Leave `AUTHOR_HASH_SALT` as it is.
3. Re-run the pipeline's **Deploy** stage. The deploy script passes every non-empty key of that
   secret to the containers.
4. Optional: in Razorpay Dashboard → Webhooks, add `https://<SiteUrl>/api/billing/webhook` with the
   events `payment.captured`, `order.paid` and `payment.failed`, using the same secret.
5. To go live, switch to live keys (`rzp_live_…`) after Razorpay activates your account.

## Tests

`npm test` covers all of this in `server/tests/db/auth-billing.test.js`, using a fake Razorpay API:

- sign-up, sign-in and sign-out
- the cookie flags and the CSRF guard
- the free hotel limit and private hotels
- checkout and signature checks, including forged and replayed confirmations
- plan stacking, the webhook, admins, and password changes

## Adding the Razorpay webhook (step by step)

The webhook lets Razorpay tell the server directly that a payment succeeded. If a buyer closes the
tab right after paying, their plan is still activated.

1. **Make a secret** - any long random string, for example:
   `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
2. **Give it to the server.**
   - Laptop: add `RAZORPAY_WEBHOOK_SECRET=<secret>` to `server/.env` and restart `npm run dev`.
   - AWS: add `"RAZORPAY_WEBHOOK_SECRET": "<secret>"` to the `AppSecret-...` secret in Secrets
     Manager, then retry the pipeline's Deploy stage.
3. **Check it before telling Razorpay:** `npm run webhook:check` (laptop), or
   `npm run webhook:check -- https://<your backend>` (with the same secret in your local `.env`).
   It should print ✓.
4. **Add it in Razorpay.** Turn on the Test Mode toggle, then go to Account & Settings →
   Webhooks → Add New Webhook:
   - **Webhook URL:** `https://<your backend>/api/billing/webhook`
     - With the AWS pipeline, use the `SiteUrl` output of the `rip-prod` stack (`https://xxxx.cloudfront.net`).
     - Point it at the backend directly, not at the Amplify domain. Amplify only serves the
       website, and its proxy is not guaranteed to pass the signature header and exact body through.
   - **Secret:** the same string as in step 1.
   - **Alert email:** yours.
   - **Active events:** `payment.captured`, `payment.failed`, `order.paid`.
5. **Test it.** Make a test payment (UPI `success@razorpay`). In Razorpay → Webhooks → your
   webhook, the deliveries show **200**. The server log shows `Webhook payment`.

Razorpay only calls public HTTPS URLs, never `localhost`. To try the webhook against your laptop,
open a tunnel first, for example `npx cloudflared tunnel --url http://localhost:4000` or
`ngrok http 4000`. Use the printed `https://...` address in step 4. Live mode needs its own
webhook, created the same way with the dashboard in Live Mode.
