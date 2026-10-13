import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { ComparisonBars, DemoTag } from '../components/ui.jsx';
import { gsap, ScrollTrigger, useSectionMotion, enter } from '../motion/motion.js';
import { topicsFor, RANGES, PEER_NAMES, STATUS_LABEL, DEMO_HOTEL } from '../data/homeDemo.js';

const STATUS_ICON = { advantage: '▲', attention: '●', similar: '◆' };

function RangeDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const cur = RANGES.find((r) => r.id === value);
  return (
    <div className="dropdown" ref={ref}>
      <span className="dropdown-k" id="range-label">Reporting period</span>
      <button type="button" className="dropdown-btn" aria-haspopup="listbox" aria-expanded={open} aria-labelledby="range-label range-value" onClick={() => setOpen((o) => !o)}>
        <span id="range-value">{cur.label}</span>
        <motion.svg viewBox="0 0 12 12" width="12" height="12" animate={{ rotate: open ? 180 : 0 }} aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></motion.svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-labelledby="range-label"
            className="dropdown-list"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {RANGES.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={r.id === value}
                  className={r.id === value ? 'is-on' : ''}
                  onClick={() => {
                    onChange(r.id);
                    setOpen(false);
                  }}
                >
                  {r.label}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function TopicComparisonSection() {
  const ref = useRef(null);
  const [range, setRange] = useState('6m');
  const [topicId, setTopicId] = useState('food');
  const [shown, setShown] = useState(false);
  const reduce = useReducedMotion();
  const topics = useMemo(() => topicsFor(range), [range]);
  const t = topics.find((x) => x.id === topicId);

  useSectionMotion(ref, ({ reduce: rm, isDesktop, root }) => {
    const q = gsap.utils.selector(root);
    const surface = q('.surface')[0];
    if (!rm) {
      // The light analytics surface opens up from the bottom-centre over the dark forest.
      gsap.fromTo(
        surface,
        { clipPath: isDesktop ? 'inset(14% 22% 0% 22% round 64px 64px 0 0)' : 'inset(6% 6% 0% 6% round 32px 32px 0 0)' },
        { clipPath: 'inset(0% 0% 0% 0% round 0px 0px 0 0)', ease: 'none', scrollTrigger: { trigger: root, start: 'top bottom', end: 'top 15%', scrub: 0.5 } },
      );
    }
    enter(q('.cmp-head > *'), { from: 'bottom', trigger: q('.cmp-head')[0], stagger: 0.08, reduce: rm, distance: 0.5 });
    enter(q('.topic-row'), { from: 'left', trigger: q('.topic-list')[0], stagger: 0.06, reduce: rm, distance: 0.5, duration: 0.9 });
    enter(q('.cmp-viz'), { from: 'right', trigger: q('.cmp-viz')[0], reduce: rm, distance: 0.8 });
    ScrollTrigger.create({ trigger: q('.cmp-viz')[0], start: 'top 75%', once: true, onEnter: () => setShown(true) });
  });

  const rows = [
    { label: DEMO_HOTEL.name, value: t.you, you: true },
    ...t.peers.map((v, i) => ({ label: PEER_NAMES[i], value: v })),
  ];

  return (
    <section ref={ref} id="insights" tabIndex={-1} className="cmp" aria-labelledby="cmp-title">
      <div className="surface">
        <div className="wrap">
          <div className="cmp-head">
            <div>
              <p className="eyebrow eyebrow-light">03 — Topic by topic</p>
              <h2 id="cmp-title" className="display">Know where you win. <em>Know what to fix.</em></h2>
            </div>
            <RangeDropdown value={range} onChange={setRange} />
          </div>

          <div className="cmp-grid">
            <div className="topic-list" role="tablist" aria-label="Topics" aria-orientation="vertical">
              <LayoutGroup id="topics">
                {topics.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    role="tab"
                    aria-selected={x.id === topicId}
                    aria-controls="cmp-panel"
                    className={`topic-row ${x.id === topicId ? 'is-on' : ''}`}
                    onClick={() => setTopicId(x.id)}
                  >
                    {x.id === topicId && <motion.span layoutId="topic-hl" className="topic-hl" transition={{ type: 'spring', stiffness: 320, damping: 32 }} />}
                    <span className="topic-name">{x.label}</span>
                    <span className={`status status-${x.status}`}>
                      <span aria-hidden="true">{STATUS_ICON[x.status]}</span> {STATUS_LABEL[x.status]}
                    </span>
                    <span className="topic-score" aria-label={`Score ${x.you}`}>{x.you}</span>
                  </button>
                ))}
              </LayoutGroup>
            </div>

            <div className="cmp-viz" id="cmp-panel" role="tabpanel" aria-label={`${t.label} compared with nearby hotels`}>
              <div className="cmp-viz-head">
                <div>
                  <p className="cmp-topic">{t.label}</p>
                  <p className="cmp-gap">
                    <span className="cmp-gap-num">{t.gap > 0 ? '+' : ''}{t.gap}</span>
                    <span className="cmp-gap-k">points vs competitor median ({t.median})</span>
                  </p>
                </div>
                <span className={`status status-${t.status} status-lg`}>
                  <span aria-hidden="true">{STATUS_ICON[t.status]}</span> {STATUS_LABEL[t.status]}
                </span>
              </div>
              <ComparisonBars rows={shown ? rows : rows.map((r) => ({ ...r, value: 0 }))} caption={`Guest sentiment score, 0–100 · ${t.mentions} mentions of your hotel · ${RANGES.find((r) => r.id === range).label}`} />
              <p className="sr-only">
                {DEMO_HOTEL.name} scores {t.you} on {t.label}; the competitor median is {t.median}. Status: {STATUS_LABEL[t.status]}.
              </p>

              <div className="evidence">
                <AnimatePresence mode="popLayout" initial={false}>
                  {t.quotes.map((qt, i) => (
                    <motion.blockquote
                      key={`${t.id}-${range}-${i}`}
                      className="evidence-quote"
                      initial={reduce ? { opacity: 0 } : { opacity: 0, x: -60 - i * 30, rotate: -2 }}
                      animate={{ opacity: 1, x: 0, rotate: 0 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 40, transition: { duration: 0.2 } }}
                      transition={{ type: 'spring', stiffness: 140, damping: 20, delay: reduce ? 0 : i * 0.08 }}
                    >
                      “{qt}”
                    </motion.blockquote>
                  ))}
                  <motion.p
                    key={`${t.id}-rec`}
                    className="evidence-rec"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, delay: reduce ? 0 : 0.15 }}
                  >
                    <strong>Next step:</strong> {t.rec}
                  </motion.p>
                </AnimatePresence>
              </div>
              <DemoTag />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
