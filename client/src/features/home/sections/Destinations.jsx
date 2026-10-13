import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Button, MountainPhoto, Segmented } from '../../../ui/kit.jsx';
import { AipanBorder } from '../../../ui/aipan.jsx';
import { Icon } from '../../../ui/icons.jsx';
import RegionMap from '../components/RegionMap.jsx';
import { DESTINATION_SETS, ALERTS, SEVERITY } from '../data/homeDemo.js';
import { DemoNote, Head, Reveal } from './parts.jsx';

/** Early warnings for a hotel (three sample alerts). */
export function Warnings() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const a = ALERTS[active];
  const sevTone = { high: 'bg-bad-bg text-bad', medium: 'bg-warn-bg text-warn', positive: 'bg-good-bg text-good' };
  return (
    <section className="relative isolate overflow-hidden bg-pine py-20 text-mist sm:py-28" aria-labelledby="warn-title">
      <div className="absolute inset-0 -z-10 opacity-30"><MountainPhoto position="50% 70%" /></div>
      <div className="absolute inset-0 -z-10 bg-linear-to-r from-pine via-pine/90 to-pine/60" />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div id="warn-title">
          <Head light eyebrow="04 · Early warnings" title="Catch problems" accent="before they become bad reviews." deva="समय पर चेतावनी" desc="A handful of guests mentioning the same thing is a signal. We compare the last few weeks with the months before, so a new problem shows up while it is still small — with the reviews that prove it." />
        </div>
        <div>
          <div className="grid gap-3">
            {ALERTS.map((al, i) => (
              <Reveal key={al.id} from={i % 2 ? 'right' : 'up-right'} delay={i * 0.08}>
                <button type="button" onClick={() => setActive(i)} aria-pressed={i === active}
                  className={`w-full rounded-3xl p-5 text-left transition ${i === active ? 'bg-ivory text-ink shadow-lift' : 'bg-white/8 text-mist ring-1 ring-white/15 hover:bg-white/12'}`}>
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.72rem] font-extrabold tracking-wider uppercase ${sevTone[al.severity]}`}><i className="size-1.5 rounded-full bg-current" />{SEVERITY[al.severity].label}</span>
                    <span className={`text-xs font-bold ${i === active ? 'text-slate' : 'text-mist/60'}`}>{al.topic} · {al.period}</span>
                  </span>
                  <span className={`mt-2 block font-serif text-xl leading-snug ${i === active ? 'text-pine' : 'text-white'}`}>{al.title}</span>
                </button>
              </Reveal>
            ))}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={a.id} initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
              className="mt-4 rounded-3xl bg-white/6 p-5 ring-1 ring-white/12" aria-live="polite">
              <p className="eyebrow text-glacier">{a.count} supporting reviews</p>
              <ul className="mt-3 space-y-2.5">
                {a.evidence.map((e) => (
                  <li key={e.date + e.text} className="border-l-2 border-amber pl-3 text-sm">
                    <span className="block text-[0.68rem] font-extrabold tracking-wider text-mist/60 uppercase">{e.date} · {e.platform}</span>
                    <span className="font-serif text-base text-white italic">“{e.text}”</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>
          <DemoNote light>Sample alerts · not real detections</DemoNote>
        </div>
      </div>
    </section>
  );
}

/** Destination view for tourism boards: the state map, then town-wide issues per town. */
export function Destinations() {
  const reduce = useReducedMotion();
  const [town, setTown] = useState('mussoorie');
  const set = DESTINATION_SETS[town];
  const [sel, setSel] = useState(set.issues[0].id);
  const iss = set.issues.find((x) => x.id === sel) ?? set.issues[0];
  const max = Math.max(...set.issues.map((x) => x.complaints));

  return (
    <section id="destinations" className="bg-mist py-20 sm:py-28" aria-labelledby="dest-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div id="dest-title"><Head eyebrow="05 · For tourism boards" title="See the problems" accent="no single hotel can solve." deva="देवभूमि की हर मंज़िल" /></div>
          <Reveal from="right"><Button to="/seeding" variant="primary" icon="arrowRight">Explore destinations</Button></Reveal>
        </div>

        <Reveal from="up" className="mt-10"><RegionMap /></Reveal>

        <div className="mt-12 overflow-hidden rounded-[2rem] bg-white shadow-card ring-1 ring-line">
          <div className="relative isolate sm:h-44">
            <div className="absolute inset-0 -z-10"><MountainPhoto position="50% 45%" /></div>
            <div className="absolute inset-0 -z-10 bg-linear-to-r from-pine/90 via-pine/55 to-pine/10" />
            <div className="flex flex-col items-start justify-end gap-3 p-5 pb-8 sm:absolute sm:inset-0 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:p-7">
              <div>
                <p className="eyebrow text-amber">Town-wide view</p>
                <p className="font-serif text-3xl text-white sm:text-4xl">What visitors to {set.name} run into</p>
              </div>
              <Segmented id="dest-town" ariaLabel="Destination" size="sm" value={town} onChange={(t) => { setTown(t); setSel(DESTINATION_SETS[t].issues[0].id); }} options={Object.entries(DESTINATION_SETS).map(([id, t]) => ({ value: id, label: t.name }))} className="bg-white/90" />
            </div>
            <div className="absolute inset-x-0 bottom-0"><AipanBorder height={14} /></div>
          </div>
          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_1fr]">
            <ul className="space-y-2">
              {set.issues.map((x) => (
                <li key={`${town}-${x.id}`}>
                  <button type="button" onClick={() => setSel(x.id)} aria-pressed={x.id === iss.id}
                    className={`grid min-h-12 w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 rounded-2xl px-4 py-3 text-left transition ${x.id === iss.id ? 'bg-pine text-white' : 'hover:bg-mist'}`}>
                    <span className="font-bold">{x.label}</span>
                    <span className={`num text-sm font-bold ${x.id === iss.id ? 'text-amber' : 'text-geru'}`}>{x.complaints}</span>
                    <span className={`col-span-2 h-1.5 overflow-hidden rounded-full ${x.id === iss.id ? 'bg-white/15' : 'bg-parchment'}`}>
                      <span className="block h-full rounded-full bg-geru" style={{ width: `${(x.complaints / max) * 100}%` }} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={`${town}-${iss.id}`} initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} aria-live="polite">
                <p className="font-serif text-3xl text-pine">{iss.label}</p>
                <p className="mt-1 flex items-center gap-2 text-sm font-bold text-amber-ink"><Icon name="clock" className="size-4" /> {iss.trend}</p>
                <dl className="mt-5 grid grid-cols-3 gap-3">
                  {[['Complaints', iss.complaints], ['Hotels', iss.hotels], ['Reviews read', iss.reviews]].map(([k, v]) => (
                    <div key={k} className="rounded-2xl bg-ivory p-3 ring-1 ring-line">
                      <dt className="text-[0.66rem] font-extrabold tracking-[0.1em] text-slate uppercase">{k}</dt>
                      <dd className="num mt-1 font-serif text-2xl text-pine">{v.toLocaleString('en-IN')}</dd>
                    </div>
                  ))}
                </dl>
                <ul className="mt-5 space-y-2">
                  {iss.quotes.map((q) => <li key={q} lang={/[ऀ-ॿ]/.test(q) ? 'hi' : undefined} className="border-l-2 border-geru pl-3 font-serif text-lg text-pine italic">“{q}”</li>)}
                </ul>
                <p className="mt-5 text-sm text-slate">Guest feedback helps a tourism board see and prioritise town-wide issues; fixing them stays with the people who run the town.</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <DemoNote>Illustrative figures</DemoNote>
      </div>
    </section>
  );
}
