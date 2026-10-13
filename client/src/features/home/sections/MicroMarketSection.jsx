import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { DemoTag } from '../components/ui.jsx';
import { gsap, useSectionMotion, enter } from '../motion/motion.js';
import { CLUSTERS, ASPECT_COLUMNS, RANGES, clusterMatrix } from '../data/homeDemo.js';

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Diverging fill around 50 (balanced): warm = more complaints, cool = more praise. Numbers stay visible. */
function cellStyle(v) {
  const d = (v - 50) / 50;
  const pole = d >= 0 ? 'var(--div-pos)' : 'var(--div-neg)';
  const pct = Math.round(Math.min(1, Math.abs(d) * 1.25) * 88);
  return { background: `color-mix(in oklab, ${pole} ${pct}%, var(--div-mid))`, color: pct > 52 ? '#fff' : 'var(--ink)' };
}

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
          <motion.ul role="listbox" aria-labelledby="range-label" className="dropdown-list"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {RANGES.map((r) => (
              <li key={r.id}>
                <button type="button" role="option" aria-selected={r.id === value} className={r.id === value ? 'is-on' : ''} onClick={() => { onChange(r.id); setOpen(false); }}>
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

export default function MicroMarketSection() {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const [clusterId, setClusterId] = useState(CLUSTERS[0].id);
  const [range, setRange] = useState('6m');
  const [focus, setFocus] = useState({ type: 'aspect', id: null }); // null aspect = the market-wide weakness
  const cluster = CLUSTERS.find((c) => c.id === clusterId);
  const rows = useMemo(() => clusterMatrix(cluster, range), [cluster, range]);
  const medians = useMemo(() => ASPECT_COLUMNS.map((_, k) => median(rows.map((r) => r.scores[k]))), [rows]);
  const weakIdx = medians.indexOf(Math.min(...medians));
  const aspectIdx = focus.type === 'aspect' ? (focus.id ?? weakIdx) : null;
  const hotelIdx = focus.type === 'hotel' ? focus.id : null;

  useSectionMotion(ref, ({ reduce: rm, isDesktop, root }) => {
    const q = gsap.utils.selector(root);
    if (!rm) {
      gsap.fromTo(
        q('.surface')[0],
        { clipPath: isDesktop ? 'inset(14% 22% 0% 22% round 64px 64px 0 0)' : 'inset(6% 6% 0% 6% round 32px 32px 0 0)' },
        { clipPath: 'inset(0% 0% 0% 0% round 0px 0px 0 0)', ease: 'none', scrollTrigger: { trigger: root, start: 'top bottom', end: 'top 15%', scrub: 0.5 } },
      );
      // Cells fill in as a diagonal wave across the grid.
      gsap.from(q('.hm-cell'), { scale: 0.4, opacity: 0, duration: 0.5, ease: 'back.out(1.6)', stagger: { each: 0.018, grid: 'auto', from: 'start' }, scrollTrigger: { trigger: q('.heat')[0], start: 'top 75%', once: true } });
    }
    enter(q('.cmp-head > *'), { from: 'bottom', trigger: q('.cmp-head')[0], stagger: 0.08, reduce: rm, distance: 0.5 });
    enter(q('.cluster-chips button'), { from: 'left', trigger: q('.cluster-chips')[0], stagger: 0.05, reduce: rm, distance: 0.4, duration: 0.8 });
    enter(q('.mm-side'), { from: 'right', trigger: q('.heat')[0], reduce: rm, distance: 0.8 });
  });

  const side = hotelIdx !== null
    ? (() => {
        const r = rows[hotelIdx];
        const gaps = ASPECT_COLUMNS.map((c, k) => ({ ...c, v: r.scores[k], gap: r.scores[k] - medians[k] }));
        const leads = gaps.filter((g) => g.gap >= 7).sort((a, b) => b.gap - a.gap);
        const lags = gaps.filter((g) => g.gap <= -7).sort((a, b) => a.gap - b.gap);
        return { kind: 'hotel', title: r.name, sub: `${r.reviews.toLocaleString('en-IN')} reviews · vs ${rows.length - 1} neighbours`, leads, lags };
      })()
    : (() => {
        const c = ASPECT_COLUMNS[aspectIdx];
        const vals = rows.map((r) => ({ name: r.name, v: r.scores[aspectIdx] }));
        const weak = vals.filter((x) => x.v < 50).length;
        return { kind: 'aspect', title: c.label, sub: `Median ${medians[aspectIdx]} across ${rows.length} hotels`, vals, weak, marketWide: weak >= Math.ceil(rows.length / 2) };
      })();

  return (
    <section ref={ref} id="insights" tabIndex={-1} className="cmp" aria-labelledby="mm-title">
      <div className="surface">
        <div className="wrap">
          <div className="cmp-head">
            <div>
              <p className="eyebrow eyebrow-light">03 — Micro-market benchmark</p>
              <h2 id="mm-title" className="display display-wide">Every hotel, scored against <em>its own neighbourhood.</em></h2>
            </div>
            <RangeDropdown value={range} onChange={setRange} />
          </div>

          <div className="cluster-chips" role="tablist" aria-label="Micro-market">
            <LayoutGroup id="clusters">
              {CLUSTERS.map((c) => (
                <button key={c.id} type="button" role="tab" aria-selected={c.id === clusterId} className={c.id === clusterId ? 'is-on' : ''}
                  onClick={() => { setClusterId(c.id); setFocus({ type: 'aspect', id: null }); }}>
                  {c.id === clusterId && <motion.span layoutId="cluster-pill" className="chip-pill" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                  <span className="chip-text"><strong>{c.name}</strong> · {c.town}</span>
                </button>
              ))}
            </LayoutGroup>
          </div>

          <div className="mm-grid">
            <div className="heat">
              <table className="heat-table">
                <caption className="sr-only">Guest sentiment by topic for hotels in the {cluster.name}, {cluster.town} micro-market (0–100, 50 = balanced). Select a hotel or a topic for details.</caption>
                <thead>
                  <tr>
                    <th scope="col" className="heat-corner">Hotel</th>
                    {ASPECT_COLUMNS.map((c, k) => (
                      <th key={c.id} scope="col">
                        <button type="button" className={`heat-col ${aspectIdx === k ? 'is-on' : ''} ${k === weakIdx ? 'is-weak' : ''}`} onClick={() => setFocus({ type: 'aspect', id: k })} aria-pressed={aspectIdx === k}>
                          {c.short}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, h) => (
                    <tr key={r.name} className={hotelIdx === h ? 'is-on' : ''}>
                      <th scope="row">
                        <button type="button" className="heat-row" onClick={() => setFocus({ type: 'hotel', id: h })} aria-pressed={hotelIdx === h}>{r.name}</button>
                      </th>
                      {r.scores.map((v, k) => (
                        <td key={k} className={`${aspectIdx === k ? 'col-on' : ''}`}>
                          <span className="hm-cell" style={cellStyle(v)} title={`${r.name} · ${ASPECT_COLUMNS[k].label}: ${v}`}>{v}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="heat-median">
                    <th scope="row">Market median</th>
                    {medians.map((m, k) => <td key={k}><span className="hm-med">{m}</span></td>)}
                  </tr>
                </tbody>
              </table>
              <div className="heat-legend" aria-hidden="true">
                <span>More complaints</span>
                <i className="heat-ramp" />
                <span>More praise</span>
                <span className="heat-legend-note">50 = as much praise as complaint</span>
              </div>
            </div>

            <aside className="mm-side" aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`${clusterId}-${range}-${focus.type}-${focus.id}`}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: -20 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  {side.kind === 'aspect' ? (
                    <>
                      <p className="mm-k">{side.marketWide ? '● Weak across the market' : 'Topic across the micro-market'}</p>
                      <h3 className="mm-title">{side.title}</h3>
                      <p className="mm-sub">{side.sub}</p>
                      <ul className="mm-bars">
                        {[...side.vals].sort((a, b) => b.v - a.v).map((x) => (
                          <li key={x.name}>
                            <span className="mm-bar-name">{x.name}</span>
                            <span className="mm-bar-track"><motion.span className="mm-bar-fill" initial={false} animate={{ scaleX: x.v / 100 }} style={{ background: x.v < 50 ? 'var(--div-neg)' : 'var(--div-pos)' }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 110, damping: 20 }} /></span>
                            <span className="mm-bar-v">{x.v}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mm-note">
                        {side.marketWide
                          ? `${side.weak} of ${rows.length} hotels get more complaints than praise here — a condition of the market. The first hotel to fix it stands out.`
                          : `${side.weak} of ${rows.length} hotels are below balance. Select a hotel to see where it leads and lags.`}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mm-k">Hotel vs its micro-market</p>
                      <h3 className="mm-title">{side.title}</h3>
                      <p className="mm-sub">{side.sub}</p>
                      <div className="mm-split">
                        <div>
                          <p className="mm-split-k good">Leads on</p>
                          {side.leads.length ? side.leads.map((g) => <p key={g.id} className="mm-gap">{g.label} <strong>+{g.gap}</strong></p>) : <p className="mm-gap muted">Nothing clearly ahead</p>}
                        </div>
                        <div>
                          <p className="mm-split-k bad">Lags on</p>
                          {side.lags.length ? side.lags.map((g) => <p key={g.id} className="mm-gap">{g.label} <strong>{g.gap}</strong></p>) : <p className="mm-gap muted">Nothing clearly behind</p>}
                        </div>
                      </div>
                      <p className="mm-note">Points vs the micro-market median. In the product every gap comes with the guest quotes that explain it.</p>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
              <DemoTag>Illustrative · fictional hotels</DemoTag>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
