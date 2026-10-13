import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/httpClient.js';
import { DataState } from '../../components/DataState.jsx';
import { Heatmap, MiniBars, SentimentBar } from '../../components/charts.jsx';
import { ASPECTS, PLATFORM_LABELS, formatDate, formatNumber, pct } from '../../utils/format.js';
import { Badge, Button, Card, CardHeader, EmptyState, KeyTag, PageBody, PageHero, Table } from '../../ui/kit.jsx';
import { AspectIcon, Icon } from '../../ui/icons.jsx';
import SummaryCard from '../benchmark/SummaryCard.jsx';

/**
 * Destination view for a Tourism Board / municipality: what visitors consistently say about the
 * town, issues outside any single hotel's control first, all with evidence and a CSV hand-over.
 */
export default function DestinationPage() {
  const { cityId } = useParams();
  const [clusterId, setClusterId] = useState(null);
  const dest = useQuery({ queryKey: ['destination', cityId, clusterId], queryFn: () => api.getDestination(cityId, clusterId) });
  const city = useQuery({ queryKey: ['city', cityId, null], queryFn: () => api.getCity(cityId) });

  const townName = dest.data?.city?.name ?? city.data?.city?.name;

  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Destinations', to: '/seeding' }, { label: townName ?? 'Town', to: `/seeding/${cityId}` }, { label: 'What visitors say' }]}
        deva="अतिथि की आवाज़"
        eyebrow="Tourism board view"
        title={townName ? `${townName}: what visitors say` : 'What visitors say'}
        subtitle={`Every analysed review of every property${clusterId ? ' in this micro-market' : ' in the destination'}, aggregated — evidence, not anecdote.`}
        actions={
          <>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="eyebrow text-glacier">Area</span>
              <select className="field min-h-11 py-2 sm:w-56" value={clusterId ?? ''} onChange={(e) => setClusterId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Whole destination</option>
                {(city.data?.clusters ?? []).map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </label>
            <Button to={`/seeding/${cityId}`} variant="glass" iconLeft="arrowLeft" className="self-end">{townName ?? 'Town'} hotels</Button>
            <Button href={`/api/cities/${cityId}/destination/evidence.csv`} variant="light" iconLeft="download" className="self-end">Download evidence (CSV)</Button>
          </>
        }
        position="65% 35%"
      />
      <PageBody>
        <DataState query={dest} loadingText="Aggregating the destination…">
          {(d) => (
            <div className="space-y-6">
              <section aria-label="Destination at a glance" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <KeyTag label="Properties" value={d.coverage.hotelsWithData} sub={`with analysed reviews, of ${d.coverage.hotels}`} icon="hotel" tone="pine" />
                <KeyTag label="Reviews analysed" value={formatNumber(d.coverage.reviews)} sub={`≈ ${d.coverage.readingHoursSaved} h of reading`} icon="quote" />
                <KeyTag label="Destination issues" value={d.destinationIssues.length} sub="outside any hotel’s control" icon="flag" tone="geru" />
                <KeyTag label="Most-praised" value={<span className="block text-[1.6rem] leading-tight">{d.strengths[0]?.label ?? '—'}</span>} sub={d.strengths[0] ? `${d.strengths[0].praise} mentions` : ''} icon="star" className="col-span-2 lg:col-span-1" />
              </section>

              {d.coverage.reviews > 0 ? (
                <>
                  <SummaryCard cityId={cityId} clusterId={clusterId} fingerprint={d.fingerprint} title="Brief for the administration" />

                  <div className="space-y-6">
                    <Card>
                      <CardHeader icon="flag" title="Issues for the administration" desc="Things visitors complain about that no single hotel controls: roads and access, parking, traffic, power, local overcharging." />
                      <IssueList items={d.destinationIssues} empty="No destination-level complaints in the reviews collected so far." />
                    </Card>

                    <Card>
                      <CardHeader icon="users" title="Common complaints across properties" desc="Problems many properties share — useful for the hotel association and for training programmes." />
                      <IssueList items={d.propertyIssues} empty="No complaint is shared by several properties." />
                    </Card>
                  </div>

                  <Card>
                    <CardHeader icon="chart" title="Aspects across the destination" desc="Share of negative and positive mentions for each guest-book topic." />
                    <Table>
                      <thead>
                        <tr>
                          <th>Aspect</th>
                          <th className="text-right!">Mentions</th>
                          <th>Negative ◀ ▶ Positive</th>
                          <th className="text-right!">Positive</th>
                          <th className="text-right!">Negative</th>
                          <th className="text-right!">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.aspects.map((a) => (
                          <tr key={a.aspect}>
                            <td>
                              <span className="flex items-center gap-2.5 whitespace-nowrap">
                                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-mist text-forest"><AspectIcon aspect={a.aspect} className="size-4" /></span>
                                <span className="font-bold text-ink">{a.label}</span>
                              </span>
                            </td>
                            <td className="tabular-nums text-right">{formatNumber(a.mentions)}</td>
                            <td><SentimentBar pos={a.posShare} neg={a.negShare} /></td>
                            <td className="tabular-nums text-right text-div-pos">{pct(a.posShare)}</td>
                            <td className="tabular-nums text-right text-div-neg">{pct(a.negShare)}</td>
                            <td className="tabular-nums text-right font-serif text-lg font-medium text-pine">{a.score ?? '–'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </Card>

                  {d.marketGrid.length > 1 && (
                    <Card>
                      <CardHeader icon="layers" title="Micro-markets compared" />
                      <Heatmap
                        rowLabel="Micro-market"
                        aspects={ASPECTS}
                        rows={d.marketGrid.map((m) => ({ key: m.clusterId ?? 'none', label: m.label, cells: m.cells, hotels: m.hotels, reviews: m.reviews }))}
                        extraCols={[{ key: 'h', label: 'Hotels', render: (r) => r.hotels }, { key: 'r', label: 'Reviews', render: (r) => formatNumber(r.reviews) }]}
                      />
                    </Card>
                  )}

                  <div className="grid gap-6 lg:grid-cols-2">
                    {d.monthly.length > 0 && (
                      <Card>
                        <CardHeader icon="calendar" title="Destination complaints by month" desc="Complaints about things outside any hotel’s control, per month." />
                        <MiniBars data={d.monthly} valueKey="destination" labelKey="month" />
                      </Card>
                    )}

                    {d.strengths.length > 0 && (
                      <Card ornament>
                        <CardHeader icon="star" title="What visitors praise" />
                        <ul className="divide-y divide-line">
                          {d.strengths.map((s) => (
                            <li key={s.issue} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-good-bg text-good"><Icon name="check" className="size-4" /></span>
                              <span className="text-sm">
                                <strong className="text-pine">{s.label}</strong>
                                <span className="text-slate"> — {s.praise} mentions at {s.hotels} properties</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}
                  </div>
                </>
              ) : (
                <EmptyState title="No analysed reviews for this destination yet." hint="Seed it and let collection and analysis finish." />
              )}
            </div>
          )}
        </DataState>
      </PageBody>
    </>
  );
}

function IssueList({ items, empty }) {
  if (!items.length) return <EmptyState icon="check" title={empty} />;
  return (
    <ul className="grid items-start gap-4 lg:grid-cols-2">
      {items.map((i) => (
        <li key={i.issue} className="rounded-2xl bg-ivory/80 p-4 ring-1 ring-line">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="flex items-center gap-2">
              <strong className="font-serif text-lg font-medium text-pine">{i.label}</strong>
              <Badge tone="muted">{i.aspectLabel}</Badge>
            </p>
          </div>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-slate">
            <span className="inline-flex items-center gap-1 text-bad"><Icon name="alert" className="size-3.5" /><span className="tabular-nums">{i.complaints}</span> complaints</span>
            <span className="inline-flex items-center gap-1"><Icon name="hotel" className="size-3.5" /><span className="tabular-nums">{i.hotelsAffected}</span> properties ({pct(i.hotelsShare)})</span>
            <span className="inline-flex items-center gap-1"><Icon name="chart" className="size-3.5" /><span className="tabular-nums">{i.per100Reviews}</span> per 100 reviews</span>
          </p>
          <ul className="mt-3 space-y-2.5">
            {i.evidence.map((q, k) => (
              <li key={k} className="border-l-[3px] border-geru bg-white py-2 pr-3 pl-3.5 text-sm text-ink">
                <span className="italic">“{q.quote}”</span>
                <span className="mt-1 block text-xs text-slate">— {q.hotelName}, {PLATFORM_LABELS[q.platform] ?? q.platform}{q.publishedAt ? `, ${formatDate(q.publishedAt, 'month')}` : ''}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
