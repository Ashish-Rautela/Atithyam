import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/httpClient.js';
import { DataState } from '../../components/DataState.jsx';
import { formatInr, formatNumber, timeAgo, relativeTime, PROFILE_STATUS, JOB_STATUS } from '../../utils/format.js';
import { Badge, Button, Card, CardHeader, EmptyState, KeyTag, PageBody, PageHero, Progress, Table, cx } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';

const PHASES = { resolve: 'Finding the town on Google Maps', discover: 'Searching the map for hotels', graph: 'Linking nearby hotels', enrich: 'Queuing hotel collection', done: 'Done' };

export default function CityPage() {
  const { cityId } = useParams();
  const [clusterId, setClusterId] = useState(null);
  const detail = useQuery({
    queryKey: ['city', cityId, clusterId],
    queryFn: () => api.getCity(cityId, clusterId),
    refetchInterval: (q) => (['queued', 'running'].includes(q.state.data?.seedJob?.status) || q.state.data?.city?.stats?.queuedJobs ? 4000 : false),
  });

  const hc = detail.data?.city;
  const heroName = hc ? hc.displayName ?? hc.name : 'Town';

  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Destinations', to: '/seeding' }, { label: heroName }]}
        deva="पहाड़ का शहर"
        eyebrow="Hotels & micro-markets"
        title={hc ? heroName : detail.isError ? 'Town' : 'Loading town…'}
        subtitle={hc ? [hc.region, hc.radiusKm && `${hc.radiusKm} km radius (${hc.radiusSource === 'operator' ? 'set by you' : 'from Google Maps'})`, hc.lastSeededAt && `seeded ${timeAgo(hc.lastSeededAt)}`].filter(Boolean).join(' · ') : undefined}
        actions={
          <>
            <Button to={`/seeding/${cityId}/destination`} variant="light" icon="arrowRight">Destination view</Button>
            {hc?.googleUrl && <Button href={hc.googleUrl} target="_blank" rel="noreferrer" variant="glass" iconLeft="map">Open in Google Maps</Button>}
          </>
        }
        position="30% 40%"
      />
      <PageBody>
        <DataState query={detail} loadingText="Loading city…">
          {(d) => {
            const { city, seedJob, clusters, hotels } = d;
            const p = seedJob?.progress ?? {};
            const activeCluster = clusters.find((k) => k.id === clusterId);
            return (
              <div className="space-y-6">
                <section aria-label="Town at a glance" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
                  <KeyTag label="Hotels" value={formatNumber(city.stats.hotels)} icon="hotel" tone="pine" />
                  <KeyTag label="Collected" value={`${city.stats.profiled}/${city.stats.hotels}`} icon="check" />
                  <KeyTag label="Reviews stored" value={formatNumber(city.stats.reviews)} icon="quote" />
                  <KeyTag label="Clusters" value={city.stats.clusters} icon="layers" />
                  <KeyTag label="Jobs queued" value={city.stats.queuedJobs} icon="clock" className="col-span-2 md:col-span-1" />
                </section>

                <Card>
                  <CardHeader
                    icon="mountain"
                    title="Seeding run"
                    desc={`Each hotel is refreshed about every ${d.refresh.intervalDays} days (± ${Math.round(d.refresh.jitterHours / 24)} days, so refreshes are spread out).`}
                  />
                  {!seedJob ? (
                    <EmptyState title="Not seeded yet." icon="flag" />
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <Badge tone={JOB_STATUS[seedJob.status]?.tone ?? 'muted'}>{JOB_STATUS[seedJob.status]?.label ?? seedJob.status}</Badge>
                        {p.phase && p.phase !== 'done' && <span className="text-sm font-semibold text-pine">{PHASES[p.phase] ?? p.phase}</span>}
                        {seedJob.finishedAt && <span className="inline-flex items-center gap-1 text-xs text-slate"><Icon name="clock" className="size-3.5" />finished {timeAgo(seedJob.finishedAt)}</span>}
                      </div>
                      {p.tiles > 0 && (
                        <div title={`${p.tilesDone?.length ?? 0} of ${p.tiles} map tiles`}>
                          <Progress value={Math.round(((p.tilesDone?.length ?? 0) / p.tiles) * 100)} />
                          <p className="tabular-nums mt-1 text-xs text-slate">{p.tilesDone?.length ?? 0} of {p.tiles} map tiles</p>
                        </div>
                      )}
                      {seedJob.message && <p className="rounded-2xl bg-ivory px-4 py-3 text-sm text-ink ring-1 ring-line" aria-live="polite">{seedJob.message}</p>}
                    </div>
                  )}
                </Card>

                {clusters.length > 0 && (
                  <Card>
                    <CardHeader
                      icon="layers"
                      title="Micro-markets"
                      desc="Hotels that sit close together (chains of hotels within about 600 m) form one micro-market. Choose one to filter the list."
                    />
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter hotels by micro-market">
                      <ClusterChip on={!clusterId} onClick={() => setClusterId(null)} label="All" />
                      {clusters.map((k) => (
                        <ClusterChip
                          key={k.id}
                          on={clusterId === k.id}
                          onClick={() => setClusterId(k.id)}
                          label={k.label}
                          meta={`${k.hotelCount} hotels${k.medianPriceInr ? ` · ~${formatInr(k.medianPriceInr)}` : ''}`}
                        />
                      ))}
                    </div>
                  </Card>
                )}

                <Card>
                  <CardHeader
                    icon="hotel"
                    title={`Hotels${clusterId ? ` in ${activeCluster?.label}` : ''}`}
                    actions={<Badge tone="muted"><span className="tabular-nums">{hotels.length}</span>&nbsp;listed</Badge>}
                  />
                  {hotels.length === 0 ? (
                    <EmptyState icon="hotel" title="No hotels yet." hint="They appear here as the map search finds them." />
                  ) : (
                    <Table>
                      <thead>
                        <tr>
                          <th>Hotel</th>
                          <th>Micro-market</th>
                          <th>Google</th>
                          <th className="text-right!">Price</th>
                          <th>Data</th>
                          <th className="text-right!">Reviews stored</th>
                          <th>Next refresh</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hotels.map((h) => {
                          const ps = PROFILE_STATUS[h.profileStatus] ?? PROFILE_STATUS.none;
                          return (
                            <tr key={h.hotelId} className={h.isTarget ? 'bg-geru-50/50' : ''}>
                              <td className="min-w-52">
                                <Link to={`/business/${h.hotelId}`} className="font-bold text-pine hover:text-forest hover:underline">{h.name}</Link>
                                {h.isTarget && <Badge tone="info" icon="key" className="ml-2">Owner</Badge>}
                                <div className="mt-0.5 text-xs text-slate">{h.starClass ? `${h.starClass}★ hotel` : h.lodgingType ?? ''}</div>
                              </td>
                              <td className="text-xs">{h.cluster ?? '–'}</td>
                              <td className="tabular-nums whitespace-nowrap">{h.googleRating ?? '–'} <span className="text-xs text-slate">({formatNumber(h.googleReviewCount)})</span></td>
                              <td className="tabular-nums text-right whitespace-nowrap font-semibold">{formatInr(h.priceInr)}</td>
                              <td className="whitespace-nowrap">
                                {h.jobStatus && ['queued', 'running'].includes(h.jobStatus)
                                  ? <Badge tone={JOB_STATUS[h.jobStatus].tone}>{JOB_STATUS[h.jobStatus].label}</Badge>
                                  : <Badge tone={ps.tone}>{ps.label}</Badge>}
                                {h.lastProfiledAt && <div className="mt-0.5 text-xs text-slate">{timeAgo(h.lastProfiledAt)}</div>}
                              </td>
                              <td className="tabular-nums text-right">{formatNumber(h.reviewsStored)}</td>
                              <td className="text-xs whitespace-nowrap">{h.nextRefreshAt ? relativeTime(h.nextRefreshAt) : '–'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  )}
                </Card>
              </div>
            );
          }}
        </DataState>
      </PageBody>
    </>
  );
}

/** Micro-market filter chip (toggle button). */
function ClusterChip({ on, onClick, label, meta }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold transition',
        on ? 'bg-forest text-white shadow-[0_12px_24px_-14px_rgb(16_47_41/0.9)]' : 'bg-white text-pine ring-1 ring-line hover:ring-forest/50',
      )}
    >
      {on ? <Icon name="check" className="size-4" /> : <Icon name="pin" className="size-4 text-geru" />}
      {label}
      {meta && <span className={cx('tabular-nums text-xs font-semibold', on ? 'text-mist/85' : 'text-slate')}>· {meta}</span>}
    </button>
  );
}
