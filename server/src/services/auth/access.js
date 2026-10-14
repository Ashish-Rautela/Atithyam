// What an account may do: its tier (free / pro / destination / admin) and the hotel limit.
import { config } from '../../shared/config/env.js';
import { activePlans, countFollowedHotels, followsHotel } from '../../data/accounts.js';

export const RANK = Object.freeze({ free: 0, pro: 1, destination: 2, admin: 3 });

/** Access summary for a signed-in user (null when signed out). */
export async function accessFor(user) {
  if (!user) return null;
  const plans = await activePlans(user.userId);
  let tier = 'free';
  if (plans.some((p) => p.plan === 'destination')) tier = 'destination';
  else if (plans.some((p) => p.plan === 'pro')) tier = 'pro';
  if (user.role === 'admin') tier = 'admin';
  return {
    tier,
    plans,
    hotelLimit: tier === 'free' ? config.auth.freeHotelLimit : null, // null = unlimited
  };
}

/** needed: 'user' (any signed-in account) or a tier name. */
export const meets = (access, needed) => Boolean(access) && (needed === 'user' || RANK[access.tier] >= RANK[needed]);

/** May this account see (GET) or change (other methods) this hotel? */
export async function canUseHotel(user, access, hotelId, method) {
  if (!user) return false;
  if (access.tier === 'admin') return true;
  if (await followsHotel(user.userId, hotelId)) return true;
  // Paid accounts may look at any hotel (e.g. a competitor), but only change their own.
  return method === 'GET' && RANK[access.tier] >= RANK.pro;
}

/** Throws-free check used before adding a hotel. */
export async function hotelSlotsLeft(user, access) {
  if (access.hotelLimit === null) return Infinity;
  return Math.max(0, access.hotelLimit - (await countFollowedHotels(user.userId)));
}
