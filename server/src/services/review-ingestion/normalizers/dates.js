const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10,
  november: 10, dec: 11, december: 11,
};

const UNIT_MS = {
  minute: 60e3, hour: 3600e3, day: 86400e3, week: 7 * 86400e3,
};

/**
 * Parse the many date formats platforms show into { iso, precision } where precision is
 * 'datetime' | 'day' | 'month' | 'approximate'. Returns { iso: null, precision: null } when unknown.
 * `now` is injectable for tests.
 *
 * Examples: "2026-03-29T10:11:29+07:00", "March 29, 2026", "Oct 2026", "October 2026",
 * "2 months ago", "a year ago", "Yesterday", "Edited 3 weeks ago", "4 years ago on Google".
 */
export function parseReviewDate(input, now = new Date()) {
  const none = { iso: null, precision: null, raw: input ?? null };
  if (!input) return none;
  const text = String(input).trim();
  const lower = text.toLowerCase().replace(/^edited\s+/, '');

  // ISO timestamp
  if (/^\d{4}-\d{2}-\d{2}t/i.test(text)) {
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? none : { iso: d.toISOString(), precision: 'datetime', raw: text };
  }

  if (/^(today|just now)/.test(lower)) return approx(now, 'day', text);
  if (/^yesterday/.test(lower)) return approx(new Date(now.getTime() - UNIT_MS.day), 'day', text);

  // Relative: "2 months ago", "a year ago", "an hour ago"
  const rel = lower.match(/\b(a|an|\d+)\s+(minute|hour|day|week|month|year)s?\s+ago\b/);
  if (rel) {
    const n = rel[1] === 'a' || rel[1] === 'an' ? 1 : Number.parseInt(rel[1], 10);
    const unit = rel[2];
    const d = new Date(now);
    if (unit === 'month') d.setMonth(d.getMonth() - n);
    else if (unit === 'year') d.setFullYear(d.getFullYear() - n);
    else d.setTime(d.getTime() - n * UNIT_MS[unit]);
    return approx(d, 'approximate', text);
  }

  // "March 29, 2026" / "29 March 2026"
  let m = lower.match(/\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (m && m[1] in MONTHS) return ymd(Number(m[3]), MONTHS[m[1]], Number(m[2]), text);
  m = lower.match(/\b(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (m && m[2] in MONTHS) return ymd(Number(m[3]), MONTHS[m[2]], Number(m[1]), text);

  // "Oct 2026" / "October 2026"
  m = lower.match(/\b([a-z]{3,9})\.?\s+(\d{4})\b/);
  if (m && m[1] in MONTHS) {
    const d = new Date(Date.UTC(Number(m[2]), MONTHS[m[1]], 1));
    return { iso: d.toISOString(), precision: 'month', raw: text };
  }

  return none;
}

function approx(date, precision, raw) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return { iso: d.toISOString(), precision, raw };
}

function ymd(y, mo, day, raw) {
  const d = new Date(Date.UTC(y, mo, day));
  return Number.isNaN(d.getTime()) ? { iso: null, precision: null, raw } : { iso: d.toISOString(), precision: 'day', raw };
}
