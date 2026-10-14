// Request-level auth: reads the session cookie, enforces the route policy below, and blocks
// cross-site form posts (CSRF). Mounted on /api before every router.
import { config } from '../../shared/config/env.js';
import { AppError } from '../../shared/errors/AppError.js';
import { userForSession } from '../../data/accounts.js';
import { accessFor, canUseHotel, meets } from './access.js';

export const SESSION_COOKIE = 'rip_session';

// ------------------------------------------------------------------ cookies
export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

function isHttps(req) {
  if (config.auth.cookieSecure === 'true') return true;
  if (config.auth.cookieSecure === 'false') return false;
  const proto = String(req.get('cloudfront-forwarded-proto') || req.get('x-forwarded-proto') || '').split(',')[0].trim();
  return req.secure || proto === 'https';
}

export function setSessionCookie(req, res, token) {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${config.auth.sessionDays * 86400}`];
  if (isHttps(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req, res) {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isHttps(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

// ------------------------------------------------------------------ session
/** Attaches req.user and req.access (both null when signed out). Never throws for a bad cookie. */
export async function loadSession(req, res, next) {
  try {
    req.sessionToken = readCookie(req, SESSION_COOKIE);
    req.user = req.sessionToken ? await userForSession(req.sessionToken, config.auth.sessionDays) : null;
    req.access = await accessFor(req.user);
    next();
  } catch (err) {
    next(err);
  }
}

// ------------------------------------------------------------------ CSRF
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
/**
 * The session cookie is SameSite=Lax; on top of that every state-changing call must carry a header
 * that an HTML form on another site cannot send. The app's fetch client always sends it.
 */
export function requireAppHeader(req, res, next) {
  if (SAFE.has(req.method) || req.path === '/billing/webhook') return next();
  const ok = req.get('x-requested-with') === 'fetch' || /^application\/json/i.test(req.get('content-type') ?? '');
  return ok ? next() : next(AppError.forbidden('Request blocked (missing X-Requested-With header).'));
}

// ------------------------------------------------------------------ route policy
// First match wins. level: public | user | pro | destination | admin.
// hotel: the :id segment is a hotel; GET needs it followed (or a paid plan), changes need it followed.
const HOTEL = /^\/businesses\/([^/]+)/;
export const POLICY = [
  { methods: ['GET'], path: /^\/health$/, level: 'public' },
  { path: /^\/auth(\/|$)/, level: 'public' },
  { methods: ['GET'], path: /^\/billing\/plans$/, level: 'public' },
  { methods: ['POST'], path: /^\/billing\/webhook$/, level: 'public' },
  { path: /^\/billing(\/|$)/, level: 'user' },
  // Live coverage numbers on the homepage.
  { methods: ['GET'], path: /^\/cities$/, level: 'public' },
  // Tourism-board features.
  { path: /^\/cities\/[^/]+\/destination(\/|$)/, level: 'destination' },
  { methods: ['GET'], path: /^\/cities\/[^/]+$/, level: 'user' },
  { path: /^\/cities(\/|$)/, level: 'destination' }, // add, reseed, pause a city
  { methods: ['GET'], path: /^\/queue$/, level: 'user' },
  { methods: ['GET'], path: /^\/jobs\/[^/]+$/, level: 'user' },
  // Finding and adding hotels (the free plan's hotel limit is checked when adding).
  { path: /^\/search$/, level: 'user' },
  { methods: ['GET'], path: /^\/hotels\/lookup$/, level: 'user' },
  { path: /^\/businesses$/, level: 'user' },
  // Hotel Pro: benchmark, competitors, trends, AI summaries, change log, neighbourhood re-collection.
  { path: /^\/businesses\/[^/]+\/(benchmark|trends|summary|analyse|events|competitors|pipeline|reseed)(\/|$)/, level: 'pro', hotel: true },
  // Overview, reviews, refresh, history, listing fixes.
  { path: /^\/businesses\/[^/]+(\/|$)/, level: 'user', hotel: true },
];

const PLAN_TEXT = {
  pro: 'Benchmarks, competitors, trends and AI summaries are part of Hotel Pro.',
  destination: 'Destination dashboards and city seeding are part of the Destination plan.',
  admin: 'Only administrators can do this.',
};

export function ruleFor(method, path) {
  return POLICY.find((r) => (!r.methods || r.methods.includes(method)) && r.path.test(path)) ?? { level: 'user' };
}

/** Enforces POLICY. With AUTH_REQUIRED=false (tests, local experiments) everything stays open. */
export function enforcePolicy(req, res, next) {
  if (!config.auth.required) return next();
  const rule = ruleFor(req.method, req.path);
  if (rule.level === 'public') return next();
  if (!req.user) return next(AppError.unauthorized());
  if (!meets(req.access, rule.level)) {
    return next(rule.level === 'admin' ? AppError.forbidden(PLAN_TEXT.admin) : AppError.planRequired(rule.level, PLAN_TEXT[rule.level]));
  }
  if (!rule.hotel) return next();
  const hotelId = decodeURIComponent(req.path.match(HOTEL)[1]);
  return canUseHotel(req.user, req.access, hotelId, req.method)
    .then((ok) => next(ok ? undefined : AppError.forbidden('This hotel is not in your account. Add it from “Check in your hotel” first.')))
    .catch(next);
}
