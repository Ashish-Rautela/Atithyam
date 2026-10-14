// SQL for accounts, sessions, followed hotels and plan periods.
import { createHash, randomBytes } from 'node:crypto';
import { query, one, many } from '../shared/db/pool.js';

const USER_COLS = 'id, email, name, organisation, role, created_at, last_login_at';
const toUser = (r) => r && ({
  userId: r.id,
  email: r.email,
  name: r.name,
  organisation: r.organisation,
  role: r.role,
  createdAt: r.created_at,
  lastLoginAt: r.last_login_at,
});

// ------------------------------------------------------------------ users
export async function createUser({ email, name, organisation, passwordHash, role = 'user' }) {
  const r = await one(
    `INSERT INTO users (email, name, organisation, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ((lower(email))) DO NOTHING
     RETURNING ${USER_COLS}`,
    [email.trim(), name.trim(), organisation?.trim() || null, passwordHash, role],
  );
  return toUser(r); // null when the email is already registered
}

/** Includes password_hash: only for sign-in. */
export async function findUserForLogin(email) {
  const r = await one(`SELECT ${USER_COLS}, password_hash FROM users WHERE lower(email) = lower($1)`, [email.trim()]);
  return r && { ...toUser(r), passwordHash: r.password_hash };
}

export async function getUserWithHash(userId) {
  const r = await one(`SELECT ${USER_COLS}, password_hash FROM users WHERE id = $1`, [userId]);
  return r && { ...toUser(r), passwordHash: r.password_hash };
}

export async function setPasswordHash(userId, passwordHash) {
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, passwordHash]);
}

export async function updateProfile(userId, { name, organisation }) {
  return toUser(await one(
    `UPDATE users SET name = COALESCE($2, name), organisation = CASE WHEN $3::boolean THEN $4 ELSE organisation END
     WHERE id = $1 RETURNING ${USER_COLS}`,
    [userId, name?.trim() || null, organisation !== undefined, organisation?.trim() || null],
  ));
}

export async function markLogin(userId, role) {
  return toUser(await one(
    `UPDATE users SET last_login_at = now(), role = COALESCE($2, role) WHERE id = $1 RETURNING ${USER_COLS}`,
    [userId, role ?? null],
  ));
}

// ------------------------------------------------------------------ sessions
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** Returns the raw token for the cookie; only its hash is stored. */
export async function createSession(userId, { days, userAgent, ip }) {
  const token = randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent, ip)
     VALUES ($1, $2, now() + make_interval(days => $3), $4, $5)`,
    [sha256(token), userId, days, userAgent?.slice(0, 300) ?? null, ip?.slice(0, 64) ?? null],
  );
  return token;
}

/** The signed-in user for a cookie token, or null. Extends the session (sliding) at most every 10 minutes. */
export async function userForSession(token, days) {
  if (!token || token.length > 100) return null;
  const r = await one(
    `WITH s AS (
       UPDATE sessions SET last_seen_at = now(), expires_at = now() + make_interval(days => $2)
       WHERE token_hash = $1 AND expires_at > now() AND last_seen_at < now() - interval '10 minutes'
       RETURNING user_id
     )
     SELECT ${USER_COLS.split(', ').map((c) => `u.${c}`).join(', ')}
     FROM sessions x JOIN users u ON u.id = x.user_id
     WHERE x.token_hash = $1 AND x.expires_at > now()`,
    [sha256(token), days],
  );
  return toUser(r);
}

export async function deleteSession(token) {
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
}

/** Signs out every other device (after a password change). */
export async function deleteOtherSessions(userId, keepToken) {
  await query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [userId, sha256(keepToken ?? '')]);
}

export async function purgeExpiredSessions() {
  await query('DELETE FROM sessions WHERE expires_at < now()');
}

// ------------------------------------------------------------------ followed hotels
export async function followHotel(userId, hotelId) {
  await query('INSERT INTO user_hotels (user_id, hotel_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, hotelId]);
}

export async function followsHotel(userId, hotelId) {
  return Boolean(await one('SELECT 1 FROM user_hotels WHERE user_id = $1 AND hotel_id = $2', [userId, hotelId]));
}

export async function followedHotelIds(userId) {
  return (await many('SELECT hotel_id FROM user_hotels WHERE user_id = $1 ORDER BY created_at', [userId])).map((r) => r.hotel_id);
}

export async function countFollowedHotels(userId) {
  return (await one('SELECT count(*)::int AS n FROM user_hotels WHERE user_id = $1', [userId])).n;
}

// ------------------------------------------------------------------ plan periods
/**
 * Plans active now, one row per plan. Purchases are chained back to back (see grantPeriod), so the
 * access ends at the latest end date among that plan's current and future periods.
 */
export async function activePlans(userId) {
  return (await many(
    `SELECT plan, min(starts_at) AS starts_at, max(ends_at) AS ends_at
     FROM plan_periods WHERE user_id = $1 AND ends_at > now()
     GROUP BY plan HAVING min(starts_at) <= now()`,
    [userId],
  )).map((r) => ({ plan: r.plan, startsAt: r.starts_at, endsAt: r.ends_at }));
}

/** Adds `days` of `plan`, starting when the current access to that plan ends (or now). Runs inside a transaction. */
export async function grantPeriod(client, { userId, plan, days, paymentId = null }) {
  const { rows } = await client.query(
    `INSERT INTO plan_periods (user_id, plan, starts_at, ends_at, payment_id)
     SELECT $1, $2, s.start, s.start + make_interval(days => $3), $4
     FROM (SELECT GREATEST(now(), COALESCE((SELECT max(ends_at) FROM plan_periods WHERE user_id = $1 AND plan = $2), now())) AS start) s
     RETURNING plan, starts_at, ends_at`,
    [userId, plan, days, paymentId],
  );
  return { plan: rows[0].plan, startsAt: rows[0].starts_at, endsAt: rows[0].ends_at };
}
