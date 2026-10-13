import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Button, MountainPhoto } from '../../../ui/kit.jsx';
import { AipanMandala } from '../../../ui/aipan.jsx';
import { Icon } from '../../../ui/icons.jsx';
import { useLiveCoverage } from '../components/useLiveCoverage.js';
import { PS_METRICS, HOW_STEPS, IMPACT } from '../data/homeDemo.js';
import { DemoNote, Head, Reveal } from './parts.jsx';

const METRIC_ICON = { analysed: 'quote', detect: 'clock', position: 'chart', movement: 'trendUp', benchmarked: 'hotel', evidence: 'check' };

/** Did your changes work? A before/after chart around a logged change (illustrative). */
export function Impact() {
  const [cp, setCp] = useState('m3');
  const reduce = useReducedMotion();
  const check = IMPACT.checkpoints.find((c) => c.id === cp);
  const avg = (a, [s, e]) => Math.round(a.slice(s, e + 1).reduce((x, y) => x + y, 0) / (e - s + 1));
  const sum = (a, [s, e]) => a.slice(s, e + 1).reduce((x, y) => x + y, 0);
  const before = IMPACT.checkpoints[0].range;
  const delta = avg(IMPACT.score, check.range) - avg(IMPACT.score, before);
  const W = 720;
  const H = 240;
  const P = { l: 32, r: 12, t: 16, b: 28 };
  const x = (i) => P.l + (i * (W - P.l - P.r)) / (IMPACT.months.length - 1);
  const y = (v) => P.t + ((80 - v) * (H - P.t - P.b)) / 60;
  const line = IMPACT.score.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');

  return (
    <section className="bg-ivory py-20 sm:py-28" aria-labelledby="impact-title">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.75fr_1.25fr] lg:px-8">
        <div>
          <div id="impact-title"><Head eyebrow="06 · Measuring change" title="Did your changes" accent="actually work?" desc="Log a change — a new breakfast menu, a refurbished floor — and watch what guests say about that topic before and after, with the number of reviews behind every point." /></div>
          <div className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {IMPACT.checkpoints.map((c, i) => (
              <button key={c.id} type="button" onClick={() => setCp(c.id)} aria-pressed={c.id === cp}
                className={`flex min-h-12 items-center gap-3 rounded-2xl px-4 text-left font-bold transition ${c.id === cp ? 'bg-forest text-white shadow-card' : 'bg-white text-pine ring-1 ring-line hover:ring-forest/40'}`}>
                <span className={`grid size-7 place-items-center rounded-full text-xs ${c.id === cp ? 'bg-amber text-pine' : 'bg-mist text-forest'}`}>{i + 1}</span>{c.label}
              </button>
            ))}
          </div>
        </div>
        <Reveal from="up-right" className="rounded-[2rem] bg-white p-5 shadow-card ring-1 ring-line sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow text-slate">Breakfast sentiment (0–100) · Deodar Heights</p>
              <p className="mt-1 flex items-baseline gap-2"><span className={`font-serif text-5xl ${delta >= 0 ? 'text-good' : 'text-bad'}`}>{delta > 0 ? '+' : ''}{delta}</span><span className="text-sm font-semibold text-slate">{check.id === 'before' ? 'baseline' : 'vs before the change'}</span></p>
            </div>
            <p className="text-right text-xs font-semibold text-slate">{sum(IMPACT.volume, check.range)} reviews in this window<br />{sum(IMPACT.volume, before)} reviews before</p>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 block h-auto w-full" role="img" aria-label={`Breakfast sentiment by month; the menu changed in ${IMPACT.months[IMPACT.change.index]}.`}>
            {[30, 50, 70].map((v) => <g key={v}><line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeDasharray={v === 50 ? '4 4' : undefined} /><text x={P.l - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill="var(--color-slate)">{v}</text></g>)}
            <rect x={x(before[0]) - 14} y={P.t} width={x(before[1]) - x(before[0]) + 28} height={H - P.t - P.b} fill="var(--color-market)" opacity="0.1" rx="8" />
            <motion.rect y={P.t} height={H - P.t - P.b} rx="8" fill="var(--color-amber)" opacity="0.18" initial={false} animate={{ x: x(check.range[0]) - 14, width: x(check.range[1]) - x(check.range[0]) + 28 }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 140, damping: 22 }} />
            <line x1={x(IMPACT.change.index)} x2={x(IMPACT.change.index)} y1={P.t - 4} y2={H - P.b} stroke="var(--color-geru)" strokeDasharray="3 3" />
            <text x={x(IMPACT.change.index) + 6} y={P.t + 8} fontSize="11" fontWeight="700" fill="var(--color-geru)">{IMPACT.change.label}</text>
            <motion.path d={line} fill="none" stroke="var(--color-you)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" initial={reduce ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.8, ease: 'easeInOut' }} />
            {IMPACT.score.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="#fff" stroke="var(--color-you)" strokeWidth="2.2"><title>{`${IMPACT.months[i]}: ${v} (${IMPACT.volume[i]} reviews)`}</title></circle>)}
            {IMPACT.months.map((m, i) => <text key={m} x={x(i)} y={H - 8} fontSize="11" textAnchor="middle" fill="var(--color-slate)">{m}</text>)}
          </svg>
          <p className="mt-4 rounded-2xl bg-mist p-4 text-sm text-ink"><strong>Read this as evidence, not proof.</strong> Sentiment rose after the change, but season, guest mix and other changes move it too.</p>
          <DemoNote />
        </Reveal>
      </div>
    </section>
  );
}

/** Problem-statement measures, live where possible, and the four steps. */
export function Measures() {
  const live = useLiveCoverage();
  const value = (m) => {
    if (live.ok && m.live === 'reviews') return live.totals.reviews.toLocaleString('en-IN');
    if (live.ok && m.live === 'hotels') return live.totals.hotels.toLocaleString('en-IN');
    return m.value;
  };
  return (
    <section id="how-it-works" className="relative overflow-hidden bg-parchment/50 py-20 sm:py-28" aria-labelledby="how-title">
      <AipanMandala className="pointer-events-none absolute -bottom-48 -left-48 size-[36rem] opacity-[0.06]" bg={null} color="#8e1b1b" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div id="how-title"><Head eyebrow="07 · How it works" title="From a guest’s sentence" accent="to a decision." center /></div>
        <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_STEPS.map((s, i) => (
            <Reveal as="li" key={s.id} from={i % 2 ? 'down' : 'up'} delay={i * 0.08} className={`relative rounded-3xl bg-white p-6 shadow-card ring-1 ring-line ${i % 2 ? 'lg:mt-10' : ''}`}>
              <span className="relative grid size-14 place-items-center">
                <AipanMandala className="absolute inset-0 size-14" detail="simple" />
                <span className="relative grid size-8 place-items-center rounded-full bg-geru font-serif text-base font-semibold text-rice ring-2 ring-rice">{s.n}</span>
              </span>
              <h3 className="mt-4 font-serif text-2xl text-pine">{s.title}</h3>
              <p className="mt-2 text-sm text-slate">{s.text}</p>
            </Reveal>
          ))}
        </ol>

        <div className="mt-20">
          <p className="eyebrow mb-5 text-center text-geru">Measured, not guessed — for every hotel and town</p>
          <ul className="grid gap-px overflow-hidden rounded-[2rem] bg-line ring-1 ring-line sm:grid-cols-2 lg:grid-cols-3">
            {PS_METRICS.map((m, i) => (
              <Reveal as="li" key={m.id} from="up" delay={(i % 3) * 0.06} className="relative bg-white p-6">
                <Icon name={METRIC_ICON[m.id]} className="size-5 text-geru" />
                <p className="num mt-3 font-serif text-4xl text-pine">{value(m)}</p>
                <p className="mt-1 font-bold text-ink">{m.label}</p>
                <p className="mt-1 text-sm text-slate">{live.ok && m.live ? (m.live === 'reviews' ? 'Reviews collected so far — every one analysed' : 'Hotels mapped and benchmarked so far') : m.note}</p>
                {live.ok && m.live && <span className="absolute top-5 right-5 text-[0.66rem] font-extrabold tracking-wider text-good uppercase">● Live</span>}
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Closing call to action over the mountains. */
export function FinalCta() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  return (
    <section className="relative isolate overflow-hidden py-28 sm:py-36" aria-labelledby="final-title">
      <div className="absolute inset-0 -z-10"><MountainPhoto position="50% 55%" /></div>
      <div className="absolute inset-0 -z-10 bg-linear-to-b from-pine/40 via-pine/55 to-pine/90" />
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <Reveal from="up"><p className="font-deva text-2xl text-amber" lang="hi">पधारो, अतिथि</p></Reveal>
        <Reveal from="up" delay={0.06}>
          <h2 id="final-title" className="text-shadow-soft mt-3 font-serif text-4xl leading-tight text-white sm:text-6xl">Better guest experiences start with <em className="text-glacier">better insights.</em></h2>
        </Reveal>
        <Reveal from="up" delay={0.12}>
          <form onSubmit={(e) => { e.preventDefault(); navigate(name.trim() ? `/search?name=${encodeURIComponent(name.trim())}` : '/search'); }} className="mx-auto mt-9 flex max-w-xl flex-col gap-2 rounded-[1.75rem] bg-white/95 p-2 shadow-lift sm:flex-row sm:rounded-full" role="search">
            <label htmlFor="final-hotel" className="sr-only">Your hotel’s name</label>
            <input id="final-hotel" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your hotel’s name" className="min-h-12 flex-1 rounded-full bg-transparent px-5 text-base outline-none placeholder:text-slate/70" autoComplete="organization" />
            <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-geru px-6 font-bold text-rice hover:bg-geru-600"><Icon name="key" className="size-4.5" /> Check in your hotel</button>
          </form>
        </Reveal>
        <Reveal from="up" delay={0.18}><div className="mt-5"><Button to="/seeding" variant="glass" icon="arrowRight">Or explore a destination</Button></div></Reveal>
      </div>
    </section>
  );
}
