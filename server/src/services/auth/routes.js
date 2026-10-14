import { Router } from 'express';
import { asyncRoute } from '../../shared/errors/errorHandler.js';
import { validateBody } from '../../shared/validation/validate.js';
import { AppError } from '../../shared/errors/AppError.js';
import { config } from '../../shared/config/env.js';
import * as accounts from '../../data/accounts.js';
import { hashPassword, verifyPassword, dummyVerify, PASSWORD_MIN, PASSWORD_MAX } from './password.js';
import { accessFor } from './access.js';
import { setSessionCookie, clearSessionCookie } from './middleware.js';
import { rateLimiter, clientIp } from './rateLimit.js';

const email = { type: 'string', minLength: 5, maxLength: 254, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' };
const password = { type: 'string', minLength: PASSWORD_MIN, maxLength: PASSWORD_MAX };

const registerSchema = {
  type: 'object',
  required: ['name', 'email', 'password'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 100 },
    email,
    password,
    organisation: { type: 'string', maxLength: 160 },
  },
};
const loginSchema = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: { email: { type: 'string', maxLength: 254 }, password: { type: 'string', maxLength: PASSWORD_MAX } },
};
const passwordSchema = {
  type: 'object',
  required: ['currentPassword', 'newPassword'],
  additionalProperties: false,
  properties: { currentPassword: { type: 'string', maxLength: PASSWORD_MAX }, newPassword: password },
};
const profileSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { name: { type: 'string', minLength: 2, maxLength: 100 }, organisation: { type: 'string', maxLength: 160 } },
};

const isAdminEmail = (e) => config.auth.adminEmails.includes(String(e).trim().toLowerCase());

/** What the client needs about the signed-in account. */
export async function accountView(user, access) {
  if (!user) return { user: null, access: null };
  const hotels = await accounts.followedHotelIds(user.userId);
  return {
    user: { userId: user.userId, name: user.name, email: user.email, organisation: user.organisation, role: user.role, createdAt: user.createdAt },
    access: { ...(access ?? (await accessFor(user))), hotelsUsed: hotels.length, hotelIds: hotels },
  };
}

async function startSession(req, res, user) {
  const token = await accounts.createSession(user.userId, { days: config.auth.sessionDays, userAgent: req.get('user-agent'), ip: clientIp(req) });
  setSessionCookie(req, res, token);
}

// 10 sign-in attempts per 15 minutes per address+email, 20 sign-ups per hour per address.
const loginLimit = rateLimiter({ windowMs: 15 * 60_000, max: 10, key: (req) => `${clientIp(req)}|${String(req.body?.email ?? '').toLowerCase()}` });
const registerLimit = rateLimiter({ windowMs: 60 * 60_000, max: 20, key: clientIp });

export function authRoutes() {
  const r = Router();

  r.get('/auth/me', asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ...(await accountView(req.user, req.access)), signupOpen: config.auth.allowSignup, authRequired: config.auth.required });
  }));

  r.post('/auth/register', registerLimit, validateBody(registerSchema), asyncRoute(async (req, res) => {
    if (!config.auth.allowSignup) throw AppError.forbidden('New sign-ups are closed. Ask an administrator for an account.');
    const passwordHash = await hashPassword(req.body.password);
    const user = await accounts.createUser({
      email: req.body.email, name: req.body.name, organisation: req.body.organisation, passwordHash,
      role: isAdminEmail(req.body.email) ? 'admin' : 'user',
    });
    if (!user) throw AppError.conflict('An account with this email already exists. Sign in instead.');
    await startSession(req, res, user);
    const marked = await accounts.markLogin(user.userId);
    res.status(201).json(await accountView(marked));
  }));

  r.post('/auth/login', loginLimit, validateBody(loginSchema), asyncRoute(async (req, res) => {
    const found = await accounts.findUserForLogin(req.body.email);
    const ok = found ? await verifyPassword(req.body.password, found.passwordHash) : await dummyVerify(req.body.password);
    if (!ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is not correct.');
    await startSession(req, res, found);
    const user = await accounts.markLogin(found.userId, isAdminEmail(found.email) ? 'admin' : undefined);
    res.json(await accountView(user));
  }));

  r.post('/auth/logout', asyncRoute(async (req, res) => {
    await accounts.deleteSession(req.sessionToken);
    clearSessionCookie(req, res);
    res.status(204).end();
  }));

  r.patch('/auth/profile', validateBody(profileSchema), asyncRoute(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const user = await accounts.updateProfile(req.user.userId, req.body);
    res.json(await accountView(user, req.access));
  }));

  r.post('/auth/password', loginLimit, validateBody(passwordSchema), asyncRoute(async (req, res) => {
    if (!req.user) throw AppError.unauthorized();
    const me = await accounts.getUserWithHash(req.user.userId);
    if (!(await verifyPassword(req.body.currentPassword, me.passwordHash))) {
      throw new AppError(400, 'INVALID_CREDENTIALS', 'Your current password is not correct.');
    }
    await accounts.setPasswordHash(me.userId, await hashPassword(req.body.newPassword));
    await accounts.deleteOtherSessions(me.userId, req.sessionToken); // sign out other devices
    res.status(204).end();
  }));

  return r;
}
