import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import Landscape, { RidgeDivider } from '../components/Landscape.jsx';
import { AnimatedCounter, Cta, DemoTag } from '../components/ui.jsx';
import { gsap, useSectionMotion, enter, draw, parallax } from '../motion/motion.js';
import { DESTINATION_SETS } from '../data/homeDemo.js';

const MAP_W = 760;
const MAP_H = 420;

/** Concentric organic rings = a stylised hill seen from above. */
function rings(cx, cy, rx, ry, n, seed) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const f = 1 - k / (n + 0.5);
    let d = '';
    for (let a = 0; a <= 24; a++) {
      const t = (a / 24) * Math.PI * 2;
      const wob = 1 + 0.08 * Math.sin(t * 3 + seed + k) + 0.05 * Math.cos(t * 5 + seed * 2);
      const x = cx + Math.cos(t) * rx * f * wob;
      const y = cy + Math.sin(t) * ry * f * wob;
      d += `${a ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
    }
    out.push(`${d}Z`);
  }
  return out;
}

function IssueMap({ selected, onSelect, set }) {
  const reduce = useReducedMotion();
  const contours = useMemo(() => [...rings(330, 210, 300, 150, 6, 1), ...rings(600, 170, 150, 95, 4, 4), ...rings(150, 320, 140, 80, 3, 7)], []);
  return (
    <div className="map">
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="map-svg" aria-hidden="true" focusable="false">
        <rect width={MAP_W} height={MAP_H} fill="#EEF4EF" />
        {contours.map((d, i) => <path key={i} d={d} className="map-contour" />)}
        <path className="map-route" d="M40 360 C 120 330, 150 280, 210 260 S 300 210, 360 205 S 470 170, 530 150 S 640 200, 720 250" />
        <path className="map-route map-route-2" d="M150 300 C 180 360, 260 380, 420 320" />
        {set.labels.map((l) => <text key={l.t} x={l.x} y={l.y} className="map-label">{l.t}</text>)}
      </svg>
      {set.issues.map((iss) => {
        const on = iss.id === selected;
        return (
          <button
            key={iss.id}
            type="button"
            className={`marker ${on ? 'is-on' : ''}`}
            style={{ left: `${(iss.x / MAP_W) * 100}%`, top: `${(iss.y / MAP_H) * 100}%` }}
            onClick={() => onSelect(iss.id)}
            aria-pressed={on}
            aria-label={`${iss.label}: ${iss.complaints} complaints`}
          >
            <motion.span className="marker-ring" animate={{ scale: on ? 1 : 0.6, opacity: on ? 1 : 0 }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 18 }} aria-hidden="true" />
            <span className="marker-dot" aria-hidden="true" />
            <span className="marker-label">{iss.label}</span>
          </button>
        );
      })}
      <p className="map-note">Stylised map of {set.name} — not to scale</p>
    </div>
  );
}

export default function TourismBoardSection() {
  const ref = useRef(null);
  const [town, setTown] = useState('mussoorie');
  const set = DESTINATION_SETS[town];
  const [selected, setSelected] = useState('parking');
  const reduce = useReducedMotion();
  const iss = set.issues.find((x) => x.id === selected) ?? set.issues[0];
  const pickTown = (t) => {
    setTown(t);
    setSelected(DESTINATION_SETS[t].issues[0].id);
  };

  useSectionMotion(ref, ({ reduce: rm, isDesktop, root }) => {
    const q = gsap.utils.selector(root);
    if (!rm) {
      // Panorama opens like a curtain drawn to the right.
      gsap.fromTo(q('.pano')[0], { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'power2.inOut', duration: 1.6, scrollTrigger: { trigger: q('.pano')[0], start: 'top 80%', once: true } });
      parallax(q('.pano')[0], { trigger: q('.pano')[0], distance: isDesktop ? 120 : 50 });
    }
    enter(q('.dest-copy > *'), { from: 'left', trigger: q('.dest-copy')[0], stagger: 0.1, reduce: rm, distance: 0.6 });
    enter(q('.map'), { from: 'bottom', trigger: q('.map')[0], reduce: rm, distance: isDesktop ? 1.6 : 0.6, duration: 1.3 });
    if (!rm) gsap.from(q('.marker'), { scale: 0, opacity: 0, stagger: 0.12, duration: 0.6, ease: 'back.out(2.2)', delay: 0.5, scrollTrigger: { trigger: q('.map')[0], start: 'top 75%', once: true } });
    draw(q('.map-route'), { trigger: q('.map')[0], start: 'top 75%', duration: 2, reduce: rm, delay: 0.3 });
  });

  return (
    <section ref={ref} id="destinations" tabIndex={-1} className="dest" aria-labelledby="dest-title">
      <RidgeDivider fill="#E8F0EB" seed={23} className="dest-divider" />
      <div className="pano">
        <Landscape variant="panorama" align="xMidYMid" label="Illustration: a hill town spread along a pine ridge beneath snow peaks" />
        <p className="pano-caption">Mussoorie · Nainital · Rishikesh — and every town you seed</p>
      </div>
      <div className="wrap dest-grid">
        <div className="dest-copy">
          <p className="eyebrow eyebrow-light">05 — Destination view</p>
          <h2 id="dest-title" className="display">See the problems <em>no single hotel</em> can solve.</h2>
          <p className="lede">
            When guests at forty different hotels all mention the same parking struggle or broken road, that is a destination issue. We
            group what visitors say across every property in a town, so a tourism board can see which problems are widespread and decide
            where to look first.
          </p>
          <p className="dest-fine">Guest feedback helps identify and prioritise issues; fixing them stays with the people who run the town.</p>
          <Cta to="/seeding" variant="primary">Explore destination insights</Cta>
        </div>

        <div className="dest-viz">
          <div className="town-chips" role="tablist" aria-label="Destination">
            <LayoutGroup id="towns">
              {Object.entries(DESTINATION_SETS).map(([id, t]) => (
                <button key={id} type="button" role="tab" aria-selected={id === town} className={id === town ? 'is-on' : ''} onClick={() => pickTown(id)}>
                  {id === town && <motion.span layoutId="town-pill" className="chip-pill" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                  <span className="chip-text">{t.name}</span>
                </button>
              ))}
            </LayoutGroup>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={town} initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
              <IssueMap selected={iss.id} onSelect={setSelected} set={set} />
            </motion.div>
          </AnimatePresence>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${town}-${iss.id}`}
              className="dest-stats"
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: -30 }}
              transition={{ type: 'spring', stiffness: 160, damping: 22 }}
              aria-live="polite"
            >
              <p className="dest-issue">{iss.label}</p>
              <dl className="dest-nums">
                <div><dt>Visitor complaints</dt><dd><AnimatedCounter value={iss.complaints} duration={0.9} /></dd></div>
                <div><dt>Hotels where it appears</dt><dd><AnimatedCounter value={iss.hotels} duration={0.9} /></dd></div>
                <div><dt>Reviews read</dt><dd><AnimatedCounter value={iss.reviews} duration={0.9} /></dd></div>
              </dl>
              <p className="dest-trend">{iss.trend}</p>
              <ul className="dest-quotes">
                {iss.quotes.map((qt) => <li key={qt} lang={/[ऀ-ॿ]/.test(qt) ? 'hi' : undefined}>“{qt}”</li>)}
              </ul>
              <DemoTag>Illustrative figures</DemoTag>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
