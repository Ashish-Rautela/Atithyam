import { describe, it, expect } from 'vitest';
import { analyseWithLexicon, detectLanguage } from '../../src/services/analysis/lexicon.js';
import { normaliseIssue, aspectForSubscore } from '../../src/services/analysis/taxonomy.js';
import { detectChangepoint, aspectScore, twoPropZ } from '../../src/services/analysis/stats.js';

const pick = (r) => Object.fromEntries(r.aspects.map((a) => [a.aspect, a.sentiment]));

describe('offline aspect analyser (English, Hinglish, Devanagari)', () => {
  it('splits mixed reviews into aspects with their own polarity', () => {
    expect(pick(analyseWithLexicon({ text: 'Room was very dirty and bathroom smelled bad. Staff was friendly though.' }))).toMatchObject({ cleanliness: -1, staff: 1 });
    expect(pick(analyseWithLexicon({ text: 'Garam pani nahi aaya, staff helpful tha.' }))).toEqual({ room: -1, staff: 1 });
    expect(pick(analyseWithLexicon({ text: 'Khana accha nahi tha' }))).toEqual({ food: -1 });
    expect(pick(analyseWithLexicon({ text: 'कमरा साफ था, स्टाफ का व्यवहार अच्छा था' }))).toMatchObject({ staff: 1 });
    expect(pick(analyseWithLexicon({ text: 'Staff was not very friendly' }))).toEqual({ staff: -1 });
  });
  it('tags specific issues, including destination-level ones', () => {
    const r = analyseWithLexicon({ text: 'Location is great, walking distance to mall road but parking is a problem' });
    expect(r.issues.map((i) => [i.issue, i.sentiment, i.scope])).toEqual([['distance_market', 1, 'property'], ['parking', -1, 'destination']]);
    expect(analyseWithLexicon({ text: 'No hot water in the morning, geyser not working' }).issues[0]).toMatchObject({ issue: 'hot_water', sentiment: -1 });
  });
  it('uses Booking liked/disliked as polarity and detects language', () => {
    expect(pick(analyseWithLexicon({ liked: 'breakfast', disliked: 'parking' }))).toEqual({ food: 1, location: -1 });
    expect(detectLanguage('Khana bahut accha tha lekin room chota tha')).toBe('hinglish');
    expect(detectLanguage('कमरा साफ था')).toBe('hi');
    expect(detectLanguage('Lovely stay')).toBe('en');
  });
});

describe('taxonomy normalisation', () => {
  it('maps free tags and platform category names', () => {
    expect(normaliseIssue('Geyser')).toBe('hot_water');
    expect(normaliseIssue('rude staff')).toBe('staff_behaviour');
    expect(normaliseIssue('lift not working at all')).toBe('lift_not_working');
    expect(['Staff', 'Service', 'Hospitality', 'Comfort', 'Value for money', 'Free WiFi'].map(aspectForSubscore)).toEqual(['staff', 'staff', 'staff', 'room', 'value', null]);
  });
});

describe('statistics', () => {
  it('scores aspects 0–100 and shrinks small samples', () => {
    expect(aspectScore(10, 0, 10, 0, 0)).toBe(100);
    expect(aspectScore(1, 0, 1, 0, 4)).toBe(60);
    expect(twoPropZ(8, 10, 2, 10)).toBeGreaterThan(2.5);
  });
  it('finds a single shift in a monthly series', () => {
    const months = Array.from({ length: 10 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}-01`, n: 5, mean: i < 5 ? 4.8 : 2.1, var: 0.2 }));
    expect(detectChangepoint(months, { minDiff: 0.4 })).toMatchObject({ month: '2026-06-01' });
    expect(detectChangepoint(months.map((m) => ({ ...m, mean: 4 })), { minDiff: 0.4 })).toBeNull();
  });
});
