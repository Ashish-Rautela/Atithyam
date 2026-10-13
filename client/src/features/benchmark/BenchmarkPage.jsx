import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/httpClient.js';
import { DataState } from '../../components/DataState.jsx';
import { AspectStrip, Heatmap } from '../../components/charts.jsx';
import { ASPECTS, ISSUE_KIND, formatInr, formatNumber, pct } from '../../utils/format.js';
import ReviewList from '../business/ReviewList.jsx';
import PipelineBar from './PipelineBar.jsx';
import SummaryCard from './SummaryCard.jsx';
import Findings from './Findings.jsx';
import TrendsSection from './TrendsSection.jsx';
import MetricsCard from './MetricsCard.jsx';
import { Badge, Button, Card, CardHeader, EmptyState, KeyTag, Notice, PageBody, PageHero, Table } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';

const PEER_MODES = [
  { value: 'compset', label: 'Competitor set' },
  { value: 'cluster', label: 'Micro-market' },
  { value: 'radius', label: 'Within 3 km' },
];

/**
 * The owner's competitive benchmark: overall rating against the market, every aspect against the
 * cluster, where they lead / lag / where the whole market is weak, specific issues, trends and
 * causes. Fills in progressively while competitors are collected and reviews analysed.
 */
export default function BenchmarkPage() {
  const { bizId } = useParams();
  const qc = useQueryClient();
  const [peers, setPeers] = useState({ peers: 'compset', radiusKm: 3 });

  const pipeline = useQuery({
    queryKey: ['pipeline', bizId, peers],
    queryFn: () => api.getPipeline(bizId, peers),
    refetchInterval: (q) => (q.state.data?.complete ? 30000 : 4000),
  });
  const working = pipeline.data && !pipeline.data.complete;
  const benchmark = useQuery({
    queryKey: ['benchmark', bizId, peers],
    queryFn: () => api.getBenchmark(bizId, peers),
    refetchInterval: working ? 10000 : false,
  });
  const analyse = useMutation({
    mutationFn: (upgrade) => api.analyseNow(bizId, peers, upgrade),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline', bizId] });
      qc.invalidateQueries({ queryKey: ['benchmark', bizId] });
    },
  });

  const hotelName = benchmark.data?.hotel.name;
  return (
    <>
      <PageHero
        crumbs={[
          { label: 'Home', to: '/' },
          { label: 'My hotel', to: '/search' },
          { label: hotelName ?? 'Property data', to: `/business/${bizId}` },
          { label: 'Benchmark' },
        ]}
        eyebrow="Competitive benchmark"
        deva="तुलना"
        title={hotelName ?? 'Competitive benchmark'}
        subtitle="How guests rate you against the hotels you actually compete with — topic by topic."
        actions={
          <>
            <label className="flex min-h-11 items-center gap-2 rounded-full bg-white/15 py-1 pr-1 pl-4 ring-1 ring-white/40 backdrop-blur-md">
              <span className="text-[0.82rem] font-bold text-white">Compare with</span>
              <select
                className="field min-h-9 w-auto rounded-full border-0 py-1.5 pr-9 pl-3 text-sm font-bold text-pine"
                value={peers.peers}
                onChange={(e) => setPeers({ ...peers, peers: e.target.value })}
              >
                {PEER_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <Button to={`/business/${bizId}/competitors`} variant="glass" iconLeft="users">Edit competitor set</Button>
            <Button
              variant="light"
              iconLeft="refresh"
              disabled={analyse.isPending}
              onClick={() => analyse.mutate(true)}
              title="Analyse every collected review of your hotel and competitors now, then queue the AI pass"
            >
              {analyse.isPending ? 'Analysing…' : 'Analyse now'}
            </Button>
          </>
        }
      />
      <PageBody>
        {pipeline.data && <PipelineBar pipeline={pipeline.data} onUpgrade={() => analyse.mutate(true)} />}
        {analyse.isSuccess && (
          <Notice tone="good" title="Analysis started">
            {analyse.data.instant ? `${analyse.data.instant} reviews analysed now. ` : 'No new reviews to analyse. '}
            {analyse.data.queued ? `AI pass queued for ${analyse.data.queued} hotel${analyse.data.queued === 1 ? '' : 's'}.` : ''}
          </Notice>
        )}

        <DataState query={benchmark} loadingText="Computing benchmark…">
          {(b) => (b.coverage.yourReviews === 0 ? (
            <EmptyState
              icon="hotel"
              title="Your reviews have not been analysed yet."
              hint="The benchmark appears here as soon as your hotel’s collection and analysis finish (see the progress above)."
            />
          ) : (
            <>
              {b.peerSet.withData < 2 && (
                <Notice tone="warn" title="Not enough competitor data to compare yet.">
                  {b.peerSet.withData} of {b.peerSet.total} competitors have analysed reviews. Competitors still being collected are
                  added automatically; if they are all collected, press “Analyse now”.
                </Notice>
              )}
              <KpiRow b={b} />
              <SummaryCard bizId={bizId} peers={peers} fingerprint={b.fingerprint} />
              <Card>
                <CardHeader
                  icon="layers"
                  title="Topic by topic"
                  desc="Score 0–100 from what guests write: 50 means as much praise as complaint. Hotels with few mentions are pulled towards the market average so a handful of reviews cannot top the table."
                  actions={
                    <span className="inline-flex items-start gap-1.5 rounded-2xl bg-info-bg px-3 py-1.5 text-xs font-bold text-info">
                      <Icon name="users" className="size-3.5 shrink-0 translate-y-px" />
                      {b.peerSet.label} · {b.peerSet.withData} with analysed reviews
                    </span>
                  }
                />
                <AspectStrip aspects={b.aspects} />
              </Card>
              <Findings b={b} />
              <IssuesTable issues={b.issues} />
              {b.platformCategories.length > 0 && <PlatformCategories rows={b.platformCategories} />}
              <Card>
                <CardHeader
                  icon="hotel"
                  title="You and every competitor"
                  desc="Every hotel’s topic scores side by side, with rating, review count and room price."
                />
                <Heatmap
                  aspects={ASPECTS}
                  rows={b.heatmap.map((h) => ({ key: h.hotelId, label: h.isYou ? h.name : <Link className="inline-flex min-h-10 items-center text-forest underline-offset-2 hover:underline" to={`/business/${h.hotelId}`}>{h.name}</Link>, isYou: h.isYou, cells: h.cells, rating: h.rating, reviews: h.reviews, priceInr: h.priceInr }))}
                  extraCols={[
                    { key: 'rating', label: 'Rating /5', render: (r) => r.rating ?? '–' },
                    { key: 'reviews', label: 'Reviews', render: (r) => formatNumber(r.reviews) },
                    { key: 'price', label: 'Price', render: (r) => formatInr(r.priceInr) },
                  ]}
                />
              </Card>
              <TrendsSection bizId={bizId} peers={peers} />
              <MetricsCard b={b} bizId={bizId} peers={peers} />
              <ReviewList bizId={bizId} refreshKey={b.fingerprint} withAspects />
            </>
          ))}
        </DataState>
      </PageBody>
    </>
  );
}

function KpiRow({ b }) {
  const r = b.rating;
  const leads = b.aspects.filter((a) => a.status === 'lead');
  const lags = b.aspects.filter((a) => a.status === 'lag');
  const shared = b.aspects.filter((a) => a.marketWide);
  return (
    <section aria-label="Headline numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KeyTag
        tone="pine"
        icon="star"
        label="Rating · out of 5"
        value={r.you ?? '–'}
        sub={<>Market average {r.marketAverage ?? '–'} {r.marketMin !== null && <span className="text-mist/70">(range {r.marketMin}–{r.marketMax})</span>}</>}
        foot="All platforms combined"
      >
        {r.verdict && (
          <Badge tone={r.verdict === 'above' ? 'good' : r.verdict === 'below' ? 'bad' : 'muted'} className="mt-3 whitespace-normal">
            {r.verdict === 'above' ? '▲ Above' : r.verdict === 'below' ? '▼ Below' : '● In line with'} the market{r.percentile !== null ? ` · better than ${r.percentile}% of it` : ''}
          </Badge>
        )}
      </KeyTag>
      <KeyTag
        icon="flag"
        label="Where you stand"
        value={<>{leads.length}<span className="mx-1 text-slate/50">/</span>{lags.length}</>}
        sub="aspects ahead / behind the market"
      >
        <ul className="mt-2 space-y-1 text-xs">
          <li className="flex items-start gap-1.5 text-good"><Icon name="trendUp" className="mt-px size-3.5 shrink-0" /><span><span className="sr-only">Ahead: </span>{leads.map((a) => a.label).join(', ') || 'No clear lead'}</span></li>
          <li className="flex items-start gap-1.5 text-bad"><Icon name="trendDown" className="mt-px size-3.5 shrink-0" /><span><span className="sr-only">Behind: </span>{lags.map((a) => a.label).join(', ') || 'no clear gap'}</span></li>
        </ul>
      </KeyTag>
      <KeyTag
        tone="geru"
        icon="alert"
        label="Market-wide weaknesses"
        value={shared.length}
        sub={shared.map((a) => a.label).join(', ') || 'None found'}
        foot="Problems everyone has — whoever fixes them first stands out."
      />
      <KeyTag
        icon="quote"
        label="Reviews analysed"
        value={formatNumber(b.coverage.analysed)}
        sub={`${formatNumber(b.coverage.yourReviews)} yours · ${b.peerSet.withData} competitors`}
        foot={`≈ ${b.coverage.readingHoursSaved} h of reading · ${b.coverage.indicLanguage} in Hindi/Hinglish · ${b.coverage.method === 'ai' ? 'AI' : b.coverage.method === 'mixed' ? 'AI + rules' : 'offline rules'}`}
      />
    </section>
  );
}

function IssuesTable({ issues }) {
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const shown = onlyFlagged ? issues.filter((i) => i.kind !== 'normal') : issues;
  return (
    <Card>
      <CardHeader
        icon="search"
        title="What guests mention, in detail"
        desc="Complaints per 100 analysed reviews — yours against the competitors’ combined. This separates a problem of yours from a condition of the whole market."
        actions={
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-ivory px-4 text-sm font-bold text-pine ring-1 ring-line hover:ring-forest/40">
            <input type="checkbox" className="size-4 accent-forest" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} /> Only flagged
          </label>
        }
      />
      {shown.length === 0 ? <EmptyState icon="search" title="Nothing specific yet." /> : (
        <Table>
          <thead>
            <tr>
              <th>Issue</th>
              <th>Aspect</th>
              <th className="text-right!">Your complaints /100</th>
              <th className="text-right!">Market /100</th>
              <th className="text-right!">Competitors affected</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => {
              const k = ISSUE_KIND[i.kind] ?? ISSUE_KIND.normal;
              return (
                <tr key={i.issue}>
                  <td className="font-semibold text-ink">
                    {i.label}
                    {i.scope === 'destination' && <Badge tone="info" icon="map" className="ml-2" title="Outside the hotel’s control — a destination issue">Destination</Badge>}
                  </td>
                  <td className="text-slate">{i.aspectLabel}</td>
                  <td className="num text-right">
                    <span className="font-bold text-pine">{i.you.negPer100 ?? '–'}</span>
                    {i.you.pos > 0 && <span className="text-xs text-slate"> (+{i.you.pos} praise)</span>}
                  </td>
                  <td className="num text-right">{i.market.negPer100 ?? '–'}</td>
                  <td className="num text-right">{i.market.hotelsAffected}</td>
                  <td>
                    <span className="flex flex-wrap gap-1.5">
                      {i.kind !== 'normal' && <Badge tone={k.tone} title={k.hint}>{k.label}</Badge>}
                      {i.kind === 'market_wide' && i.youVsMarket === 'better' && <Badge tone="good" icon="check">You do better</Badge>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function PlatformCategories({ rows }) {
  return (
    <Card>
      <CardHeader
        icon="star"
        title="Platform category scores"
        desc="Booking.com, Agoda and MakeMyTrip each publish category scores under different names (“Staff”, “Service”, “Hospitality”). They are mapped to the same aspects and put on a 0–100 scale here."
      />
      <Table>
        <thead><tr><th>Aspect</th><th className="text-right!">You</th><th className="text-right!">Market average</th><th className="text-right!">Difference</th><th className="text-right!">Hotels with scores</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const diff = r.you !== null && r.market !== null ? Math.round((r.you - r.market) * 10) / 10 : null;
            return (
              <tr key={r.aspect}>
                <td className="font-semibold text-ink">{r.label}</td>
                <td className="num text-right font-bold text-pine">{r.you ?? '–'}</td>
                <td className="num text-right">{r.market ?? '–'}</td>
                <td className="num text-right">{diff === null ? '–' : <span className={diff >= 0 ? 'font-bold text-good' : 'font-bold text-bad'}>{diff >= 0 ? '▲ +' : '▼ '}{diff}</span>}</td>
                <td className="num text-right">{r.hotels}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}

export { pct };
