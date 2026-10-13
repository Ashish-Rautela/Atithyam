export const PLATFORM_LABELS = {
  google_maps: 'Google Maps',
  agoda: 'Agoda',
  booking: 'Booking.com',
  makemytrip: 'MakeMyTrip',
  tripadvisor: 'Tripadvisor',
};

export const PLATFORM_ORDER = ['google_maps', 'makemytrip', 'booking', 'agoda', 'tripadvisor'];

export const STATUS_INFO = {
  PENDING: { label: 'Waiting', tone: 'muted' },
  RUNNING: { label: 'Running', tone: 'info' },
  SUCCESS: { label: 'Collected', tone: 'good' },
  SUCCESS_NO_REVIEWS: { label: 'No reviews', tone: 'good' },
  NEEDS_CONFIRMATION: { label: 'Check match', tone: 'warn' },
  NOT_FOUND: { label: 'Not found', tone: 'warn' },
  BLOCKED: { label: 'Blocked', tone: 'bad' },
  LAYOUT_CHANGED: { label: 'Page changed', tone: 'bad' },
  TIMEOUT: { label: 'Timed out', tone: 'bad' },
  NETWORK_ERROR: { label: 'Network error', tone: 'bad' },
  FAILED: { label: 'Failed', tone: 'bad' },
  DISABLED: { label: 'Disabled', tone: 'muted' },
};

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-IN');

export const formatInr = (v) => (Number.isFinite(v) ? inr.format(v) : '–');
export const formatNumber = (v) => (Number.isFinite(v) ? num.format(v) : '–');

export function formatRating(rating) {
  if (!rating) return '–';
  return `${rating.value}/${rating.scaleMax}`;
}

export function formatDate(iso, precision) {
  if (!iso) return null;
  const d = new Date(iso);
  if (precision === 'month') return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const s = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return precision === 'approximate' ? `≈ ${s}` : s;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** "in 12 d" / "3 d ago" for a future or past date. */
export function relativeTime(iso) {
  if (!iso) return '';
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (s <= 0) return timeAgo(iso);
  if (s < 3600) return `in ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `in ${Math.round(s / 3600)} h`;
  return `in ${Math.round(s / 86400)} d`;
}

export const PROFILE_STATUS = {
  none: { label: 'Not collected yet', tone: 'muted' },
  complete: { label: 'Collected', tone: 'good' },
  partial: { label: 'Partly collected', tone: 'warn' },
  failed: { label: 'Collection failed', tone: 'bad' },
};

export const JOB_STATUS = {
  queued: { label: 'Queued', tone: 'muted' },
  running: { label: 'Running', tone: 'info' },
  completed: { label: 'Done', tone: 'good' },
  failed: { label: 'Failed', tone: 'bad' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

export const JOB_KIND = {
  profile: 'Collect hotel',
  discover_area: 'Find nearby hotels',
  seed_city: 'Seed city',
};

/** Data freshness of a hotel: "Collected 3 d ago · refresh in 12 d". */
export function freshnessText({ profileStatus, lastProfiledAt, nextRefreshAt }) {
  if (!lastProfiledAt || profileStatus === 'none') return 'Not collected yet';
  return `Collected ${timeAgo(lastProfiledAt)}${nextRefreshAt ? ` · refresh ${relativeTime(nextRefreshAt)}` : ''}`;
}

export const ASPECTS = [
  { key: 'food', label: 'Food' },
  { key: 'room', label: 'Room' },
  { key: 'housekeeping', label: 'Housekeeping' },
  { key: 'staff', label: 'Staff' },
  { key: 'location', label: 'Location' },
  { key: 'value', label: 'Value for Money' },
  { key: 'cleanliness', label: 'Cleanliness' },
  { key: 'booking', label: 'Booking Experience' },
];
export const ASPECT_LABEL = Object.fromEntries(ASPECTS.map((a) => [a.key, a.label]));

/** Aspect position badges: icon + word, never colour alone. */
export const POSITION = {
  lead: { label: 'Leads market', icon: '▲', tone: 'good' },
  lag: { label: 'Behind market', icon: '▼', tone: 'bad' },
  par: { label: 'On par', icon: '●', tone: 'muted' },
  insufficient: { label: 'Few mentions', icon: '○', tone: 'muted' },
};

export const ISSUE_KIND = {
  property_specific: { label: 'Your problem', tone: 'bad', hint: 'You get this complaint much more often than competitors' },
  market_wide: { label: 'Market-wide', tone: 'warn', hint: 'Most competitors get this complaint too' },
  your_strength: { label: 'Your strength', tone: 'good', hint: 'Guests praise you for this more than competitors' },
  normal: { label: '—', tone: 'muted', hint: '' },
};

export const pct = (v, digits = 0) => (Number.isFinite(v) ? `${(v * 100).toFixed(digits)}%` : '–');

export const monthLabel = (iso) => new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
