import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Badge } from '../../../ui/kit.jsx';
import { Icon } from '../../../ui/icons.jsx';
import { REGION_DESTINATIONS, REGION_BOUNDS } from '../data/homeDemo.js';
import { useLiveCoverage } from './useLiveCoverage.js';

const MW = 520;
const MH = 380;
const PAD = 34;
const project = ({ lat, lng }) => {
  const { latMin, latMax, lngMin, lngMax } = REGION_BOUNDS;
  return { x: PAD + ((lng - lngMin) / (lngMax - lngMin)) * (MW - PAD * 2), y: PAD + ((latMax - lat) / (latMax - latMin)) * (MH - PAD * 2) };
};
function blob(cx, cy, rx, ry, seed, wob = 0.1) {
  let d = '';
  for (let a = 0; a <= 28; a++) {
    const t = (a / 28) * Math.PI * 2;
    const w = 1 + wob * Math.sin(t * 3 + seed) + wob * 0.6 * Math.cos(t * 5 + seed * 1.7);
    d += `${a ? 'L' : 'M'}${(cx + Math.cos(t) * rx * w).toFixed(1)},${(cy + Math.sin(t) * ry * w).toFixed(1)} `;
  }
  return `${d}Z`;
}

/**
 * Stylised map of Uttarakhand's hill destinations (positions from real coordinates; terrain is
 * decorative). Selecting a pin shows the town — live counts when it has been seeded, otherwise a
 * clearly labelled example profile.
 */
export default function RegionMap() {
  const reduce = useReducedMotion();
  const live = useLiveCoverage();
  const [sel, setSel] = useState('mussoorie');
  const pins = useMemo(() => REGION_DESTINATIONS.map((d) => ({ ...d, ...project(d) })), []);
  const d = pins.find((p) => p.id === sel);
  const liveCity = live.byName.get(d.name.toLowerCase());
  const terrain = useMemo(() => [blob(170, 150, 150, 105, 1), blob(170, 150, 112, 76, 2), blob(170, 150, 72, 48, 3), blob(380, 250, 120, 92, 4), blob(380, 250, 84, 62, 5), blob(380, 250, 48, 34, 6)], []);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
      <div className="relative overflow-hidden rounded-[2rem] bg-white p-3 shadow-card ring-1 ring-line sm:p-4">
        <div className="relative aspect-[520/380]">
          <svg viewBox={`0 0 ${MW} ${MH}`} className="absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
            <rect width={MW} height={MH} rx="22" fill="#eef4ef" />
            <path d="M120,0 L150,26 L172,10 L198,34 L226,8 L252,30 L282,4 L314,28 L344,12 L376,40 L404,18 L436,46 L470,24 L520,52 L520,0 Z" fill="#fff" stroke="#c8dde5" />
            {terrain.map((p, i) => <path key={i} d={p} fill="none" stroke="#1d5746" strokeOpacity="0.18" />)}
            <path d="M188,58 C200,92 214,118 205,150 S182,212 176,236 S168,262 160,276" fill="none" stroke="#7fb3c8" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M300,200 C330,230 360,262 352,300" fill="none" stroke="#7fb3c8" strokeWidth="1.8" strokeLinecap="round" opacity="0.7" />
            <text x="92" y="236" fontFamily="Fraunces Variable, serif" fontStyle="italic" fontSize="15" letterSpacing="4" fill="#1d5746" opacity="0.35">GARHWAL</text>
            <text x="330" y="356" fontFamily="Fraunces Variable, serif" fontStyle="italic" fontSize="15" letterSpacing="4" fill="#1d5746" opacity="0.35">KUMAON</text>
            <path d={`M${pins.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' L')}`} fill="none" stroke="#e8a15a" strokeWidth="1.4" strokeDasharray="2 5" opacity="0.6" />
          </svg>
          {pins.map((p) => {
            const on = p.id === sel;
            const seeded = live.byName.has(p.name.toLowerCase());
            return (
              <button key={p.id} type="button" onClick={() => setSel(p.id)} aria-pressed={on} aria-label={`${p.name}, ${p.region}`}
                className="group absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center" style={{ left: `${(p.x / MW) * 100}%`, top: `${(p.y / MH) * 100}%`, zIndex: on ? 3 : 1 }}>
                <span className={`size-3.5 rounded-full ring-[3px] ring-white shadow transition ${on ? 'scale-150 bg-geru' : seeded ? 'bg-good' : 'bg-forest'} group-hover:scale-125`} />
                <span className={`pointer-events-none absolute top-[calc(100%-6px)] left-1/2 -translate-x-1/2 rounded-md px-1.5 text-[0.68rem] font-extrabold whitespace-nowrap transition ${on ? 'bg-pine text-white opacity-100' : 'bg-white/90 text-pine opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}>{p.name}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs font-semibold text-slate">
          <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-forest" /> Hill destination</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-good" /> Seeded in your database</span>
          <span className="ml-auto">Select a town</span>
        </p>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={d.id} initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.3 }}
          className="relative flex flex-col overflow-hidden rounded-[2rem] bg-geru p-6 text-rice shadow-lift" aria-live="polite">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow text-amber">{d.region} · {d.kind}</p>
              <h3 className="mt-1 font-serif text-4xl text-white">{d.name}</h3>
            </div>
            <Badge tone="dark">{liveCity ? 'Seeded' : 'Example'}</Badge>
          </div>
          <dl className="mt-6 grid grid-cols-3 gap-3">
            {[['Hotels', liveCity ? liveCity.stats.hotels : d.hotels], ['Reviews', liveCity ? liveCity.stats.reviews : d.reviews], ['Micro-markets', liveCity ? liveCity.stats.clusters : Math.max(2, Math.round(d.hotels / 30))]].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-white/10 p-3">
                <dt className="text-[0.66rem] font-extrabold tracking-[0.1em] text-rice/70 uppercase">{k}</dt>
                <dd className="num mt-1 font-serif text-2xl text-white">{Number(v).toLocaleString('en-IN')}</dd>
              </div>
            ))}
          </dl>
          {liveCity ? (
            <Link to={`/seeding/${liveCity.cityId}/destination`} className="mt-6 inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-rice px-5 font-bold text-geru hover:bg-white">
              Open the {d.name} view <Icon name="arrowRight" className="size-4" />
            </Link>
          ) : (
            <>
              <div className="mt-5 space-y-2 text-sm">
                <p className="flex items-center gap-2"><Icon name="trendUp" className="size-4 text-amber" /> Most praised: <strong>{d.praise}</strong></p>
                <p className="flex items-center gap-2"><Icon name="trendDown" className="size-4 text-amber" /> Most raised: <strong>{d.complaint}</strong></p>
              </div>
              <p className="mt-auto pt-5 text-xs text-rice/70">Example profile — seed {d.name} to see real figures.</p>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
