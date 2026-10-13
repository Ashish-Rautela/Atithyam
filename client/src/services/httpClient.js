/** Error carrying the API's problem response (type, title, status, correlationId). */
export class ApiError extends Error {
  constructor(problem, status) {
    super(problem?.title || `Request failed (${status})`);
    this.status = status;
    this.type = problem?.type;
    this.detail = problem?.detail;
    this.correlationId = problem?.correlationId;
  }
}

const API_BASE = (import.meta.env?.VITE_API_URL || '').replace(/\/+$/, '');

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError({ title: 'Cannot reach the API. Is the server running on port 4000?' }, 0);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(data, res.status);
  return data;
}

const peerQs = (p = {}) => new URLSearchParams({ peers: p.peers ?? 'compset', radiusKm: String(p.radiusKm ?? 3) }).toString();

export const api = {
  health: () => request('GET', '/health'),
  search: (name, location) => request('POST', '/search', { name, location }),
  lookup: (name, location) => request('GET', `/hotels/lookup?${new URLSearchParams({ name, ...(location ? { location } : {}) })}`),
  listBusinesses: () => request('GET', '/businesses'),
  reseedBusiness: (bizId) => request('POST', `/businesses/${bizId}/reseed`, {}),
  listCities: () => request('GET', '/cities'),
  addCities: (payload) => request('POST', '/cities', payload),
  getCity: (cityId, clusterId) => request('GET', `/cities/${cityId}${clusterId ? `?cluster=${clusterId}` : ''}`),
  reseedCity: (cityId, payload) => request('POST', `/cities/${cityId}/reseed`, payload),
  pauseCity: (cityId) => request('POST', `/cities/${cityId}/pause`, {}),
  getQueue: () => request('GET', '/queue'),
  getPipeline: (bizId, peers) => request('GET', `/businesses/${bizId}/pipeline?${peerQs(peers)}`),
  getBenchmark: (bizId, peers) => request('GET', `/businesses/${bizId}/benchmark?${peerQs(peers)}`),
  getTrends: (bizId, measure, peers) => request('GET', `/businesses/${bizId}/trends?measure=${measure}&${peerQs(peers)}`),
  getSummary: (bizId, peers, refresh) => request(refresh ? 'POST' : 'GET', `/businesses/${bizId}/summary?${peerQs(peers)}`),
  analyseNow: (bizId, peers, upgrade) => request('POST', `/businesses/${bizId}/analyse?${peerQs(peers)}`, { upgrade: Boolean(upgrade) }),
  addEvent: (bizId, payload) => request('POST', `/businesses/${bizId}/events`, payload),
  deleteEvent: (bizId, id) => request('DELETE', `/businesses/${bizId}/events/${id}`),
  getDestination: (cityId, clusterId) => request('GET', `/cities/${cityId}/destination${clusterId ? `?cluster=${clusterId}` : ''}`),
  getDestinationSummary: (cityId, clusterId, refresh) => request(refresh ? 'POST' : 'GET', `/cities/${cityId}/destination/summary${clusterId ? `?cluster=${clusterId}` : ''}`),
  createBusiness: (payload) => request('POST', '/businesses', payload),
  getBusiness: (bizId) => request('GET', `/businesses/${bizId}`),
  refresh: (bizId, payload = {}) => request('POST', `/businesses/${bizId}/refresh`, payload),
  selectListing: (bizId, platform, url) => request('POST', `/businesses/${bizId}/listings/${platform}/select`, { url }),
  getJob: (jobId) => request('GET', `/jobs/${jobId}`),
  getCompetitors: (bizId) => request('GET', `/businesses/${bizId}/competitors`),
  discoverCompetitors: (bizId, payload) => request('POST', `/businesses/${bizId}/competitors/discover`, payload),
  saveCompetitorSelection: (bizId, placeIds) => request('PUT', `/businesses/${bizId}/competitors/selection`, { placeIds }),
  collectCompetitors: (bizId, payload) => request('POST', `/businesses/${bizId}/competitors/collect`, payload),
  getReviews: (bizId, params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null));
    return request('GET', `/businesses/${bizId}/reviews?${qs}`);
  },
};
