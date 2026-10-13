import { getStore, TABLES } from '../../shared/data/store.js';
import { keys } from '../../shared/data/keys.js';

/* --------------------------------- businesses --------------------------------- */

export async function saveBusiness(business) {
  const store = getStore();
  await store.put(TABLES.core, { ...keys.business(business.bizId), type: 'business', ...business });
  // Competitors are not listed on the home page; they live under their target's compset.
  if (business.role !== 'competitor') {
    await store.put(TABLES.core, { ...keys.bizIndex(business.createdAt, business.bizId), type: 'bizIndex', bizId: business.bizId, name: business.name, location: business.location });
  }
  if (business.placeId) {
    await store.put(TABLES.core, { ...keys.place(business.placeId), type: 'place', bizId: business.bizId });
  }
}

export async function getBizIdByPlace(placeId) {
  const row = await getStore().get(TABLES.core, keys.place(placeId).PK, 'META');
  return row?.bizId ?? null;
}

/* ---------------------------------- compsets ---------------------------------- */

export async function getCompset(bizId) {
  return strip(await getStore().get(TABLES.core, keys.compset(bizId).PK, 'COMPSET'));
}

export async function saveCompset(compset) {
  await getStore().put(TABLES.core, { ...keys.compset(compset.bizId), type: 'compset', ...compset, updatedAt: new Date().toISOString() });
}

export async function getBusiness(bizId) {
  return strip(await getStore().get(TABLES.core, keys.business(bizId).PK, 'META'));
}

export async function listBusinesses(limit = 50) {
  const rows = await getStore().query(TABLES.core, 'BIZ_INDEX', { descending: true, limit });
  const items = await Promise.all(rows.map((r) => getBusiness(r.bizId)));
  return items.filter(Boolean);
}

/* ---------------------------------- listings ---------------------------------- */

export async function saveListingState(bizId, platform, state) {
  await getStore().put(TABLES.core, { ...keys.listing(bizId, platform), type: 'listing', bizId, platform, ...state, updatedAt: new Date().toISOString() });
}

export async function getListingStates(bizId) {
  const rows = await getStore().query(TABLES.core, keys.business(bizId).PK, { skPrefix: keys.listingPrefix });
  return rows.map(strip);
}

/* ------------------------------------ jobs ------------------------------------ */

export async function saveJob(job) {
  const store = getStore();
  await store.put(TABLES.core, { ...keys.job(job.jobId), type: 'job', ...job });
}

export async function indexJob(job) {
  await getStore().put(TABLES.core, { ...keys.bizJob(job.bizId, job.createdAt, job.jobId), type: 'bizJob', jobId: job.jobId });
}

export async function getJob(jobId) {
  return strip(await getStore().get(TABLES.core, keys.job(jobId).PK, 'META'));
}

export async function getLatestJob(bizId) {
  const [row] = await getStore().query(TABLES.core, keys.business(bizId).PK, { skPrefix: keys.bizJobPrefix, descending: true, limit: 1 });
  return row ? getJob(row.jobId) : null;
}

/* ----------------------------------- reviews ----------------------------------- */

/**
 * Idempotent upsert. Same reviewId + same contentHash = unchanged; same reviewId with a
 * different contentHash = updated (edited at source); new reviewId = inserted.
 */
export async function upsertReviews(bizId, platform, reviews) {
  const store = getStore();
  const existing = await store.query(TABLES.reviews, keys.reviewPartition(bizId, platform), { skPrefix: keys.reviewPrefix });
  const byId = new Map(existing.map((r) => [r.reviewId, r]));
  const counts = { inserted: 0, updated: 0, unchanged: 0 };
  const toWrite = [];
  const now = new Date().toISOString();
  for (const r of reviews) {
    const prev = byId.get(r.reviewId);
    if (!prev) {
      counts.inserted++;
      toWrite.push({ ...keys.review(bizId, platform, r.reviewId), ...r, firstSeenAt: now, revision: 1 });
    } else if (prev.contentHash !== r.contentHash) {
      counts.updated++;
      toWrite.push({ ...keys.review(bizId, platform, r.reviewId), ...r, firstSeenAt: prev.firstSeenAt ?? now, revision: (prev.revision ?? 1) + 1 });
    } else {
      counts.unchanged++;
    }
    byId.set(r.reviewId, r);
  }
  if (toWrite.length) await store.putMany(TABLES.reviews, toWrite);
  return { ...counts, totalStored: byId.size };
}

export async function getReviews(bizId, platforms) {
  const store = getStore();
  const all = await Promise.all(
    platforms.map((p) => store.query(TABLES.reviews, keys.reviewPartition(bizId, p), { skPrefix: keys.reviewPrefix })),
  );
  return all.flat().map(strip);
}

function strip(item) {
  if (!item) return null;
  const { PK, SK, type, ...rest } = item;
  return rest;
}
