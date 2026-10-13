import { createHash } from 'node:crypto';

/** Hex sha256 of the joined parts, truncated (default 32 chars). */
export function hashParts(parts, length = 32) {
  const h = createHash('sha256');
  h.update(parts.map((p) => (p === null || p === undefined ? '' : String(p))).join('\u001f'));
  return h.digest('hex').slice(0, length);
}
