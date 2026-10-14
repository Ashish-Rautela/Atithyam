-- Accounts, sign-in sessions, the hotels each account follows, and Razorpay plan payments.

CREATE TABLE users (
  id             bigserial PRIMARY KEY,
  email          text NOT NULL,
  name           text NOT NULL,
  organisation   text,
  password_hash  text NOT NULL,                       -- scrypt$N$r$p$salt$hash (see services/auth/password.js)
  role           text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- The cookie holds a random token; only its SHA-256 is stored, so a database leak cannot be replayed.
CREATE TABLE sessions (
  token_hash    text PRIMARY KEY,
  user_id       bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  user_agent    text,
  ip            text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

-- Hotels an account has added ("my hotels"). The free plan may follow one.
CREATE TABLE user_hotels (
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hotel_id    text   NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hotel_id)
);
CREATE INDEX user_hotels_hotel_idx ON user_hotels (hotel_id);

-- One row per Razorpay order. Becomes 'paid' exactly once (checkout callback or webhook, whichever is first).
CREATE TABLE payments (
  id                   bigserial PRIMARY KEY,
  user_id              bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan                 text NOT NULL CHECK (plan IN ('pro', 'destination')),
  amount_paise         integer NOT NULL CHECK (amount_paise > 0),
  currency             text NOT NULL DEFAULT 'INR',
  days                 integer NOT NULL CHECK (days > 0),
  razorpay_order_id    text NOT NULL UNIQUE,
  razorpay_payment_id  text UNIQUE,
  status               text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  paid_at              timestamptz,
  failure_reason       text
);
CREATE INDEX payments_user_idx ON payments (user_id, created_at DESC);

-- Access periods granted by paid orders (or by an admin). Back-to-back purchases extend the period.
CREATE TABLE plan_periods (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan        text NOT NULL CHECK (plan IN ('pro', 'destination')),
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL CHECK (ends_at > starts_at),
  payment_id  bigint UNIQUE REFERENCES payments(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_periods_user_idx ON plan_periods (user_id, ends_at DESC);
