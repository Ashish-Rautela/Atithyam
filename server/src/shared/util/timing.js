export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Random integer in [min, max]. */
export function jitter(min, max) {
  return Math.floor(min + Math.random() * Math.max(0, max - min));
}

/** Run async tasks with a concurrency limit, preserving input order in the results. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
