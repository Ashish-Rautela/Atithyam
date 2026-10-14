import { lazy, Suspense, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { api } from '../../services/httpClient.js';
import { Badge, Button, Card, CardHeader, KeyTag, PageBody, PageHero, Spinner, cx } from '../../ui/kit.jsx';
import { AipanMandala } from '../../ui/aipan.jsx';
import { Icon, AspectIcon } from '../../ui/icons.jsx';
import { DataState } from '../../components/DataState.jsx';
import PipelineBar from '../benchmark/PipelineBar.jsx';
import { FakeCards, FakeText, LazySection, Locked, LockedValue } from './Locked.jsx';
import { STARTERS } from '../chat/starters.js';

// The assistant (and its code) loads only when a paid report scrolls to it.
const ReportChat = lazy(() => import('./ReportChat.jsx'));

const STATUS = {
  lead: { label: 'Ahead', tone: 'good' },
  lag: { label: 'Behind', tone: 'bad' },
  par: { label: 'Level', tone: 'muted' },
  insufficient: { label: 'Too few mentions', tone: 'muted' },
};
const PLATFORM = { google_maps: 'Google', booking: 'Booking.com', agoda: 'Agoda', makemytrip: 'MakeMyTrip', tripadvisor: 'Tripadvisor' };
const src = (p) => PLATFORM[p] ?? p;
const fmt = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(d));

export default function ReportPage() {
  const { bizId } = useParams();
  const reduce = useReducedMotion();
  const report = useQuery({
    queryKey: ['report', bizId],
    queryFn: () => api.getReport(bizId),
    // While competitors are still being collected, check again every few seconds.
    refetchInterval: (q) => (q.state.data?.status === 'collecting' ? 6000 : false),
  });
  // A short "reading your reviews" sequence the first time the report opens.
  const [introDone, setIntroDone] = useState(Boolean(reduce));
  useEffect(() => {
    if (introDone) return undefined;
    const t = setTimeout(() => setIntroDone(true), 2400);
    return () => clearTimeout(t);
  }, [introDone]);
  const data = report.data;
  useEffect(() => {
    document.title = `${data?.hotel?.name ? `${data.hotel.name} - ` : ''}Guest-review report — Athityam`;
  }, [data?.hotel?.name]);

  const unlock = `/pricing?plan=pro&next=${encodeURIComponent(`/business/${bizId}/report`)}`;
  const ready = data?.status === 'ready';

  return (
    <>
      <PageHero
        eyebrow="Your guest-review report"
        deva="आपकी रिपोर्ट"
        title={ready ? data.hotel.name : 'Preparing your report'}
        subtitle={ready ? `Compared with ${data.comparedWith} · ${data.coverage.analysed.toLocaleString('en-IN')} reviews read` : 'We read every review of your hotel and the hotels your guests compare you with.'}
        crumbs={[{ label: 'Home', to: '/' }, { label: 'My hotel', to: '/search' }, { label: 'Report' }]}
        actions={ready && (data.full
          ? <Button to={`/business/${bizId}/benchmark`} variant="light" icon="arrowRight">Open the deep-dive benchmark</Button>
          : <Button to={unlock} variant="geru" iconLeft="key">Unlock the full report</Button>)}
      />
      <PageBody>
        <DataState query={report} loadingText="Opening your report…">
          {(d) => (!introDone && d.status === 'ready'
            ? <Reading coverage={d.coverage} />
            : d.status === 'collecting'
              ? <Collecting pipeline={d.pipeline} bizId={bizId} />
              : <Report r={d} bizId={bizId} unlock={unlock} reduce={reduce} />)}
        </DataState>
      </PageBody>
    </>
  );
}

/* ------------------------------------------------------------------ states */

function Reading({ coverage }) {
  const steps = [
    `Reading ${coverage.analysed.toLocaleString('en-IN')} guest reviews in English, हिंदी and Hinglish`,
    `Comparing you with ${Math.max(0, coverage.hotels - 1)} hotels nearby`,
    'Finding what guests love about you',
    'Spotting what is costing you bookings',
  ];
  const [n, setN] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setN((x) => Math.min(steps.length, x + 1)), 550);
    return () => clearInterval(t);
  }, [steps.length]);
  return (
    <Card className="mx-auto max-w-xl text-center" aria-live="polite">
      <Spinner className="mx-auto size-14" />
      <p className="mt-4 font-serif text-2xl text-pine">Reading your reviews…</p>
      <ul className="mt-5 space-y-2 text-left">
        {steps.map((s, i) => (
          <li key={s} className={cx('flex items-center gap-3 rounded-2xl px-3 py-2 transition', i < n ? 'bg-mist/60 text-ink' : 'text-slate/50')}>
            <span className={cx('grid size-6 place-items-center rounded-full', i < n - 1 ? 'bg-forest text-white' : i === n - 1 ? 'bg-amber text-pine' : 'bg-line')}>
              {i < n - 1 ? <Icon name="check" className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}
            </span>
            {s}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Collecting({ pipeline, bizId }) {
  return (
    <div className="space-y-6">
      <PipelineBar pipeline={{ ...pipeline, ready: false, complete: false }} />
      <Card tone="parchment">
        <CardHeader title="Your report is on its way" icon="clock" desc="We are collecting reviews of your hotel and of the hotels near you. This page updates by itself - most hotels are ready in a few minutes." />
        <ul className="grid gap-2 text-sm text-ink sm:grid-cols-2">
          {['Your rank among the hotels near you', 'Your rating vs the market', 'Topic scores: food, rooms, staff and more', 'What guests love - with their own words'].map((t) => (
            <li key={t} className="flex items-center gap-2"><Icon name="check" className="size-4 text-good" /> {t}</li>
          ))}
        </ul>
        <div className="mt-5"><Button to={`/business/${bizId}`} variant="ghost" icon="arrowRight">See collection details</Button></div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ the report */

function Report({ r, bizId, unlock, reduce }) {
  const s = r.scorecard;
  const free = !r.full;
  const counts = r.counts;
  const lockedTopics = r.topics.filter((t) => t.locked);
  const rise = (i) => (reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.08 * i, duration: 0.45 } });

  return (
    <div className="space-y-8">
      {/* Headline numbers - free */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div {...rise(0)}><KeyTag label="Your rank nearby" value={s.rank ? `#${s.rank} of ${s.rankOf}` : '—'} sub="by overall guest rating" icon="flag" tone="geru" /></motion.div>
        <motion.div {...rise(1)}><KeyTag label="Your rating" value={fmt(s.rating)} sub={`Market average ${fmt(s.marketAverage)} · ${s.verdict ?? '—'}`} icon="star" /></motion.div>
        <motion.div {...rise(2)}><KeyTag label="Reviews read" value={r.coverage.analysed.toLocaleString('en-IN')} sub={`${r.coverage.yourReviews} of them about you`} icon="quote" /></motion.div>
        <motion.div {...rise(3)}><KeyTag label="Reading saved" value={`${fmt(r.coverage.readingHoursSaved)} h`} sub="of reading reviews by hand" icon="clock" /></motion.div>
      </div>

      {/* What we found - counts (the hook) */}
      <motion.div {...rise(4)} className="relative overflow-hidden rounded-[2rem] bg-pine p-6 text-mist shadow-lift sm:p-8">
        <AipanMandala className="pointer-events-none absolute -top-24 -right-24 size-72 opacity-10" bg={null} color="#fffdf7" />
        <p className="eyebrow text-amber">What we found</p>
        <p className="mt-2 max-w-3xl font-serif text-2xl leading-snug text-white sm:text-3xl">{r.headline ?? 'Your benchmark is ready.'}</p>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Found n={counts.strengths} label="things guests love" icon="star" href="#strengths" />
          <Found n={counts.problems} label="problems costing you guests" icon="alert" href="#problems" locked={free} warn />
          <Found n={counts.actions} label="ways to improve" icon="trendUp" href="#improve" locked={free} />
          <Found n={counts.opportunities} label="market gaps to win" icon="flag" href="#opportunities" locked={free} />
        </div>
        {free && counts.problems + counts.actions > 0 && (
          <p className="mt-5 flex flex-wrap items-center gap-3 text-sm text-mist/85">
            <Icon name="lock" className="size-4 text-amber" />
            {counts.problems} problem{counts.problems === 1 ? '' : 's'}, {counts.actions} recommendation{counts.actions === 1 ? '' : 's'} and {counts.quotes} guest quotes are in your full report.
            <Button to={unlock} size="sm" variant="light" icon="arrowRight">Unlock now</Button>
          </p>
        )}
      </motion.div>

      {/* Briefing */}
      <Card id="briefing">
        <CardHeader title="Front-desk briefing" icon="bell" desc="Your situation in plain words." />
        {r.situation ? (
          <p className="max-w-3xl text-[1.02rem] leading-relaxed text-ink">{r.situation}</p>
        ) : (
          <Locked to={unlock} title="Read the full briefing" hint="Where you lead, where you trail, and what the whole market gets wrong.">
            <FakeText lines={7} seed={4} className="py-2" />
          </Locked>
        )}
      </Card>

      {/* Topics */}
      <Card id="topics">
        <CardHeader title="How guests rate you, topic by topic" icon="chart" desc={`0–100 for each topic (50 = as much praise as complaint), you vs the hotels near you.${free ? ` ${lockedTopics.length} topics are part of the full report.` : ''}`} />
        <ul className="divide-y divide-line">
          {r.topics.map((t) => <TopicRow key={t.aspect} t={t} />)}
        </ul>
        {free && lockedTopics.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-geru-50 px-4 py-3">
            <p className="text-sm font-semibold text-geru">See all {r.topics.length} topic scores, your rank on each and how far you are from the leader.</p>
            <Button to={unlock} size="sm" variant="geru" iconLeft="key">Unlock topics</Button>
          </div>
        )}
      </Card>

      {/* Competitors */}
      <LazySection id="competitors">
        <Card>
          <CardHeader title="The hotels your guests compare you with" icon="users" desc="Overall rating and reviews read for each. The topic-by-topic comparison is in the full report." />
          <div className="scrollbar-thin -mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-[0.7rem] font-extrabold tracking-[0.12em] text-slate uppercase">
                  <th className="py-2 pr-3">#</th><th className="py-2 pr-3">Hotel</th><th className="py-2 pr-3">Rating</th><th className="py-2 pr-3">Reviews</th><th className="py-2">Strongest topic</th>
                </tr>
              </thead>
              <tbody>
                {r.competitors.map((c, i) => {
                  const cells = r.competitorTopics?.find((x) => x.hotelId === c.hotelId)?.cells;
                  const best = cells ? Object.entries(cells).filter(([, v]) => v !== null).sort((a, b) => b[1] - a[1])[0] : null;
                  return (
                    <tr key={c.hotelId} className={cx('border-t border-line', c.isYou && 'bg-mist/60 font-bold')}>
                      <td className="py-3 pr-3 text-slate">{i + 1}</td>
                      <td className="py-3 pr-3 text-pine">{c.name} {c.isYou && <Badge tone="geru" className="ml-1">You</Badge>}</td>
                      <td className="num py-3 pr-3">{fmt(c.rating)}</td>
                      <td className="num py-3 pr-3">{c.reviews}</td>
                      <td className="py-3">{free ? <LockedValue /> : best ? <span className="inline-flex items-center gap-1.5 text-forest"><AspectIcon aspect={best[0]} className="size-4" /> {r.topics.find((t) => t.aspect === best[0])?.label} · {best[1]}</span> : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </LazySection>

      {/* Strengths */}
      <LazySection id="strengths">
        <Card>
          <CardHeader title="What guests love about you" icon="star" desc="Where you are clearly ahead of the hotels near you - say it in your listing photos and replies." />
          {r.strengths.length === 0 ? (
            <p className="text-slate">No topic is clearly ahead of the market yet.</p>
          ) : (
            <div className="grid gap-3">
              {r.strengths.map((st) => (
                <div key={st.aspect} className="rounded-2xl bg-good-bg/60 p-4 ring-1 ring-good/15">
                  <p className="flex items-center gap-2 font-serif text-xl text-pine"><AspectIcon aspect={st.aspect} className="size-5 text-good" /> {st.label} {st.gap > 0 && <span className="text-sm font-bold text-good">+{fmt(st.gap)} vs market</span>}</p>
                  {st.note && <p className="mt-1 text-sm text-forest">{st.note}</p>}
                  {st.evidence.map((e) => <p key={e.quote} className="mt-2 border-l-2 border-good pl-3 font-serif text-ink italic">“{e.quote}” <span className="font-sans text-xs text-slate not-italic">· {src(e.platform)}</span></p>)}
                </div>
              ))}
            </div>
          )}
          {free && counts.strengths > r.strengths.length && (
            <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate"><Icon name="lock" className="size-4 text-geru" /> {counts.strengths - r.strengths.length} more strength{counts.strengths - r.strengths.length > 1 ? 's' : ''} and all the guest quotes in the full report.</p>
          )}
        </Card>
      </LazySection>

      {/* Problems */}
      <LazySection id="problems">
        <Card>
          <CardHeader title="What is costing you guests" icon="alert" desc="Problems specific to your hotel - other hotels nearby do not have them as often - with the reviews that prove it." />
          {free ? (
            counts.problems > 0 ? (
              <Locked to={unlock} title={`${counts.problems} problem${counts.problems > 1 ? 's' : ''} found in your reviews`} hint="See exactly what guests complain about, how often compared with your neighbours, and their own words.">
                <FakeCards count={Math.min(3, counts.problems)} seed={5} />
              </Locked>
            ) : <p className="text-slate">No hotel-specific problem stands out - well done.</p>
          ) : r.problems.length === 0 ? (
            <p className="text-slate">No hotel-specific problem stands out right now.</p>
          ) : (
            <div className="grid gap-3">
              {r.problems.map((p) => (
                <div key={p.title} className="rounded-2xl bg-white p-4 ring-1 ring-line">
                  <p className="flex flex-wrap items-center gap-2 font-serif text-xl text-pine"><AspectIcon aspect={p.aspect} className="size-5 text-geru" /> {p.title}</p>
                  <p className="mt-1 text-sm text-slate">
                    {p.kind === 'topic' ? `Your score ${fmt(p.you)} vs ${fmt(p.market)} for nearby hotels (${fmt(p.gap)} points).` : `${fmt(p.youPer100)} complaints per 100 of your reviews vs ${fmt(p.marketPer100 ?? 0)} at nearby hotels.`}
                  </p>
                  {p.evidence?.map((e) => <p key={e.quote} className="mt-2 border-l-2 border-geru pl-3 font-serif text-ink italic">“{e.quote}” <span className="font-sans text-xs text-slate not-italic">· {src(e.platform)}</span></p>)}
                  {p.competitorPraise?.length > 0 && <p className="mt-2 text-sm text-forest">Competitors get praised here: “{p.competitorPraise[0].quote}” ({p.competitorPraise[0].hotelName})</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </LazySection>

      {/* How to improve */}
      <LazySection id="improve">
        <Card tone={free ? 'white' : 'parchment'}>
          <CardHeader title="How to improve - step by step" icon="trendUp" desc="Specific actions, ordered by impact, each tied to the numbers behind it." />
          {free ? (
            <Locked to={unlock} title={`${counts.actions || 3} actions picked for your hotel`} hint="What to fix first, why, and what your competitors already do better.">
              <FakeCards count={Math.max(2, Math.min(3, counts.actions))} seed={9} numbered />
            </Locked>
          ) : (
            <ol className="grid gap-3">
              {r.actions.map((a, i) => (
                <li key={a.title} className="flex gap-4 rounded-2xl bg-white p-4 ring-1 ring-line">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-geru font-serif text-lg text-rice">{i + 1}</span>
                  <div><p className="font-serif text-lg text-pine">{a.title}</p><p className="text-sm text-slate">{a.why}</p></div>
                </li>
              ))}
              {r.actions.length === 0 && <p className="text-slate">No action stands out yet - check back as more reviews come in.</p>}
            </ol>
          )}
        </Card>
      </LazySection>

      {/* Market gaps */}
      <LazySection id="opportunities">
        <Card>
          <CardHeader title="Market gaps you can win" icon="flag" desc="Problems most hotels near you share. The first to fix one stands out in every review." />
          {free ? (
            counts.opportunities > 0 ? (
              <Locked to={unlock} title={`${counts.opportunities} market gap${counts.opportunities > 1 ? 's' : ''} near you`} hint="Where every competitor disappoints guests - and how you compare.">
                <FakeCards count={Math.min(2, counts.opportunities)} seed={13} />
              </Locked>
            ) : <p className="text-slate">No shared weakness found in this market yet.</p>
          ) : r.opportunities.length === 0 ? <p className="text-slate">No shared weakness found in this market yet.</p> : (
            <div className="grid gap-3 md:grid-cols-2">
              {r.opportunities.map((o) => (
                <div key={o.title} className="rounded-2xl bg-white p-4 ring-1 ring-line">
                  <p className="flex items-center gap-2 font-serif text-lg text-pine"><AspectIcon aspect={o.aspect} className="size-5 text-amber-ink" /> {o.title}</p>
                  {o.hotelsAffected != null && <p className="text-sm text-slate">{o.hotelsAffected} competitors get complaints about it.</p>}
                  {o.youToo != null && <p className="text-sm text-slate">{o.youToo ? 'Your guests mention it too.' : 'You already do better than most.'}</p>}
                  {o.evidence?.[0] && <p className="mt-2 border-l-2 border-amber pl-3 font-serif text-ink italic">“{o.evidence[0].quote}”</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </LazySection>

      {/* Ask Front Desk */}
      <LazySection id="ask" minHeight={320}>
        {free ? <ChatTeaser unlock={unlock} hotel={r.hotel.name} /> : (
          <Suspense fallback={<div className="grid min-h-60 place-items-center rounded-[2rem] bg-white ring-1 ring-line"><Spinner className="size-8" /></div>}>
            <ReportChat bizId={bizId} hotelName={r.hotel.name} />
          </Suspense>
        )}
      </LazySection>

      {free ? <UnlockBand unlock={unlock} counts={counts} topics={r.topics.length} /> : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[2rem] bg-white p-5 ring-1 ring-line">
          <p className="text-slate">Want every number, trends over time and the competitor heatmap?</p>
          <Button to={`/business/${bizId}/benchmark`} icon="arrowRight">Open the deep-dive benchmark</Button>
        </div>
      )}
    </div>
  );
}

function Found({ n, label, icon, href, locked, warn }) {
  return (
    <a href={href} className="group rounded-2xl bg-white/8 p-4 ring-1 ring-white/15 transition hover:bg-white/12">
      <span className="flex items-center justify-between">
        <Icon name={icon} className={cx('size-5', warn ? 'text-[#f0b48a]' : 'text-amber')} />
        {locked && <Icon name="lock" className="size-4 text-mist/70" />}
      </span>
      <span className="num mt-2 block font-serif text-4xl text-white">{n}</span>
      <span className="text-sm text-mist/85">{label}</span>
    </a>
  );
}

function TopicRow({ t }) {
  if (t.locked) {
    return (
      <li className="grid grid-cols-[1fr_auto] items-center gap-3 py-3 sm:grid-cols-[12rem_1fr_auto]">
        <span className="flex items-center gap-2 font-bold text-pine"><AspectIcon aspect={t.aspect} className="size-4.5 text-slate" /> {t.label}</span>
        <span aria-hidden="true" className="hidden h-3 rounded-full bg-linear-to-r from-forest/40 via-slate/20 to-market/40 blur-[4px] sm:block" />
        <LockedValue />
      </li>
    );
  }
  const st = STATUS[t.status] ?? STATUS.par;
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-3 py-3 sm:grid-cols-[12rem_1fr_auto]">
      <span className="flex items-center gap-2 font-bold text-pine"><AspectIcon aspect={t.aspect} className="size-4.5 text-forest" /> {t.label}</span>
      <span className="col-span-2 space-y-1 sm:col-span-1">
        <Bar value={t.you.score} tone="bg-you" label="You" />
        <Bar value={t.market.median} tone="bg-market" label="Market" />
      </span>
      <span className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto"><Badge tone={st.tone}>{st.label}</Badge></span>
    </li>
  );
}

function Bar({ value, tone, label }) {
  const v = value === null || value === undefined ? null : Math.max(0, Math.min(100, value));
  return (
    <span className="flex items-center gap-2 text-xs font-semibold text-slate">
      <span className="w-12 shrink-0">{label}</span>
      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-parchment"><span className={cx('block h-full rounded-full', tone)} style={{ width: `${v ?? 0}%` }} /></span>
      <span className="num w-8 text-right text-ink">{v === null ? '—' : Math.round(v)}</span>
    </span>
  );
}

function ChatTeaser({ unlock, hotel }) {
  return (
    <div className="overflow-hidden rounded-[2rem] bg-white shadow-card ring-1 ring-line">
      <div className="flex items-center gap-3 bg-pine px-5 py-4 text-mist">
        <span className="grid size-11 place-items-center rounded-2xl bg-amber text-pine"><Icon name="bell" className="size-5" /></span>
        <div><p className="font-serif text-xl text-white">Ask Front Desk <Badge tone="dark" className="ml-1">Hotel Pro</Badge></p><p className="text-sm text-mist/80">Your AI assistant for {hotel}&rsquo;s reviews.</p></div>
      </div>
      <Locked to={unlock} title="Ask anything about your reviews" hint="“Why is the hotel next door rated higher?” “How do I fix breakfast complaints?” - answered from your own reviews, in English, हिंदी or Hinglish." className="rounded-none">
        <div className="space-y-3 bg-ivory/60 p-5">
          <div className="flex justify-end"><p className="rounded-3xl rounded-br-md bg-forest px-4 py-3 text-white">{STARTERS[0]}</p></div>
          <div className="flex"><div className="max-w-[85%] rounded-3xl rounded-bl-md bg-white px-4 py-3 ring-1 ring-line"><FakeText lines={3} seed={21} /></div></div>
          <div className="flex justify-end"><p className="rounded-3xl rounded-br-md bg-forest px-4 py-3 text-white">{STARTERS[2]}</p></div>
          <div className="flex"><div className="max-w-[85%] rounded-3xl rounded-bl-md bg-white px-4 py-3 ring-1 ring-line"><FakeText lines={2} seed={31} /></div></div>
        </div>
      </Locked>
    </div>
  );
}

function UnlockBand({ unlock, counts, topics }) {
  const plans = useQuery({ queryKey: ['plans'], queryFn: api.plans, staleTime: 300_000 });
  const pro = plans.data?.plans?.find((p) => p.id === 'pro');
  const price = pro ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(pro.pricePaise / 100) : '₹999';
  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-geru p-6 text-rice shadow-lift sm:p-8" aria-labelledby="unlock-title">
      <AipanMandala className="pointer-events-none absolute -right-20 -bottom-20 size-72 opacity-15" bg={null} color="#fffdf7" />
      <div className="relative grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-center">
        <div>
          <p className="eyebrow text-amber">Hotel Pro · {pro?.days ?? 30} days</p>
          <h2 id="unlock-title" className="mt-1 font-serif text-3xl text-white sm:text-4xl">See everything your guests are telling you</h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              `${counts.problems} problems costing you guests`,
              `${counts.actions} step-by-step improvements`,
              `All ${topics} topic scores and ranks`,
              'Ask Front Desk - your AI review assistant',
              `${counts.quotes} guest quotes as evidence`,
              'Trends, early warnings and competitor heatmap',
            ].map((t) => <li key={t} className="flex items-center gap-2 text-rice/95"><Icon name="check" className="size-4 text-amber" /> {t}</li>)}
          </ul>
        </div>
        <div className="rounded-3xl bg-white/10 p-5 text-center ring-1 ring-white/20">
          <p className="font-serif text-5xl text-white">{price}</p>
          <p className="text-sm text-rice/80">for {pro?.days ?? 30} days · UPI, cards, netbanking · no auto-renewal</p>
          <Button to={unlock} variant="light" icon="arrowRight" className="mt-4 w-full">Unlock my full report</Button>
        </div>
      </div>
    </section>
  );
}
