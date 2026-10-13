import { useQuery } from '@tanstack/react-query';
import { api } from '../../../services/httpClient.js';

/**
 * Live coverage from the platform database (seeded towns and their hotels, reviews and
 * micro-markets). Quietly reports `ok: false` when the API is not running, so the homepage falls
 * back to clearly labelled illustrative figures.
 */
export function useLiveCoverage() {
  const q = useQuery({ queryKey: ['home-coverage'], queryFn: api.listCities, retry: false, staleTime: 60_000, refetchOnWindowFocus: false });
  const items = q.data?.items ?? [];
  const byName = new Map();
  const totals = { destinations: 0, hotels: 0, reviews: 0, clusters: 0, profiled: 0 };
  for (const c of items) {
    const s = c.stats ?? {};
    byName.set(String(c.name ?? '').toLowerCase(), c);
    if (c.displayName) byName.set(String(c.displayName).toLowerCase(), c);
    totals.destinations += 1;
    totals.hotels += Number(s.hotels) || 0;
    totals.reviews += Number(s.reviews) || 0;
    totals.clusters += Number(s.clusters) || 0;
    totals.profiled += Number(s.profiled) || 0;
  }
  return { ok: q.isSuccess && items.length > 0, loading: q.isLoading, totals, byName, items };
}
