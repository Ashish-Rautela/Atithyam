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

/** Fired on window when the API says the session ended (401) or a paid plan is needed (402). */
export const AUTH_EVENT = 'rip:auth-required';
export const PLAN_EVENT = 'rip:plan-required';

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      // The header proves the call comes from this app (the server rejects state changes without it).
      headers: { 'x-requested-with': 'fetch', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError({ title: 'Cannot reach the server. Check your connection and try again.' }, 0);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { title: `Unexpected response from the server (${res.status}).` };
  }
  if (!res.ok) {
    const err = new ApiError(data, res.status);
    if (res.status === 401 && err.type === 'AUTH_REQUIRED') window.dispatchEvent(new CustomEvent(AUTH_EVENT));
    // Actions (not page loads) that need a plan open the upgrade dialog; pages show their own card.
    if (res.status === 402 && method !== 'GET') window.dispatchEvent(new CustomEvent(PLAN_EVENT, { detail: { requiredPlan: err.detail?.requiredPlan, message: err.message } }));
    throw err;
  }
  return data;
}

const peerQs = (p = {}) => new URLSearchParams({ peers: p.peers ?? 'compset', radiusKm: String(p.radiusKm ?? 3) }).toString();

export const api = {
  health: () => request('GET', '/health'),
  // accounts
  me: () => request('GET', '/auth/me'),
  login: (payload) => request('POST', '/auth/login', payload),
  register: (payload) => request('POST', '/auth/register', payload),
  logout: () => request('POST', '/auth/logout', {}),
  updateProfile: (payload) => request('PATCH', '/auth/profile', payload),
  changePassword: (payload) => request('POST', '/auth/password', payload),
  // payments (Razorpay)
  plans: () => request('GET', '/billing/plans'),
  startCheckout: (plan) => request('POST', '/billing/checkout', { plan }),
  verifyPayment: (payload) => request('POST', '/billing/verify', payload),
  reportPaymentFailure: (payload) => request('POST', '/billing/failed', payload),
  payments: () => request('GET', '/billing/payments'),
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
