import { Button } from '../../../ui/kit.jsx';
import { AipanCorner, AipanMandala } from '../../../ui/aipan.jsx';
import { Icon, AspectIcon } from '../../../ui/icons.jsx';
import { useLiveCoverage } from '../components/useLiveCoverage.js';
import { REGION_DESTINATIONS } from '../data/homeDemo.js';
import { Head, Reveal } from './parts.jsx';

const TOPICS = [
  ['food', 'Food & dining'], ['room', 'Rooms'], ['housekeeping', 'Housekeeping'], ['staff', 'Staff & service'],
  ['location', 'Location'], ['value', 'Value for money'], ['cleanliness', 'Cleanliness'], ['booking', 'Booking'],
];

/** Live coverage strip + who it is for + the eight topics every review is read for. */
export default function Audience() {
  const live = useLiveCoverage();
  const t = live.totals;
  const stats = live.ok
    ? [[t.destinations, 'Destinations seeded', 'map'], [t.hotels, 'Hotels mapped', 'hotel'], [t.reviews, 'Reviews collected', 'quote'], [t.clusters, 'Micro-markets', 'layers']]
    : [[REGION_DESTINATIONS.length, 'Hill towns on the map', 'map'], [5, 'Review platforms', 'layers'], [3, 'Languages understood', 'language'], [8, 'Topics compared', 'chart']];

  return (
    <section id="platform" className="relative overflow-hidden bg-ivory py-20 sm:py-28" aria-labelledby="aud-title">
      <AipanMandala className="pointer-events-none absolute -top-40 -right-40 size-[34rem] opacity-[0.06]" bg={null} color="#8e1b1b" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div id="aud-title">
          <Head eyebrow="One platform, the whole region" title="For every hotel —" accent="and the towns they share." deva="हर होटल, हर शहर" />
        </div>

        <dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-line ring-1 ring-line lg:grid-cols-4">
          {stats.map(([v, k, icon], i) => (
            <Reveal key={k} from="up" delay={i * 0.06} className="flex flex-col-reverse gap-1 bg-white p-5 sm:p-7">
              <dt className="flex items-center gap-2 text-sm font-bold text-slate"><Icon name={icon} className="size-4 text-geru" /> {k}</dt>
              <dd className="num font-serif text-4xl text-pine sm:text-5xl">{Number(v).toLocaleString('en-IN')}</dd>
            </Reveal>
          ))}
        </dl>
        <p className="mt-3 text-xs font-bold text-slate">{live.ok ? '● Live from the platform database' : 'Start the server and seed a town to see live coverage here.'}</p>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <Reveal from="up-left" className="relative overflow-hidden rounded-[2rem] bg-forest p-7 text-mist shadow-lift sm:p-10">
            <AipanCorner className="pointer-events-none absolute top-3 left-3 size-14 opacity-30" color="#fffdf7" />
            <p className="eyebrow flex items-center gap-2 text-amber"><Icon name="hotel" className="size-4" /> For hotels, homestays &amp; resorts</p>
            <h3 className="mt-3 font-serif text-3xl leading-tight text-white sm:text-4xl">Know where you stand among the hotels next door.</h3>
            <ul className="mt-6 space-y-3 text-[0.98rem]">
              {['Every topic scored against your real competitors, not a national average', 'Your own problems separated from those the whole market shares', 'Early warnings with the exact guest sentences behind them'].map((p) => (
                <li key={p} className="flex gap-3"><Icon name="check" className="mt-0.5 size-5 shrink-0 text-amber" />{p}</li>
              ))}
            </ul>
            <div className="mt-8"><Button to="/search" variant="light" icon="arrowRight">Check in your hotel</Button></div>
          </Reveal>
          <Reveal from="up-right" delay={0.1} className="relative overflow-hidden rounded-[2rem] bg-linear-to-br from-glacier/70 to-glacier p-7 text-pine shadow-card sm:p-10 lg:mt-12">
            <AipanCorner className="pointer-events-none absolute right-3 bottom-3 size-14 opacity-30" color="#102f29" rotate={180} />
            <p className="eyebrow flex items-center gap-2 text-geru"><Icon name="map" className="size-4" /> For tourism boards &amp; district administration</p>
            <h3 className="mt-3 font-serif text-3xl leading-tight sm:text-4xl">See what visitors run into across a whole town.</h3>
            <ul className="mt-6 space-y-3 text-[0.98rem]">
              {['Parking, roads, water, power and pricing pooled across every property', 'Which issues are widespread, where they cluster and when they peak', 'Evidence you can export and share, by micro-market'].map((p) => (
                <li key={p} className="flex gap-3"><Icon name="check" className="mt-0.5 size-5 shrink-0 text-geru" />{p}</li>
              ))}
            </ul>
            <div className="mt-8"><Button to="/seeding" variant="primary" icon="arrowRight">Explore destinations</Button></div>
          </Reveal>
        </div>

        <Reveal from="up" className="mt-16">
          <p className="eyebrow mb-4 text-center text-slate">Every review is read for eight things guests care about</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {TOPICS.map(([k, label]) => (
              <li key={k} className="flex flex-col items-center gap-2 rounded-2xl bg-white px-3 py-4 text-center text-sm font-bold text-pine ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-card">
                <span className="grid size-11 place-items-center rounded-full bg-geru-50 text-geru"><AspectIcon aspect={k} className="size-5" /></span>
                {label}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
