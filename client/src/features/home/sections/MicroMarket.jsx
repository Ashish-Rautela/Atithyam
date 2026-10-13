import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Segmented } from '../../../ui/kit.jsx';
import { AspectIcon } from '../../../ui/icons.jsx';
import { CLUSTERS, ASPECT_COLUMNS, RANGES, clusterMatrix } from '../data/homeDemo.js';
import { DemoNote, Head, Reveal } from './parts.jsx';

const ASPECT_KEY = { food: 'food', room: 'room', clean: 'cleanliness', staff: 'staff', location: 'location', value: 'value', housekeeping: 'housekeeping', booking: 'booking' };
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
function cellStyle(v) {
  const d = (v - 50) / 50;
  const pole = d >= 0 ? 'var(--color-div-pos)' : 'var(--color-div-neg)';
  const pct = Math.round(Math.min(1, Math.abs(d) * 1.25) * 88);
  return { background: `color-mix(in oklab, ${pole} ${pct}%, var(--color-div-mid))`, color: pct > 52 ? '#fff' : 'var(--color-ink)' };
}

/** Cluster heatmap: every hotel of a micro-market × eight topics, with hotel / topic drill-down. */
export default function MicroMarket() {
  const reduce = useReducedMotion();
  const [clusterId, setClusterId] = useState(CLUSTERS[0].id);
  const [range, setRange] = useState('6m');
  const [focus, setFocus] = useState({ type: 'aspect', id: null });
  const cluster = CLUSTERS.find((c) => c.id === clusterId);
  const rows = useMemo(() => clusterMatrix(cluster, range), [cluster, range]);
  const medians = useMemo(() => ASPECT_COLUMNS.map((_, k) => median(rows.map((r) => r.scores[k]))), [rows]);
  const weakIdx = medians.indexOf(Math.min(...medians));
  const aspectIdx = focus.type === 'aspect' ? (focus.id ?? weakIdx) : null;
  const hotelIdx = focus.type === 'hotel' ? focus.id : null;

  let side;
  if (hotelIdx !== null) {
    const r = rows[hotelIdx];
    const gaps = ASPECT_COLUMNS.map((c, k) => ({ ...c, gap: r.scores[k] - medians[k] }));
    side = { kind: 'hotel', title: r.name, sub: `${r.reviews.toLocaleString('en-IN')} reviews · vs ${rows.length - 1} neighbours`, leads: gaps.filter((g) => g.gap >= 7).sort((a, b) => b.gap - a.gap), lags: gaps.filter((g) => g.gap <= -7).sort((a, b) => a.gap - b.gap) };
  } else {
    const c = ASPECT_COLUMNS[aspectIdx];
    const vals = rows.map((r) => ({ name: r.name, v: r.scores[aspectIdx] })).sort((a, b) => b.v - a.v);
    const weak = vals.filter((x) => x.v < 50).length;
    side = { kind: 'aspect', title: c.label, id: c.id, sub: `Median ${medians[aspectIdx]} across ${rows.length} hotels`, vals, weak, marketWide: weak >= Math.ceil(rows.length / 2) };
  }

  return (
    <section id="insights" className="bg-ivory py-20 sm:py-28" aria-labelledby="mm-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div id="mm-title"><Head eyebrow="03 · Micro-market benchmark" title="Every hotel, scored against" accent="its own neighbourhood." /></div>
          <Reveal from="right">
            <Segmented id="mm-range" ariaLabel="Reporting period" size="sm" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.id, label: r.label }))} />
          </Reveal>
        </div>

        <Reveal from="up" className="mt-8 flex gap-2 overflow-x-auto pb-1">
          {CLUSTERS.map((c) => (
            <button key={c.id} type="button" onClick={() => { setClusterId(c.id); setFocus({ type: 'aspect', id: null }); }} aria-pressed={c.id === clusterId}
              className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold transition ${c.id === clusterId ? 'bg-forest text-white shadow-card' : 'bg-white text-pine ring-1 ring-line hover:ring-forest/40'}`}>
              {c.name} <span className="font-medium opacity-75">· {c.town}</span>
            </button>
          ))}
        </Reveal>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_0.8fr]">
          <Reveal from="up-left" className="rounded-[2rem] bg-white p-4 shadow-card ring-1 ring-line sm:p-6">
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[640px] border-separate border-spacing-1 text-sm">
                <caption className="sr-only">Guest sentiment by topic for hotels in {cluster.name}, {cluster.town} (0–100, 50 = balanced). Select a hotel or topic.</caption>
                <thead>
                  <tr>
                    <th scope="col" className="px-2 text-left text-[0.68rem] font-extrabold tracking-[0.12em] text-slate uppercase">Hotel</th>
                    {ASPECT_COLUMNS.map((c, k) => (
                      <th key={c.id} scope="col">
                        <button type="button" onClick={() => setFocus({ type: 'aspect', id: k })} aria-pressed={aspectIdx === k}
                          className={`flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-xl px-1 text-[0.7rem] font-extrabold transition ${aspectIdx === k ? 'bg-pine text-white' : 'text-slate hover:bg-mist'}`}>
                          <AspectIcon aspect={ASPECT_KEY[c.id]} className="size-4" />
                          <span className="leading-tight">{c.short.replace('­', '')}{k === weakIdx && <span className="text-div-neg"> ●</span>}</span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, h) => (
                    <tr key={r.name}>
                      <th scope="row" className="text-left">
                        <button type="button" onClick={() => setFocus({ type: 'hotel', id: h })} aria-pressed={hotelIdx === h}
                          className={`min-h-10 w-full rounded-xl px-2.5 text-left font-bold whitespace-nowrap transition ${hotelIdx === h ? 'bg-pine text-white' : 'text-ink hover:bg-mist'}`}>{r.name}</button>
                      </th>
                      {r.scores.map((v, k) => (
                        <td key={k}>
                          <motion.span
                            className={`num grid h-10 place-items-center rounded-xl font-bold ${aspectIdx === k ? 'ring-2 ring-amber' : ''} ${hotelIdx === h ? 'ring-2 ring-pine' : ''}`}
                            style={cellStyle(v)}
                            initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4, delay: reduce ? 0 : (h + k) * 0.025 }}
                            title={`${r.name} · ${ASPECT_COLUMNS[k].label}: ${v}`}
                          >{v}</motion.span>
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="px-2.5 text-left text-xs font-bold text-slate">Market median</th>
                    {medians.map((m, k) => <td key={k} className="num h-9 border-t-2 border-dashed border-line text-center text-xs font-extrabold text-slate">{m}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-bold text-slate">
              <span>More complaints</span>
              <i className="h-2.5 w-28 rounded-full bg-linear-to-r from-div-neg via-div-mid to-div-pos" />
              <span>More praise</span>
              <span className="ml-auto font-medium">50 = as much praise as complaint</span>
            </div>
          </Reveal>

          <Reveal from="right" className="rounded-[2rem] bg-pine p-6 text-mist shadow-lift">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={`${clusterId}-${range}-${focus.type}-${focus.id}`} initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.3 }} aria-live="polite">
                {side.kind === 'aspect' ? (
                  <>
                    <p className="eyebrow text-amber">{side.marketWide ? '● Weak across the market' : 'Topic across the micro-market'}</p>
                    <h3 className="mt-2 flex items-center gap-2 font-serif text-3xl text-white"><AspectIcon aspect={ASPECT_KEY[side.id]} className="size-6 text-amber" />{side.title}</h3>
                    <p className="mt-1 text-sm text-glacier">{side.sub}</p>
                    <ul className="mt-5 space-y-2.5">
                      {side.vals.map((x) => (
                        <li key={x.name} className="grid grid-cols-[1fr_90px_2rem] items-center gap-3 text-sm">
                          <span className="truncate">{x.name}</span>
                          <span className="relative h-2 overflow-hidden rounded bg-white/12"><motion.span className="absolute inset-0 origin-left rounded" style={{ background: x.v < 50 ? 'var(--color-div-neg)' : 'var(--color-div-pos)' }} initial={false} animate={{ scaleX: x.v / 100 }} /></span>
                          <span className="num text-right font-bold">{x.v}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-5 text-sm text-mist/85">{side.marketWide ? `${side.weak} of ${rows.length} hotels get more complaints than praise here — a condition of the market. The first hotel to fix it stands out.` : `${side.weak} of ${rows.length} hotels are below balance. Select a hotel to see where it leads and lags.`}</p>
                  </>
                ) : (
                  <>
                    <p className="eyebrow text-amber">Hotel vs its micro-market</p>
                    <h3 className="mt-2 font-serif text-3xl text-white">{side.title}</h3>
                    <p className="mt-1 text-sm text-glacier">{side.sub}</p>
                    <div className="mt-5 grid grid-cols-2 gap-4">
                      {[['Leads on', side.leads, 'text-[#8fd3b0]', '+'], ['Lags on', side.lags, 'text-[#f0b48a]', '']].map(([k, list, cls, sign]) => (
                        <div key={k}>
                          <p className={`eyebrow mb-2 ${cls}`}>{k}</p>
                          {list.length ? list.map((g) => (
                            <p key={g.id} className="flex justify-between border-b border-white/10 py-1.5 text-sm"><span>{g.label}</span><strong className="num">{sign}{g.gap}</strong></p>
                          )) : <p className="text-sm text-mist/60">Nothing clear</p>}
                        </div>
                      ))}
                    </div>
                    <p className="mt-5 text-sm text-mist/85">Points vs the micro-market median. In the product, every gap comes with the guest quotes behind it.</p>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
            <DemoNote light>Illustrative · fictional hotels</DemoNote>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
