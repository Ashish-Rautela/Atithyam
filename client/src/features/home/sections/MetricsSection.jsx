import { useRef } from 'react';
import { AnimatedCounter } from '../components/ui.jsx';
import { Contours } from '../components/Landscape.jsx';
import { useLiveCoverage } from '../components/useLiveCoverage.js';
import { gsap, useSectionMotion, enter } from '../motion/motion.js';
import { PS_METRICS, HOW_STEPS } from '../data/homeDemo.js';

/** The problem statement's success measures — live where the platform database can answer them. */
export function MetricsSection() {
  const ref = useRef(null);
  const live = useLiveCoverage();

  useSectionMotion(ref, ({ reduce, root }) => {
    const q = gsap.utils.selector(root);
    enter(q('.met-head > *'), { from: 'left', trigger: root, start: 'top 75%', stagger: 0.08, reduce, distance: 0.5 });
    q('.met-tile').forEach((el, i) => enter(el, { from: i % 3 === 0 ? 'diag-bl' : i % 3 === 1 ? 'bottom' : 'diag-br', trigger: q('.met-grid')[0], delay: (i % 3) * 0.08 + Math.floor(i / 3) * 0.15, reduce, distance: 0.6 }));
  });

  const liveValue = (m) => {
    if (!live.ok || !m.live) return null;
    return m.live === 'reviews' ? live.totals.reviews : live.totals.hotels;
  };

  return (
    <section ref={ref} className="met" aria-labelledby="met-title">
      <div className="wrap">
        <div className="met-head">
          <p className="eyebrow eyebrow-dark">07 — Measured, not guessed</p>
          <h2 id="met-title" className="display display-light display-wide">What the platform measures — <em>for every hotel and town.</em></h2>
        </div>
        <ul className="met-grid">
          {PS_METRICS.map((m) => {
            const lv = liveValue(m);
            return (
              <li key={m.id} className={`met-tile ${lv !== null ? 'is-live' : ''}`}>
                <p className="met-v">{lv !== null ? <AnimatedCounter value={lv} /> : m.value}</p>
                <p className="met-k">{m.label}</p>
                <p className="met-note">{lv !== null ? (m.live === 'reviews' ? 'Reviews collected so far — every one analysed' : 'Hotels mapped and benchmarked so far') : m.note}</p>
                {lv !== null && <span className="met-live">● Live</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** Four steps from a guest's review to a decision, joined by a trail that draws itself. */
export function HowItWorksSection() {
  const ref = useRef(null);
  useSectionMotion(ref, ({ reduce, isDesktop, root }) => {
    const q = gsap.utils.selector(root);
    enter(q('.how-head > *'), { from: 'bottom', trigger: root, start: 'top 75%', stagger: 0.08, reduce, distance: 0.5 });
    // The trail uses pathLength="1", so 1 → 0 draws it whatever its rendered size.
    if (!reduce && isDesktop) gsap.fromTo(q('.how-trail path'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: q('.how-steps')[0], start: 'top 80%', end: 'bottom 60%', scrub: 0.6 } });
    q('.how-step').forEach((el, i) => enter(el, { from: i % 2 ? 'top' : 'bottom', trigger: q('.how-steps')[0], start: 'top 75%', delay: i * 0.14, reduce, distance: 0.6 }));
  });
  return (
    <section ref={ref} id="how-it-works" className="how" aria-labelledby="how-title">
      <Contours className="impact-contours" seed={53} lines={6} color="#1D5746" />
      <div className="wrap">
        <div className="how-head">
          <p className="eyebrow eyebrow-light">08 — How it works</p>
          <h2 id="how-title" className="display display-wide">From a guest’s sentence <em>to a decision.</em></h2>
        </div>
        <div className="how-steps">
          <svg className="how-trail" viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path pathLength="1" d="M20 120 C 180 120, 220 40, 330 40 S 520 130, 620 120 S 820 30, 930 40 S 1120 120, 1180 100" />
          </svg>
          <ol>
            {HOW_STEPS.map((s) => (
              <li key={s.id} className="how-step">
                <span className="how-n">{s.n}</span>
                <h3 className="how-title">{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
