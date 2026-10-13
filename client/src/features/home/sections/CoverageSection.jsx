import { useRef } from 'react';
import { RidgeDivider, Contours } from '../components/Landscape.jsx';
import { AnimatedCounter, Cta } from '../components/ui.jsx';
import { useLiveCoverage } from '../components/useLiveCoverage.js';
import { gsap, useSectionMotion, enter } from '../motion/motion.js';
import { REGION_DESTINATIONS } from '../data/homeDemo.js';

const AUDIENCES = [
  {
    id: 'hotels',
    tone: 'forest',
    k: 'For hotels, homestays & resorts',
    title: 'Know where you stand among the hotels next door.',
    points: [
      'Every topic — food, rooms, staff, cleanliness, value — scored against your real competitors',
      'Problems that are yours, separated from problems the whole market shares',
      'Early warnings with the exact guest sentences behind them',
    ],
    cta: { to: '/search', label: 'Find your hotel' },
  },
  {
    id: 'boards',
    tone: 'glacier',
    k: 'For tourism boards & district administration',
    title: 'See what visitors run into across a whole town.',
    points: [
      'Parking, roads, water, power and pricing complaints pooled across every property',
      'Which issues are widespread, where they cluster and when they peak',
      'Evidence you can export and share, grouped by micro-market',
    ],
    cta: { to: '/seeding', label: 'Explore destinations' },
  },
];

export default function CoverageSection() {
  const ref = useRef(null);
  const live = useLiveCoverage();
  const t = live.totals;
  const stats = live.ok
    ? [
        { v: t.destinations, k: 'Destinations seeded' },
        { v: t.hotels, k: 'Hotels mapped' },
        { v: t.reviews, k: 'Reviews collected' },
        { v: t.clusters, k: 'Micro-markets' },
      ]
    : [
        { v: REGION_DESTINATIONS.length, k: 'Hill destinations on the map' },
        { v: 5, k: 'Review platforms' },
        { v: 3, k: 'Languages understood' },
        { v: 8, k: 'Topics benchmarked' },
      ];

  useSectionMotion(ref, ({ reduce, root }) => {
    const q = gsap.utils.selector(root);
    enter(q('.cov-head > *'), { from: 'bottom', trigger: root, start: 'top 75%', stagger: 0.08, reduce, distance: 0.5 });
    enter(q('.cov-stat'), { from: 'bottom', trigger: q('.cov-stats')[0], stagger: 0.08, reduce, distance: 0.4 });
    enter(q('.aud-hotels'), { from: 'diag-bl', trigger: q('.aud')[0], reduce });
    enter(q('.aud-boards'), { from: 'diag-br', trigger: q('.aud')[0], reduce, delay: 0.12 });
    enter(q('.aud-card li'), { from: 'left', trigger: q('.aud')[0], stagger: 0.05, reduce, distance: 0.3, delay: 0.4 });
  });

  return (
    <section ref={ref} id="coverage" tabIndex={-1} className="cov" aria-labelledby="cov-title">
      <RidgeDivider fill="#F7F4EC" seed={5} className="uni-divider" />
      <Contours className="uni-contours" seed={7} lines={7} color="#1D5746" />
      <div className="wrap">
        <div className="cov-head">
          <p className="eyebrow eyebrow-light">Built for the whole region</p>
          <h2 id="cov-title" className="display display-wide">One platform for every hotel — <em>and the towns they share.</em></h2>
        </div>
        <dl className="cov-stats" aria-label={live.ok ? 'Live platform coverage' : 'What the platform covers'}>
          {stats.map((s) => (
            <div key={s.k} className="cov-stat">
              <dt>{s.k}</dt>
              <dd><AnimatedCounter value={s.v} /></dd>
            </div>
          ))}
        </dl>
        <p className="cov-src">{live.ok ? '● Live from the platform database' : 'Start the server and seed a town to see live coverage here.'}</p>

        <div className="aud">
          {AUDIENCES.map((a) => (
            <article key={a.id} className={`aud-card aud-${a.id} tone-${a.tone}`}>
              <p className="aud-k">{a.k}</p>
              <h3 className="aud-title">{a.title}</h3>
              <ul>
                {a.points.map((p) => <li key={p}>{p}</li>)}
              </ul>
              <Cta to={a.cta.to} variant={a.tone === 'forest' ? 'light' : 'primary'}>{a.cta.label}</Cta>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
