/**
 * The shared vocabulary of the analysis: the 8 aspects from the problem statement, the issue tags
 * reviews are normalised to, and how each platform's own category scores map onto the aspects.
 * Used by the Gemini prompt, the offline lexicon fallback, the benchmark and the UI.
 */

export const ASPECTS = Object.freeze([
  { key: 'food', label: 'Food' },
  { key: 'room', label: 'Room' },
  { key: 'housekeeping', label: 'Housekeeping' },
  { key: 'staff', label: 'Staff' },
  { key: 'location', label: 'Location' },
  { key: 'value', label: 'Value for Money' },
  { key: 'cleanliness', label: 'Cleanliness' },
  { key: 'booking', label: 'Booking Experience' },
]);
export const ASPECT_KEYS = ASPECTS.map((a) => a.key);
export const ASPECT_LABEL = Object.fromEntries(ASPECTS.map((a) => [a.key, a.label]));

/**
 * Issue tags: what exactly guests talk about inside an aspect. `scope: 'destination'` marks things a
 * single hotel does not control (roads, parking, power cuts) — they feed the Tourism Board view.
 * `en`/`hi` are lexicon patterns (lower-case; romanised Hindi and Devanagari).
 */
export const ISSUES = Object.freeze({
  hot_water: { aspect: 'room', label: 'Hot water / geyser', en: ['hot water', 'geyser', 'geysers', 'warm water', 'no water'], hi: ['garam pani', 'garam paani', 'गरम पानी', 'गर्म पानी', 'गीजर'] },
  heating: { aspect: 'room', label: 'Heating / cold room', en: ['heater', 'heating', 'room heater', 'freezing', 'too cold', 'blower', 'blanket'], hi: ['thand', 'thandi', 'ठंड', 'हीटर', 'kambal', 'रजाई', 'razai'] },
  ac: { aspect: 'room', label: 'Air conditioning', en: [' ac ', 'a/c', 'air conditioner', 'air conditioning', 'aircon'], hi: ['एसी'] },
  wifi: { aspect: 'room', label: 'Wi-Fi / internet', en: ['wifi', 'wi-fi', 'internet', 'wi fi'], hi: ['वाईफाई'] },
  bathroom: { aspect: 'room', label: 'Bathroom / plumbing', en: ['bathroom', 'washroom', 'toilet', 'shower', 'flush', 'tap', 'leak', 'leaking', 'drain', 'seepage', 'damp'], hi: ['बाथरूम', 'शौचालय', 'नल'] },
  bed_comfort: { aspect: 'room', label: 'Bed & pillows', en: ['bed', 'beds', 'mattress', 'pillow', 'pillows', 'quilt'], hi: ['bistar', 'बिस्तर', 'गद्दा', 'takiya'] },
  room_size: { aspect: 'room', label: 'Room size', en: ['small room', 'tiny', 'cramped', 'spacious', 'big room', 'compact'], hi: ['chota kamra', 'chhota kamra', 'bada kamra'] },
  noise: { aspect: 'room', label: 'Noise', en: ['noise', 'noisy', 'loud', 'disturb', 'party', 'music'], hi: ['shor', 'शोर', 'awaaz'] },
  power_cut: { aspect: 'room', label: 'Power cuts', scope: 'destination', en: ['power cut', 'power outage', 'no electricity', 'electricity', 'generator', 'power backup'], hi: ['bijli', 'बिजली', 'light chali', 'light nahi'] },
  view: { aspect: 'location', label: 'View', en: ['view', 'valley view', 'mountain view', 'scenic', 'himalaya', 'sunrise', 'sunset'], hi: ['nazara', 'नज़ारा', 'नजारा'] },
  breakfast: { aspect: 'food', label: 'Breakfast', en: ['breakfast', 'buffet breakfast', 'complimentary breakfast'], hi: ['nashta', 'naashta', 'नाश्ता'] },
  food_taste: { aspect: 'food', label: 'Food taste / quality', en: ['taste', 'tasty', 'tasteless', 'bland', 'delicious', 'stale', 'oily', 'spicy', 'undercooked'], hi: ['swad', 'swaad', 'स्वाद', 'स्वादिष्ट', 'basi', 'बासी'] },
  food_variety: { aspect: 'food', label: 'Menu / variety', en: ['variety', 'options', 'menu', 'limited menu', 'choices'], hi: ['मेन्यू'] },
  room_service_delay: { aspect: 'staff', label: 'Slow service', en: ['slow service', 'room service', 'waited', 'waiting', 'delay', 'delayed', 'late', 'took forever', 'no response'], hi: ['der', 'deri', 'देर', 'intezaar'] },
  staff_behaviour: { aspect: 'staff', label: 'Staff behaviour', en: ['rude', 'behaviour', 'behavior', 'attitude', 'polite', 'courteous', 'friendly', 'helpful', 'hospitality', 'arrogant', 'unprofessional'], hi: ['vyavhar', 'व्यवहार', 'बदतमीज', 'badtameez', 'tameez'] },
  front_desk: { aspect: 'staff', label: 'Reception / front desk', en: ['reception', 'receptionist', 'front desk', 'front office'], hi: ['रिसेप्शन'] },
  towels_linen: { aspect: 'housekeeping', label: 'Towels & linen', en: ['towel', 'towels', 'linen', 'bedsheet', 'bedsheets', 'bed sheet', 'sheets', 'toiletries', 'soap', 'shampoo'], hi: ['tauliya', 'तौलिया', 'चादर', 'chadar'] },
  room_not_cleaned: { aspect: 'housekeeping', label: 'Room not serviced', en: ['housekeeping', 'not cleaned', 'room cleaning', 'not serviced', 'cleaned daily', 'made the bed'], hi: ['safai nahi', 'सफाई नहीं'] },
  dirty_room: { aspect: 'cleanliness', label: 'Dirt / dust / stains', en: ['dirty', 'unclean', 'dust', 'dusty', 'stain', 'stains', 'filthy', 'hair', 'unhygienic', 'spotless'], hi: ['ganda', 'gandi', 'gande', 'gandagi', 'गंदा', 'गंदी', 'गंदगी', 'mitti'] },
  bad_smell: { aspect: 'cleanliness', label: 'Bad smell', en: ['smell', 'smelly', 'stink', 'stinking', 'odour', 'odor', 'musty', 'foul'], hi: ['badbu', 'badboo', 'बदबू', 'बू'] },
  pests: { aspect: 'cleanliness', label: 'Insects / pests', en: ['cockroach', 'cockroaches', 'insects', 'bugs', 'bed bugs', 'bedbugs', 'rats', 'mice', 'lizard', 'mosquito', 'mosquitoes'], hi: ['keede', 'kide', 'कीड़े', 'मच्छर', 'macchar', 'chuha', 'chhipkali'] },
  parking: { aspect: 'location', label: 'Parking', scope: 'destination', en: ['parking', 'park the car', 'car park', 'valet'], hi: ['पार्किंग'] },
  access_road: { aspect: 'location', label: 'Road access / steep climb', scope: 'destination', en: ['steep', 'climb', 'uphill', 'stairs', 'steps', 'narrow road', 'approach road', 'bad road', 'road condition', 'difficult to reach'], hi: ['chadhai', 'चढ़ाई', 'sadak', 'सड़क'] },
  traffic: { aspect: 'location', label: 'Traffic / congestion', scope: 'destination', en: ['traffic', 'jam', 'congestion', 'crowded', 'crowd'], hi: ['bheed', 'भीड़', 'जाम'] },
  distance_market: { aspect: 'location', label: 'Distance to market / Mall Road', en: ['mall road', 'market', 'walking distance', 'far from', 'close to', 'near to', 'centrally located', 'city center', 'city centre'], hi: ['bazaar', 'बाज़ार', 'बाजार', 'paas', 'door'] },
  overpriced: { aspect: 'value', label: 'Overpriced', en: ['overpriced', 'expensive', 'costly', 'not worth', 'overcharged', 'overcharge', 'too much money', 'pricey', 'rip off', 'ripoff'], hi: ['mehenga', 'mehnga', 'mahanga', 'महंगा', 'मंहगा', 'zyada paise'] },
  value_for_money: { aspect: 'value', label: 'Good value', en: ['value for money', 'worth the money', 'worth it', 'affordable', 'reasonable', 'budget', 'cheap'], hi: ['paisa vasool', 'paisa wasool', 'sasta', 'सस्ता', 'पैसा वसूल'] },
  local_overcharging: { aspect: 'value', label: 'Local overcharging (taxis, vendors)', scope: 'destination', en: ['taxi fare', 'taxi driver', 'cab driver', 'overcharged by', 'vendors', 'tourist trap'], hi: ['taxi wale', 'टैक्सी'] },
  checkin_delay: { aspect: 'booking', label: 'Check-in / check-out', en: ['check-in', 'check in', 'checkin', 'check-out', 'checkout', 'check out', 'early check', 'late checkout'], hi: ['चेक इन'] },
  booking_mismatch: { aspect: 'booking', label: 'Room not as booked', en: ['not as shown', 'as per pictures', 'as per photos', 'different room', 'downgrade', 'upgrade', 'booked', 'misleading', 'photos'], hi: ['photo jaisa nahi'] },
  refund_cancellation: { aspect: 'booking', label: 'Refund / cancellation', en: ['refund', 'cancel', 'cancellation', 'cancelled', 'advance payment'], hi: ['पैसे वापस', 'paise wapas'] },
  billing: { aspect: 'booking', label: 'Billing / hidden charges', en: ['bill', 'invoice', 'extra charges', 'hidden charges', 'gst', 'charged extra'], hi: ['बिल'] },
});
export const ISSUE_KEYS = Object.keys(ISSUES);
export const DESTINATION_ISSUES = ISSUE_KEYS.filter((k) => ISSUES[k].scope === 'destination');

/** Free-text tags from the AI are mapped onto the fixed list where they clearly match. */
const ISSUE_SYNONYMS = {
  geyser: 'hot_water', no_hot_water: 'hot_water', water_heater: 'hot_water', cold_water: 'hot_water',
  room_heater: 'heating', cold_room: 'heating', room_too_cold: 'heating',
  air_conditioning: 'ac', aircon: 'ac',
  internet: 'wifi', wi_fi: 'wifi', slow_wifi: 'wifi',
  toilet: 'bathroom', washroom: 'bathroom', plumbing: 'bathroom', leakage: 'bathroom', shower: 'bathroom',
  bed: 'bed_comfort', mattress: 'bed_comfort', pillows: 'bed_comfort',
  small_room: 'room_size', spacious_room: 'room_size',
  noisy: 'noise',
  electricity: 'power_cut', power_outage: 'power_cut', power_backup: 'power_cut',
  breakfast_quality: 'breakfast', breakfast_variety: 'breakfast',
  food_quality: 'food_taste', taste: 'food_taste',
  menu: 'food_variety', limited_menu: 'food_variety',
  slow_service: 'room_service_delay', service_delay: 'room_service_delay', room_service: 'room_service_delay',
  rude_staff: 'staff_behaviour', staff_attitude: 'staff_behaviour', friendly_staff: 'staff_behaviour', helpful_staff: 'staff_behaviour', hospitality: 'staff_behaviour',
  reception: 'front_desk',
  towels: 'towels_linen', linen: 'towels_linen', bedsheets: 'towels_linen', toiletries: 'towels_linen',
  housekeeping: 'room_not_cleaned', room_cleaning: 'room_not_cleaned',
  dirty: 'dirty_room', dust: 'dirty_room', stains: 'dirty_room', hygiene: 'dirty_room', cleanliness: 'dirty_room',
  smell: 'bad_smell', odour: 'bad_smell', odor: 'bad_smell',
  insects: 'pests', cockroaches: 'pests', bed_bugs: 'pests', mosquitoes: 'pests',
  car_parking: 'parking', no_parking: 'parking',
  steep_road: 'access_road', stairs: 'access_road', road_access: 'access_road', approach_road: 'access_road',
  congestion: 'traffic', crowd: 'traffic', crowded: 'traffic',
  mall_road: 'distance_market', distance: 'distance_market', location_convenience: 'distance_market',
  expensive: 'overpriced', price: 'overpriced', overcharging: 'overpriced',
  value: 'value_for_money', affordable: 'value_for_money',
  taxi: 'local_overcharging',
  check_in: 'checkin_delay', checkin: 'checkin_delay', check_out: 'checkin_delay',
  room_mismatch: 'booking_mismatch', not_as_described: 'booking_mismatch',
  refund: 'refund_cancellation', cancellation: 'refund_cancellation',
  hidden_charges: 'billing', extra_charges: 'billing',
  scenic_view: 'view', mountain_view: 'view', valley_view: 'view',
};

/** Normalise one free-text tag ("Hot water!" → "hot_water"). Unknown tags are kept in snake_case (max 3 words). */
export function normaliseIssue(tag) {
  const t = String(tag ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!t) return null;
  if (ISSUES[t]) return t;
  if (ISSUE_SYNONYMS[t]) return ISSUE_SYNONYMS[t];
  return t.split('_').slice(0, 3).join('_');
}

export function issueLabel(key) {
  return ISSUES[key]?.label ?? key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Platform category scores → aspects. Booking ("Staff", "Comfort", …), Agoda ("Service", …),
 * MakeMyTrip ("Hospitality", "Food", …) all name them differently; this is the normalisation.
 */
const SUBSCORE_MAP = [
  [/staff|service|hospitality/i, 'staff'],
  [/clean/i, 'cleanliness'],
  [/location/i, 'location'],
  [/value|money/i, 'value'],
  [/food|dining|breakfast/i, 'food'],
  [/comfort|room/i, 'room'],
];
export function aspectForSubscore(name) {
  for (const [re, aspect] of SUBSCORE_MAP) if (re.test(name ?? '')) return aspect;
  return null;
}
