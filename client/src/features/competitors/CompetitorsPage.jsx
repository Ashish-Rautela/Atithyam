import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/httpClient.js';
import { DataState } from '../../components/DataState.jsx';
import { PLATFORM_ORDER, formatInr, formatNumber, timeAgo } from '../../utils/format.js';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Notice, PageBody, PageHero, Spinner } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';
import CandidateTable from './CandidateTable.jsx';
import MembersTable from './MembersTable.jsx';

const ACTIVE = ['queued', 'running'];

export default function CompetitorsPage() {
  const { bizId } = useParams();
  const qc = useQueryClient();
  const business = useQuery({ queryKey: ['business', bizId], queryFn: () => api.getBusiness(bizId) });
  const compset = useQuery({
    queryKey: ['competitors', bizId],
    queryFn: () => api.getCompetitors(bizId),
    refetchInterval: (q) => {
      const d = q.state.data;
      const discovering = ACTIVE.includes(d?.discovery?.status) || d?.coverage?.onboardStatus === 'discovering';
      const collecting = d?.members?.some((m) => ACTIVE.includes(m.job?.status));
      return discovering || collecting ? 3000 : false;
    },
  });

  const [radiusKm, setRadiusKm] = useState(3);
  useEffect(() => {
    if (compset.data?.rules?.radiusKm) setRadiusKm(compset.data.rules.radiusKm);
  }, [compset.data?.rules?.radiusKm]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['competitors', bizId] });
  const discover = useMutation({ mutationFn: (force) => api.discoverCompetitors(bizId, { radiusKm: Number(radiusKm), force }), onSuccess: invalidate });

  const name = business.data?.business?.name ?? 'Your property';

  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'My hotel', to: '/search' }, { label: name, to: `/business/${bizId}` }, { label: 'Competitors' }]}
        eyebrow="Your neighbours on the hill"
        deva="पड़ोसी"
        title="Nearby competitors"
        subtitle={`Hotels, guest houses, resorts and homestays around ${name}, from Google Maps. Pick the like-for-like set, then collect the same data for each of them as for your own property.`}
        actions={<Button to={`/business/${bizId}`} variant="glass" iconLeft="arrowLeft">Back to {name}</Button>}
        position="50% 45%"
      />
      <PageBody>
        <DataState query={compset} loadingText="Loading competitors…">
          {(d) => {
            const discovering = ACTIVE.includes(d.discovery?.status) || d.coverage?.onboardStatus === 'discovering';
            const covered = d.coverage?.covered;
            return (
              <div className="space-y-6">
                <Card ornament>
                  <CardHeader
                    icon="map"
                    title={<><StepNo n={1} />Find nearby properties</>}
                    desc="Search the map around your property for every place a guest might book instead."
                    actions={d.discovery?.finishedAt && <Badge tone="muted" icon="clock">Last search {timeAgo(d.discovery.finishedAt)}</Badge>}
                  />
                  <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); discover.mutate(false); }}>
                    <Field label="Search radius" className="sm:w-48">
                      <select className="field" value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)}>
                        {[1, 2, 3, 5, 8].map((k) => <option key={k} value={k}>{k} km</option>)}
                      </select>
                    </Field>
                    {!covered && (
                      <button
                        type="submit"
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-forest px-6 text-[0.92rem] font-bold text-white shadow-[0_12px_24px_-14px_rgb(16_47_41/0.9)] transition hover:bg-pine disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={discovering || discover.isPending || !d.coverage?.hasLocation}
                      >
                        <Icon name="search" className="size-4.5" />
                        {discovering ? 'Searching…' : 'Find nearby hotels'}
                      </button>
                    )}
                    {covered && (
                      <Button
                        variant="ghost"
                        iconLeft="refresh"
                        className="min-h-12"
                        disabled={discovering || discover.isPending}
                        onClick={() => discover.mutate(true)}
                        title="Search Google Maps again for hotels that opened since this area was mapped"
                      >
                        {discovering ? 'Searching…' : 'Search Google again'}
                      </Button>
                    )}
                  </form>

                  <div className="mt-4 space-y-3">
                    {covered && !discovering && (
                      <Notice tone="good" title="From our database">
                        This area is already mapped{d.discovery?.finishedAt ? ` (last search ${timeAgo(d.discovery.finishedAt)})` : ''}, so the {d.candidates.length} hotels below appear instantly.
                      </Notice>
                    )}
                    {!d.coverage?.hasLocation && <Notice tone="warn">Your property’s location is read during its collection — nearby hotels appear once that finishes.</Notice>}
                    {discover.isError && <Notice tone="bad">{discover.error.message}</Notice>}
                    {discovering && (
                      <div className="flex items-center gap-3 rounded-2xl bg-info-bg px-4 py-3 text-sm text-info" aria-live="polite">
                        <Spinner className="size-6 shrink-0" />
                        <span>{d.discovery?.job?.message ?? 'Waiting…'} — this takes 2–4 minutes, then every nearby hotel’s data is collected in the background.</span>
                      </div>
                    )}
                    {d.discovery?.status === 'failed' && <Notice tone="bad">{d.discovery.job?.message}</Notice>}
                  </div>

                  {d.target && (
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-mist/70 px-4 py-3 text-sm text-ink">
                      <span className="inline-flex items-center gap-2 font-bold text-pine"><Icon name="hotel" className="size-4.5 text-forest" />Your property</span>
                      <span className="inline-flex items-start gap-1.5">
                        <Icon name="rupee" className="mt-0.5 size-4 shrink-0 text-slate" />
                        <span>
                          {d.target.priceInr ? `${formatInr(d.target.priceInr)} per night` : 'no price on Google'}
                          {d.target.priceSource === 'google_result_list' && <span className="text-slate"> (from the same Google result list, so prices are for the same dates)</span>}
                        </span>
                      </span>
                      {d.target.rating?.value && (
                        <span className="inline-flex items-start gap-1.5">
                          <Icon name="star" className="mt-0.5 size-4 shrink-0 text-amber-ink" />
                          <span>{d.target.rating.value}★ on Google from {formatNumber(d.target.reviewCount)} reviews</span>
                        </span>
                      )}
                    </div>
                  )}
                  <p className="mt-3 text-xs text-slate">
                    Hotels come from the database (seeded towns and earlier searches). A Google search shows signed-out visitors about
                    8–10 results at a time, so several searches are combined; very small places may still be missed.
                  </p>
                </Card>

                {d.candidates.length > 0 ? (
                  <CandidateTable compset={d} bizId={bizId} onSaved={invalidate} />
                ) : (
                  !discovering && <EmptyState icon="hotel" title="No hotels around this property in the database yet." hint="Use “Find nearby hotels”." />
                )}

                {d.members?.length > 0 && <MembersTable members={d.members} platforms={PLATFORM_ORDER.filter((p) => (d.enabledPlatforms ?? PLATFORM_ORDER).includes(p))} />}
              </div>
            );
          }}
        </DataState>
      </PageBody>
    </>
  );
}

/** Small numbered step marker used in card titles. */
function StepNo({ n }) {
  return <span className="mr-2 inline-grid size-7 translate-y-[-2px] place-items-center rounded-full bg-geru-50 align-middle font-sans text-sm font-extrabold text-geru">{n}</span>;
}
