/**
 * Illustrative data for the homepage. Every hotel name here is fictional and every number is made
 * up to demonstrate the product — nothing on the homepage is a real measurement. The live product
 * pages (/search, /business/:id/benchmark, /seeding) show real collected data.
 *
 * Kept in one place so the homepage can later be pointed at a real API without touching components.
 */

export const DEMO_NOTE = 'Illustrative demo data · fictional hotels';

export const DEMO_HOTEL = {
  name: 'Deodar Heights',
  location: 'Mall Road, Mussoorie',
  rating: 4.4,
  reviews: 1284,
  period: 'Last 6 months',
  platforms: ['Google', 'Booking.com', 'MakeMyTrip', 'Tripadvisor'],
  competitors: [
    { name: 'Deodar Heights', rating: 4.4, you: true },
    { name: 'Silver Oak Stay', rating: 4.2 },
    { name: 'Mistline Residency', rating: 4.5 },
    { name: 'Pine Hollow Hotel', rating: 3.9 },
    { name: 'Ridgecrest Inn', rating: 4.1 },
  ],
  snippets: {
    en: { label: 'English', text: 'Staff were incredibly helpful, but breakfast ran out early.' },
    hinglish: { label: 'Hinglish', text: 'Staff bahut helpful tha, par nashta jaldi khatam ho gaya.' },
    hi: { label: 'हिंदी', text: 'स्टाफ बहुत मददगार था, पर नाश्ता जल्दी खत्म हो गया।' },
  },
};

/** Sources the product collects today, and ones that are planned. */
export const PLATFORMS = [
  { name: 'Google Reviews', status: 'live', hue: '#4A79B5' },
  { name: 'Booking.com', status: 'live', hue: '#1D5746' },
  { name: 'Agoda', status: 'live', hue: '#8a5a1c' },
  { name: 'MakeMyTrip', status: 'live', hue: '#b0452f' },
  { name: 'Tripadvisor', status: 'live', hue: '#117F55' },
  { name: 'Airbnb', status: 'planned', hue: '#64746F' },
];

/** Section 2 — review snippets and the topics each one touches. */
export const TOPIC_NODES = [
  { id: 'clean', label: 'Cleanliness', x: 47, y: 30 },
  { id: 'staff', label: 'Staff', x: 54, y: 52 },
  { id: 'food', label: 'Food', x: 44, y: 70 },
  { id: 'parking', label: 'Parking', x: 58, y: 84 },
  { id: 'water', label: 'Hot water', x: 41, y: 48 },
  { id: 'location', label: 'Location', x: 58, y: 16 },
];

export const REVIEW_SNIPPETS = [
  { id: 'r1', lang: 'English', platform: 'Google', text: 'Amazing location, and the staff were incredibly helpful.', topics: [['location', 1], ['staff', 1]], pos: { x: 2, y: 4 }, from: 'left', tilt: -2 },
  { id: 'r2', lang: 'English', platform: 'Booking.com', text: 'Breakfast could be better. The parking situation was difficult.', topics: [['food', -1], ['parking', -1]], pos: { x: 70, y: 60 }, from: 'right', tilt: 1.5 },
  { id: 'r3', lang: 'Hinglish', platform: 'MakeMyTrip', text: 'Room saaf tha, but hot water ki problem thi.', topics: [['clean', 1], ['water', -1]], pos: { x: 69, y: 6 }, from: 'diag-tr', tilt: 2 },
  { id: 'r4', lang: 'हिंदी', platform: 'Google', text: 'कमरा साफ था, लेकिन गर्म पानी की समस्या थी।', topics: [['clean', 1], ['water', -1]], pos: { x: 4, y: 58 }, from: 'diag-bl', tilt: -1.5 },
];

export const LANGUAGE_CYCLE = [
  { code: 'en', label: 'English', text: 'The room was clean, but there was a hot-water problem.' },
  { code: 'hinglish', label: 'Hinglish', text: 'Room saaf tha, but hot water ki problem thi.' },
  { code: 'hi', label: 'हिंदी', text: 'कमरा साफ था, लेकिन गर्म पानी की समस्या थी।' },
];

/** Section 3 — the four stages of the pinned story. Scores are 0–100 sentiment (50 = as much praise as complaint). */
export const STORY_STAGES = [
  {
    id: 'food',
    topic: 'Food & breakfast',
    insight: 'Breakfast is an opportunity for improvement.',
    tone: 'attention',
    bars: [
      { label: 'Your hotel', value: 41, you: true },
      { label: 'Nearby median', value: 63 },
      { label: 'Best nearby', value: 78 },
    ],
    reviews: [
      { text: 'Breakfast was cold by 9 am and the buffet ran out early.', lang: 'English', platform: 'Booking.com', sentiment: -1 },
      { text: 'Nashta theek tha but options bahut kam the.', lang: 'Hinglish', platform: 'MakeMyTrip', sentiment: -1 },
      { text: 'Loved the view from the dining room.', lang: 'English', platform: 'Google', sentiment: 1 },
    ],
    recommendation: 'Keep hot breakfast running until 10:30 and add two regional dishes; watch breakfast mentions for six weeks.',
    quote: { text: 'Everything else was lovely — breakfast let it down.', source: 'Booking.com guest' },
    source: 'Google · Booking.com · MakeMyTrip — Apr–Sep (demo)',
    mentions: 214,
  },
  {
    id: 'clean',
    topic: 'Cleanliness',
    insight: 'Cleanliness is one of your strongest competitive advantages.',
    tone: 'advantage',
    bars: [
      { label: 'Your hotel', value: 86, you: true },
      { label: 'Nearby median', value: 71 },
      { label: 'Best nearby', value: 83 },
    ],
    reviews: [
      { text: 'Spotless rooms, fresh linen every day.', lang: 'English', platform: 'Google', sentiment: 1 },
      { text: 'Bathroom ekdum saaf tha.', lang: 'Hinglish', platform: 'MakeMyTrip', sentiment: 1 },
      { text: 'कमरा बहुत साफ और व्यवस्थित था।', lang: 'हिंदी', platform: 'Google', sentiment: 1 },
    ],
    recommendation: 'Say it out loud: lead with cleanliness in your listing photos and descriptions on every platform.',
    quote: { text: 'Cleanest hotel we stayed at in Mussoorie.', source: 'Google reviewer' },
    source: 'Google · MakeMyTrip · Tripadvisor — Apr–Sep (demo)',
    mentions: 388,
  },
  {
    id: 'staff',
    topic: 'Staff & service',
    insight: 'Guests mention your staff more positively than nearby hotels.',
    tone: 'advantage',
    bars: [
      { label: 'Your hotel', value: 88, you: true },
      { label: 'Nearby median', value: 74 },
      { label: 'Best nearby', value: 85 },
    ],
    reviews: [
      { text: 'The front desk arranged a cab at midnight for us.', lang: 'English', platform: 'Tripadvisor', sentiment: 1 },
      { text: 'Staff bahut polite aur helpful tha.', lang: 'Hinglish', platform: 'Google', sentiment: 1 },
      { text: 'Manager personally checked on our room heater.', lang: 'English', platform: 'Booking.com', sentiment: 1 },
    ],
    recommendation: 'Recognise the team by name in replies to reviews — it reinforces what guests already value.',
    quote: { text: 'Staff made the trip. Genuinely warm people.', source: 'Tripadvisor reviewer' },
    source: 'Google · Booking.com · Tripadvisor — Apr–Sep (demo)',
    mentions: 452,
  },
  {
    id: 'value',
    topic: 'Value for money',
    insight: 'Guests value the location, but some consider the pricing too high.',
    tone: 'attention',
    bars: [
      { label: 'Your hotel', value: 52, you: true },
      { label: 'Nearby median', value: 61 },
      { label: 'Best nearby', value: 72 },
    ],
    reviews: [
      { text: 'Great spot on Mall Road, but a bit pricey for the room size.', lang: 'English', platform: 'Booking.com', sentiment: -1 },
      { text: 'Location mast hai, rate thoda zyada laga.', lang: 'Hinglish', platform: 'MakeMyTrip', sentiment: -1 },
      { text: 'Worth it for the view alone.', lang: 'English', platform: 'Google', sentiment: 1 },
    ],
    recommendation: 'Bundle breakfast or a late checkout into weekday rates before cutting prices.',
    quote: { text: 'Perfect location — just wish it cost a little less.', source: 'MakeMyTrip guest' },
    source: 'Booking.com · MakeMyTrip · Google — Apr–Sep (demo)',
    mentions: 167,
  },
];

/** Section 4 — topic benchmark. Base scores; ranges shift them a little. */
const TOPIC_BASE = [
  { id: 'food', label: 'Food and dining', you: 47, peers: [64, 58, 71, 55], mentions: 214, quotes: ['Breakfast spread was limited for the price.', 'Dinner at the rooftop was excellent.'], rec: 'Extend hot breakfast service and rotate the menu weekly.' },
  { id: 'room', label: 'Rooms and comfort', you: 74, peers: [70, 76, 62, 68], mentions: 301, quotes: ['Beds were comfortable and the heater worked well.', 'Room was smaller than the photos suggested.'], rec: 'Update listing photos so room size matches expectations.' },
  { id: 'clean', label: 'Cleanliness', you: 86, peers: [72, 70, 79, 66], mentions: 388, quotes: ['Spotless rooms, fresh linen every day.', 'Bathroom ekdum saaf tha.'], rec: 'Lead with cleanliness in listing descriptions.' },
  { id: 'staff', label: 'Staff and service', you: 88, peers: [74, 77, 70, 72], mentions: 452, quotes: ['The front desk arranged a cab at midnight.', 'Staff bahut polite tha.'], rec: 'Name staff in review replies; keep what works.' },
  { id: 'location', label: 'Location', you: 90, peers: [86, 88, 81, 84], mentions: 410, quotes: ['Two minutes from Mall Road.', 'Valley view from the balcony was stunning.'], rec: 'Similar to competitors — location alone will not set you apart.' },
  { id: 'value', label: 'Value for money', you: 52, peers: [61, 66, 58, 63], mentions: 167, quotes: ['A bit pricey for the room size.', 'Rate thoda zyada laga.'], rec: 'Add value (breakfast, late checkout) before cutting rates.' },
  { id: 'housekeeping', label: 'Housekeeping', you: 79, peers: [75, 80, 71, 77], mentions: 126, quotes: ['Towels replaced promptly when asked.', 'Turndown service was a nice touch.'], rec: 'On par — keep response times visible to guests.' },
  { id: 'booking', label: 'Booking experience', you: 63, peers: [72, 70, 74, 69], mentions: 98, quotes: ['Check-in took 40 minutes on a Friday evening.', 'Advance payment refund was slow.'], rec: 'Pre-register weekend arrivals to shorten check-in.' },
];

export const PEER_NAMES = ['Silver Oak Stay', 'Mistline Residency', 'Pine Hollow Hotel', 'Ridgecrest Inn'];

export const RANGES = [
  { id: '30d', label: 'Last 30 days', shift: [-4, 3, 1, -2, 0, -3, 2, 4], scale: 0.18 },
  { id: '3m', label: 'Last 3 months', shift: [-2, 1, 0, 1, 1, -1, 0, 2], scale: 0.5 },
  { id: '6m', label: 'Last 6 months', shift: [0, 0, 0, 0, 0, 0, 0, 0], scale: 1 },
];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Topic rows for a reporting range, with status derived from the gap to the competitor median. */
export function topicsFor(rangeId) {
  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[2];
  return TOPIC_BASE.map((t, i) => {
    const you = Math.max(0, Math.min(100, t.you + range.shift[i]));
    const peers = t.peers.map((p, j) => Math.max(0, Math.min(100, p + ((i + j) % 3) - 1)));
    const med = Math.round(median(peers));
    const gap = you - med;
    const status = gap >= 7 ? 'advantage' : gap <= -7 ? 'attention' : 'similar';
    return { ...t, you, peers, median: med, gap, status, mentions: Math.round(t.mentions * range.scale) };
  });
}

export const STATUS_LABEL = {
  advantage: 'Competitive advantage',
  attention: 'Needs attention',
  similar: 'Similar to competitors',
};

/** Section 5 — early warnings. */
export const ALERTS = [
  {
    id: 'water',
    severity: 'high',
    title: '3 guests mentioned hot water problems this month.',
    topic: 'Rooms · Hot water',
    period: '1–28 Sep (demo)',
    count: 3,
    evidence: [
      { date: '24 Sep', platform: 'Google', text: 'No hot water in the morning, geyser not working.' },
      { date: '17 Sep', platform: 'MakeMyTrip', text: 'Garam pani nahi aaya dono din.' },
      { date: '9 Sep', platform: 'Booking.com', text: 'Had to wait 30 minutes for hot water.' },
    ],
    timeline: [0, 0, 0, 1, 0, 1, 1],
  },
  {
    id: 'breakfast',
    severity: 'medium',
    title: 'Breakfast complaints increased compared with the previous period.',
    topic: 'Food · Breakfast',
    period: 'Aug–Sep vs Jun–Jul (demo)',
    count: 11,
    evidence: [
      { date: '21 Sep', platform: 'Booking.com', text: 'Buffet ran out by 9:30.' },
      { date: '2 Sep', platform: 'Google', text: 'Same menu all four days.' },
      { date: '28 Aug', platform: 'MakeMyTrip', text: 'Nashta thanda tha.' },
    ],
    timeline: [1, 1, 2, 1, 2, 2, 2],
  },
  {
    id: 'food-up',
    severity: 'positive',
    title: 'Recent reviews show improvement in food quality.',
    topic: 'Food · Dinner',
    period: 'Sep vs Jul (demo)',
    count: 8,
    evidence: [
      { date: '26 Sep', platform: 'Tripadvisor', text: 'New dinner menu is excellent.' },
      { date: '19 Sep', platform: 'Google', text: 'Rajma chawal was just like home.' },
      { date: '12 Sep', platform: 'Booking.com', text: 'Much better food than last year.' },
    ],
    timeline: [0, 0, 1, 1, 2, 2, 2],
  },
];

export const SEVERITY = {
  high: { label: 'High', tone: 'bad' },
  medium: { label: 'Rising', tone: 'warn' },
  positive: { label: 'Improving', tone: 'good' },
};

/** Section 6 — destination-wide issues on a stylised Mussoorie map (positions in map units). */
export const DESTINATION_ISSUES = [
  { id: 'parking', label: 'Parking', x: 330, y: 205, complaints: 412, hotels: 38, reviews: 2140, trend: 'Rising since May', quotes: ['No parking anywhere near Mall Road.', 'Gaadi park karne mein ek ghanta laga.'] },
  { id: 'roads', label: 'Road conditions', x: 150, y: 300, complaints: 286, hotels: 31, reviews: 1710, trend: 'Peaks in the monsoon', quotes: ['The road up was badly broken after the rain.', 'Kempty road par bahut gaddhe the.'] },
  { id: 'power', label: 'Power cuts', x: 520, y: 150, complaints: 154, hotels: 19, reviews: 960, trend: 'Clusters in winter evenings', quotes: ['Two power cuts in one evening.', 'बिजली बार-बार जा रही थी।'] },
  { id: 'water', label: 'Water supply', x: 610, y: 265, complaints: 133, hotels: 17, reviews: 880, trend: 'Peaks in May–June', quotes: ['Water was rationed in the afternoon.', 'Pani ki supply kam thi.'] },
  { id: 'prices', label: 'High prices', x: 420, y: 320, complaints: 221, hotels: 44, reviews: 2380, trend: 'Peaks on long weekends', quotes: ['Everything costs double on weekends.', 'Taxi wale bahut zyada maang rahe the.'] },
];

/** Section 7 — breakfast sentiment by month around a menu change (index 6 = change introduced). */
export const IMPACT = {
  change: { index: 6, label: 'New breakfast menu introduced' },
  months: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
  score: [46, 44, 42, 45, 41, 43, 50, 58, 62, 64, 66, 65],
  volume: [18, 14, 21, 17, 15, 19, 22, 26, 31, 29, 33, 30],
  checkpoints: [
    { id: 'before', label: 'Before the change', range: [3, 5] },
    { id: 'change', label: 'Change introduced', range: [6, 6] },
    { id: 'm1', label: 'One month later', range: [7, 7] },
    { id: 'm3', label: 'Three months later', range: [7, 9] },
  ],
};

/** Section 8 — placeholders until real hotel partners share their words. */
export const TESTIMONIALS = [
  { id: 't1', text: 'A hotel owner’s words about the first problem this helped them fix will go here.', who: 'Placeholder — hotel owner', place: 'Hill-station property' },
  { id: 't2', text: 'A note from a general manager on how comparing with nearby hotels changed priorities.', who: 'Placeholder — general manager', place: 'Boutique stay' },
  { id: 't3', text: 'A tourism-board perspective on seeing town-wide visitor feedback in one place.', who: 'Placeholder — destination team', place: 'District tourism office' },
];

/* ======================================================================
   Region-wide data (homepage v2): the platform covers many hotels,
   micro-markets and destinations — not one property.
   ====================================================================== */

/**
 * Hill destinations across Uttarakhand with approximate coordinates (for a stylised map), the
 * region they sit in and an illustrative "what guests talk about" profile. Live hotel/review
 * counts replace the illustrative ones when the platform database has seeded that town.
 */
export const REGION_DESTINATIONS = [
  { id: 'mussoorie', name: 'Mussoorie', region: 'Garhwal', lat: 30.46, lng: 78.07, hotels: 212, reviews: 48200, praise: 'Views & location', complaint: 'Parking', kind: 'Hill station' },
  { id: 'dehradun', name: 'Dehradun', region: 'Garhwal', lat: 30.32, lng: 78.03, hotels: 340, reviews: 61500, praise: 'Staff', complaint: 'Noise', kind: 'City' },
  { id: 'rishikesh', name: 'Rishikesh', region: 'Garhwal', lat: 30.09, lng: 78.27, hotels: 286, reviews: 57900, praise: 'Location', complaint: 'Hot water', kind: 'Pilgrim & adventure' },
  { id: 'haridwar', name: 'Haridwar', region: 'Garhwal', lat: 29.95, lng: 78.16, hotels: 198, reviews: 39800, praise: 'Value for money', complaint: 'Cleanliness', kind: 'Pilgrim town' },
  { id: 'uttarkashi', name: 'Uttarkashi', region: 'Garhwal', lat: 30.73, lng: 78.44, hotels: 64, reviews: 6200, praise: 'Hospitality', complaint: 'Road access', kind: 'Char Dham route' },
  { id: 'auli', name: 'Auli', region: 'Garhwal', lat: 30.53, lng: 79.57, hotels: 38, reviews: 5400, praise: 'Views', complaint: 'Heating', kind: 'Ski slopes' },
  { id: 'chopta', name: 'Chopta', region: 'Garhwal', lat: 30.48, lng: 79.17, hotels: 26, reviews: 2900, praise: 'Food', complaint: 'Power cuts', kind: 'Trek base' },
  { id: 'lansdowne', name: 'Lansdowne', region: 'Garhwal', lat: 29.84, lng: 78.68, hotels: 41, reviews: 7100, praise: 'Quiet', complaint: 'Food options', kind: 'Cantonment town' },
  { id: 'nainital', name: 'Nainital', region: 'Kumaon', lat: 29.39, lng: 79.45, hotels: 254, reviews: 52700, praise: 'Lake views', complaint: 'Parking', kind: 'Lake town' },
  { id: 'bhimtal', name: 'Bhimtal', region: 'Kumaon', lat: 29.35, lng: 79.56, hotels: 72, reviews: 9800, praise: 'Rooms', complaint: 'Value for money', kind: 'Lake town' },
  { id: 'ranikhet', name: 'Ranikhet', region: 'Kumaon', lat: 29.64, lng: 79.43, hotels: 47, reviews: 6300, praise: 'Cleanliness', complaint: 'Booking', kind: 'Hill station' },
  { id: 'almora', name: 'Almora', region: 'Kumaon', lat: 29.6, lng: 79.66, hotels: 58, reviews: 7600, praise: 'Food', complaint: 'Road access', kind: 'Heritage town' },
  { id: 'kausani', name: 'Kausani', region: 'Kumaon', lat: 29.84, lng: 79.6, hotels: 44, reviews: 5900, praise: 'Himalayan views', complaint: 'Hot water', kind: 'Viewpoint town' },
  { id: 'jimcorbett', name: 'Jim Corbett', region: 'Kumaon', lat: 29.4, lng: 79.12, hotels: 133, reviews: 24100, praise: 'Staff', complaint: 'Value for money', kind: 'Wildlife resorts' },
];

export const REGION_BOUNDS = { latMin: 29.2, latMax: 30.95, lngMin: 77.8, lngMax: 80.1 };

/** Micro-markets (clusters) for the cluster heatmap. Hotel names are fictional. */
export const CLUSTERS = [
  { id: 'mall-mussoorie', name: 'Mall Road', town: 'Mussoorie', seed: 3, hotels: ['Deodar Heights', 'Silver Oak Stay', 'Mistline Residency', 'Pine Hollow Hotel', 'Ridgecrest Inn', 'Cloudgate Lodge'] },
  { id: 'landour', name: 'Landour', town: 'Mussoorie', seed: 11, hotels: ['Oakbrook Cottage', 'Rokeby Ridge', 'Char Dukan Inn', 'Sisters Bazaar Stay', 'Mist Valley Home'] },
  { id: 'mall-nainital', name: 'Mall Road', town: 'Nainital', seed: 23, hotels: ['Lakeview Retreat', 'Naini Crest', 'Boat House Inn', 'Tallital Residency', 'Ayarpatta Lodge', 'Snow View Stay'] },
  { id: 'tapovan', name: 'Tapovan', town: 'Rishikesh', seed: 37, hotels: ['Ganga Kinare Stay', 'Laxman Jhula Inn', 'Yoga Valley Retreat', 'Riverbend Hostel', 'Neelkanth View'] },
];

export const ASPECT_COLUMNS = [
  { id: 'food', short: 'Food', label: 'Food & dining' },
  { id: 'room', short: 'Rooms', label: 'Rooms & comfort' },
  { id: 'clean', short: 'Clean', label: 'Cleanliness' },
  { id: 'staff', short: 'Staff', label: 'Staff & service' },
  { id: 'location', short: 'Location', label: 'Location' },
  { id: 'value', short: 'Value', label: 'Value for money' },
  { id: 'housekeeping', short: 'House­keeping', label: 'Housekeeping' },
  { id: 'booking', short: 'Booking', label: 'Booking experience' },
];

/** Deterministic illustrative scores (0–100) per hotel × aspect; one aspect per cluster is weak market-wide. */
export function clusterMatrix(cluster, rangeId = '6m') {
  let a = cluster.seed * 9301 + (rangeId === '30d' ? 17 : rangeId === '3m' ? 7 : 0);
  const rand = () => {
    a = (a * 16807) % 2147483647;
    return (a % 1000) / 1000;
  };
  const weakIdx = cluster.seed % 3 === 0 ? 5 : cluster.seed % 3 === 1 ? 1 : 7; // value / rooms / booking
  const base = [62, 70, 74, 76, 84, 60, 72, 66];
  return cluster.hotels.map((name, h) => ({
    name,
    scores: base.map((b, k) => {
      let v = b + Math.round((rand() - 0.5) * 34) + (h === 0 ? 3 : 0);
      if (k === weakIdx) v = 34 + Math.round(rand() * 16);
      return Math.max(12, Math.min(96, v));
    }),
    reviews: 180 + Math.round(rand() * 900),
  }));
}

/** Destination-board views per town (stylised map labels + town-wide issues). */
export const DESTINATION_SETS = {
  mussoorie: {
    name: 'Mussoorie',
    labels: [
      { x: 392, y: 168, t: 'Mall Road' }, { x: 540, y: 128, t: 'Landour' }, { x: 196, y: 178, t: 'Library Chowk' }, { x: 40, y: 392, t: 'Kempty road' }, { x: 566, y: 352, t: 'Camel’s Back Rd' },
    ],
    issues: DESTINATION_ISSUES,
  },
  nainital: {
    name: 'Nainital',
    labels: [
      { x: 300, y: 150, t: 'Naini Lake' }, { x: 470, y: 110, t: 'Mall Road' }, { x: 120, y: 330, t: 'Tallital' }, { x: 560, y: 360, t: 'Mallital' }, { x: 610, y: 210, t: 'Snow View' },
    ],
    issues: [
      { id: 'parking', label: 'Parking', x: 470, y: 150, complaints: 468, hotels: 41, reviews: 2510, trend: 'Peaks on weekends', quotes: ['Parking near the Mall was impossible.', 'Gaadi Tallital pe chhodni padi.'] },
      { id: 'traffic', label: 'Traffic jams', x: 200, y: 300, complaints: 311, hotels: 36, reviews: 1980, trend: 'Peaks May–June', quotes: ['Two hours stuck before the lake.', 'Traffic bahut zyada tha.'] },
      { id: 'prices', label: 'High prices', x: 380, y: 280, complaints: 244, hotels: 47, reviews: 2620, trend: 'Peaks on long weekends', quotes: ['Boat ride prices doubled on Sunday.', 'Room rates were steep for the size.'] },
      { id: 'water', label: 'Water supply', x: 610, y: 250, complaints: 118, hotels: 15, reviews: 790, trend: 'Peaks in summer', quotes: ['No water in the afternoon.', 'पानी की कमी थी।'] },
      { id: 'cleanliness', label: 'Lake-side litter', x: 290, y: 190, complaints: 97, hotels: 22, reviews: 640, trend: 'Rising since April', quotes: ['Plastic along the lake edge.', 'Mall Road was dirty at night.'] },
    ],
  },
  rishikesh: {
    name: 'Rishikesh',
    labels: [
      { x: 330, y: 120, t: 'Laxman Jhula' }, { x: 160, y: 250, t: 'Tapovan' }, { x: 520, y: 300, t: 'Ram Jhula' }, { x: 610, y: 160, t: 'Neelkanth road' }, { x: 60, y: 380, t: 'Haridwar road' },
    ],
    issues: [
      { id: 'crowds', label: 'Crowds at ghats', x: 520, y: 260, complaints: 276, hotels: 33, reviews: 1870, trend: 'Peaks in Kanwar season', quotes: ['Ghats were overcrowded at aarti.', 'Bheed bahut thi shaam ko.'] },
      { id: 'roads', label: 'Road conditions', x: 600, y: 190, complaints: 204, hotels: 21, reviews: 1290, trend: 'Peaks in the monsoon', quotes: ['Neelkanth road was badly broken.', 'Raste mein gaddhe hi gaddhe.'] },
      { id: 'noise', label: 'Late-night noise', x: 180, y: 220, complaints: 162, hotels: 26, reviews: 1140, trend: 'Weekends', quotes: ['Music from cafés till 1 am.', 'Raat ko shor bahut tha.'] },
      { id: 'water', label: 'Hot water', x: 300, y: 160, complaints: 149, hotels: 29, reviews: 1020, trend: 'Clusters in winter', quotes: ['No hot water in the morning.', 'गर्म पानी नहीं आया।'] },
      { id: 'parking', label: 'Parking', x: 420, y: 330, complaints: 131, hotels: 18, reviews: 910, trend: 'Rising since March', quotes: ['Nowhere to park near Laxman Jhula.', 'Parking ke liye door jaana pada.'] },
    ],
  },
};

/** The problem statement's success metrics, as shown on the homepage. */
export const PS_METRICS = [
  { id: 'analysed', label: 'Reviews analysed vs read by hand', value: '100%', note: 'Every review is read and tagged — a person reads about one in ten', live: 'reviews' },
  { id: 'detect', label: 'Time to identify an issue', value: '< 7 days', note: 'From the first complaint to an evidence-backed alert (illustrative target)' },
  { id: 'position', label: 'Aspect-level position', value: '8 topics', note: 'Rank against nearby competitors, topic by topic' },
  { id: 'movement', label: 'Rating movement after a change', value: '± 90 days', note: 'Before/after window around every logged intervention' },
  { id: 'benchmarked', label: 'Properties benchmarked', value: '14 towns', note: 'Hotels compared inside their own micro-market', live: 'hotels' },
  { id: 'evidence', label: 'Issues surfaced with evidence', value: 'Every one', note: 'No finding without the guest quotes behind it' },
];

export const HOW_STEPS = [
  { id: 'collect', n: '01', title: 'Collect', text: 'Reviews from Google, Booking.com, Agoda, MakeMyTrip and Tripadvisor, for your hotel and every hotel around it — refreshed about every 15 days.' },
  { id: 'understand', n: '02', title: 'Understand', text: 'Each review is read in English, Hindi or Hinglish and tagged by topic and sentiment, with the exact sentence kept as evidence.' },
  { id: 'benchmark', n: '03', title: 'Benchmark', text: 'Hotels are grouped into micro-markets. Every topic is scored against the hotels guests actually compare you with.' },
  { id: 'act', n: '04', title: 'Act', text: 'Hotels get what to fix first; tourism boards see town-wide problems; both track whether things improved.' },
];
