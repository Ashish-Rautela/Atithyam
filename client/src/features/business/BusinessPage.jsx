import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/httpClient.js';
import { DataState } from '../../components/DataState.jsx';
import { PLATFORM_ORDER, PROFILE_STATUS, freshnessText } from '../../utils/format.js';
import { Badge, Button, Card, CardHeader, Notice, PageBody, PageHero, SectionTitle, Spinner } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';
import JobProgress from './JobProgress.jsx';
import OverviewTable from './OverviewTable.jsx';
import PlatformCard from './PlatformCard.jsx';
import ReviewList from './ReviewList.jsx';

const ACTIVE = ['queued', 'running'];

export default function BusinessPage() {
  const { bizId } = useParams();
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ['business', bizId],
    queryFn: () => api.getBusiness(bizId),
    // Poll while a job is running so progress and results appear live.
    refetchInterval: (q) => (ACTIVE.includes(q.state.data?.latestJob?.status) || ['discovering', 'pending'].includes(q.state.data?.business?.onboardStatus) ? 2500 : false),
  });
  const running = ACTIVE.includes(detail.data?.latestJob?.status);

  const reseed = useMutation({
    mutationFn: () => api.reseedBusiness(bizId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business', bizId] }),
  });
  const refresh = useMutation({
    mutationFn: () => api.refresh(bizId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business', bizId] }),
  });

  const d0 = detail.data;
  const hotelName = d0?.business?.name ?? 'Your hotel';

  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'My hotel', to: '/search' }, { label: hotelName }]}
        eyebrow="Front desk"
        deva="मेरा होटल"
        title={
          <>
            {hotelName}
            {d0?.business?.role === 'competitor' && <Badge tone="dark" icon="layers" className="ml-3 align-middle text-[0.8rem]">In database</Badge>}
          </>
        }
        subtitle={d0 ? (
          <span>
            <Icon name="pin" className="mr-1.5 inline size-4.5 align-[-0.2em]" />
            {[d0.business.address ?? d0.business.location, d0.area?.city?.name && <Link key="c" to={`/seeding/${d0.area.city.cityId}`} className="font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">{d0.area.city.name}</Link>]
              .filter(Boolean)
              .map((x, i) => <span key={i}>{i > 0 && ' · '}{x}</span>)}
          </span>
        ) : undefined}
        actions={d0 && (
          <>
            <Button to={`/business/${bizId}/report`} variant="light" icon="arrowRight">Your report</Button>
            <Button to={`/business/${bizId}/benchmark`} variant="glass" iconLeft="chart">Deep-dive benchmark</Button>
            <Button to={`/business/${bizId}/competitors`} variant="glass" iconLeft="users">Nearby competitors</Button>
            <Button variant="glass" iconLeft="refresh" disabled={running || refresh.isPending} onClick={() => refresh.mutate()}>
              {running ? 'Collecting…' : 'Refresh all platforms'}
            </Button>
            {d0.business.role === 'target' && (
              <Button variant="glass" iconLeft="map" title="Search Google Maps around this hotel again and re-collect every nearby hotel" disabled={reseed.isPending} onClick={() => reseed.mutate()}>
                {reseed.isPending ? 'Starting…' : 'Re-seed neighbourhood'}
              </Button>
            )}
          </>
        )}
      />
      <PageBody>
        <DataState query={detail} loadingText="Loading property…">
          {(d) => {
            const byPlatform = Object.fromEntries(d.listings.map((l) => [l.platform, l]));
            const job = d.latestJob;
            const platforms = PLATFORM_ORDER.filter((p) => (d.enabledPlatforms ?? PLATFORM_ORDER).includes(p));
            return (
              <>
                <Card className="py-4 sm:py-4">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
                    <Link to="/search" className="inline-flex min-h-10 items-center gap-1.5 font-bold text-forest hover:underline">
                      <Icon name="arrowLeft" className="size-4" /> New search
                    </Link>
                    <span className="hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
                    <Badge tone={(PROFILE_STATUS[d.business.profileStatus] ?? PROFILE_STATUS.none).tone} icon="clock">{freshnessText(d.business)}</Badge>
                    {d.area?.cluster && (
                      <span className="inline-flex items-center gap-1.5 text-slate">
                        <Icon name="layers" className="size-4" /> Micro-market: <strong className="text-ink">{d.area.cluster.label}</strong> ({d.area.cluster.hotelCount} hotels)
                      </span>
                    )}
                    {d.area && (
                      <span className="inline-flex items-center gap-1.5 text-slate">
                        <Icon name="hotel" className="size-4" /> <span><span className="num font-bold text-ink">{d.area.neighbours}</span> hotels within 5 km in the database</span>
                      </span>
                    )}
                    {['discovering', 'pending'].includes(d.business.onboardStatus) && (
                      <span className="inline-flex items-center gap-2 text-slate" role="status">
                        <Spinner className="size-5" /> {d.business.onboardStatus === 'pending' ? 'Nearby hotels are found after your property is read' : 'Finding hotels around you…'}
                      </span>
                    )}
                  </div>
                </Card>

                {reseed.isSuccess && <Notice tone="warn">Neighbourhood re-seed started: hotels around you are searched again and re-collected in the background.</Notice>}
                {reseed.isError && <Notice tone="bad">{reseed.error.message}</Notice>}
                {refresh.isError && <Notice tone="bad">{refresh.error.message}</Notice>}

                {job?.status === 'queued' && (
                  <Notice tone="warn" icon="clock">
                    <span className="inline-flex items-center gap-2">
                      <Spinner className="size-5" />
                      Queued — collection starts as soon as the background worker is free{job.reason === 'refresh' ? ' (scheduled refresh)' : ''}.
                    </span>
                  </Notice>
                )}
                {job && running && <JobProgress job={job} />}

                <Card>
                  <CardHeader icon="chart" title="At a glance" desc="Every platform your hotel is listed on, in one ledger." />
                  <OverviewTable listings={byPlatform} job={job} platforms={platforms} />
                  <p className="mt-4 flex items-start gap-2 text-sm text-slate">
                    <Icon name="info" className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Ratings are shown on each platform’s own scale. Scales differ (Booking.com and Agoda use 1–10), so the
                      numbers are not directly comparable between platforms.
                    </span>
                  </p>
                </Card>

                <section aria-labelledby="platforms-title">
                  <SectionTitle eyebrow="Listings" title={<span id="platforms-title">Your hotel on each platform</span>} desc="What each booking site shows guests about you." />
                  <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {platforms.map((p) => (
                      <PlatformCard key={p} platform={p} state={byPlatform[p]} jobState={job?.platforms?.[p]} bizId={bizId} running={running} />
                    ))}
                  </div>
                </section>

                <ReviewList bizId={bizId} refreshKey={job?.finishedAt ?? job?.status} platforms={platforms} />
              </>
            );
          }}
        </DataState>
      </PageBody>
    </>
  );
}
