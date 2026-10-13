import { googleMaps } from './googleMaps.js';
import { agoda } from './agoda.js';
import { booking } from './booking.js';
import { makemytrip } from './makemytrip.js';
import { tripadvisor } from './tripadvisor.js';

/**
 * Registry. Order matters: Google Maps is the anchor (identifies the property); Agoda runs
 * before Booking.com because Booking.com reviews are read through Agoda's review API.
 */
export const ADAPTERS = Object.freeze({ google_maps: googleMaps, agoda, booking, makemytrip, tripadvisor });

export const OTA_ORDER = Object.freeze(['agoda', 'booking', 'makemytrip', 'tripadvisor']);

export function getAdapter(platform) {
  const a = ADAPTERS[platform];
  if (!a) throw new Error(`Unknown platform: ${platform}`);
  return a;
}
