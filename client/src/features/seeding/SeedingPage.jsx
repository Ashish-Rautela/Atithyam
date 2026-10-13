import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/httpClient.js';
import { DataState } from '../../components/DataState.jsx';
import { formatNumber, timeAgo, relativeTime, JOB_STATUS, JOB_KIND } from '../../utils/format.js';
import { REGION_DESTINATIONS } from '../home/data/homeDemo.js';
import { Badge, Button, Card, CardHeader, Field, MountainPhoto, Notice, PageBody, PageHero, Progress, Table, cx } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';
import { AipanMandala, AipanRule } from '../../ui/aipan.jsx';

/** Different crops of the one Himalaya photograph, so each destination card reads as its own view. */
const CARD_CROPS = ['18% 38%', '52% 30%', '84% 42%', '35% 58%', '68% 24%', '8% 52%'];

/** Seeded towns as destination cards, plus suggestions for hill towns not seeded yet. */
function DestinationGallery({ items, onSuggest }) {
  const seeded = new Set(items.map((c) => String(c.name).toLowerCase()));
  const suggestions = REGION_DESTINATIONS.filter((d) => !seeded.has(d.name.toLowerCase())).slice(0, Math.max(0, 6 - items.length));
  return (
    <section aria-label="Destinations" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((c, i) => {
        const st = CITY_STATUS[c.status] ?? CITY_STATUS.pending;
        return (
          <article key={c.cityId} className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-line">
            <div className="relative h-44 overflow-hidden">
              <MountainPhoto position={CARD_CROPS[i % CARD_CROPS.length]} className="scale-[1.15]" />
              <div className="absolute inset-0 bg-linear-to-t from-pine/90 via-pine/30 to-sky-deep/10" />
              <Badge tone={st.tone} icon={st.icon} className="absolute top-3 left-3 shadow-sm">{st.label}</Badge>
              <div className="absolute inset-x-4 bottom-3">
                <p className="eyebrow text-glacier">{[c.kind === 'city' ? 'City' : 'Town', c.region].filter(Boolean).join(' · ')}</p>
                <h3 className="text-shadow-soft font-serif text-2xl leading-tight font-medium text-white">{c.displayName ?? c.name}</h3>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-4 p-5">
              <dl className="grid grid-cols-3 gap-2">
                <MiniTag label="Hotels" value={formatNumber(c.stats.hotels)} icon="hotel" />
                <MiniTag label="Reviews" value={formatNumber(c.stats.reviews)} icon="quote" />
                <MiniTag label="Micro-markets" value={c.stats.clusters} icon="layers" />
              </dl>
              <div className="mt-auto flex flex-wrap gap-2">
                <Button to={`/seeding/${c.cityId}/destination`} size="sm" icon="arrowRight" className="min-h-10">Destination view</Button>
                <Button to={`/seeding/${c.cityId}`} size="sm" variant="ghost" className="min-h-10">Hotels &amp; micro-markets</Button>
              </div>
            </div>
          </article>
        );
      })}
      {suggestions.map((d) => (
        <article key={d.id} className="relative flex flex-col gap-3 overflow-hidden rounded-3xl border-2 border-dashed border-pine/15 bg-rice p-5">
          <AipanMandala className="pointer-events-none absolute -top-6 -right-6 size-24 opacity-15" detail="simple" />
          <p className="eyebrow flex items-center gap-2 text-geru"><Icon name="flag" className="size-4" />Not seeded yet</p>
          <div>
            <h3 className="font-serif text-2xl leading-tight font-medium text-pine">{d.name}</h3>
            <p className="mt-1 text-sm text-slate">{d.kind} · {d.region}</p>
          </div>
          <Button size="sm" variant="ghost" iconLeft="pin" className="mt-auto min-h-10 self-start" onClick={() => onSuggest(d.name)}>Seed {d.name}</Button>
        </article>
      ))}
    </section>
  );
}

/** A small brass-tag style stat for destination cards. */
function MiniTag({ label, value, icon }) {
  return (
    <div className="relative rounded-2xl bg-ivory px-2.5 pt-2.5 pb-2 ring-1 ring-line">
      <span aria-hidden="true" className="absolute top-2 right-2 size-2 rounded-full bg-white ring-1 ring-line" />
      <dt className="flex items-start gap-1 pr-2 text-[0.62rem] leading-tight font-extrabold tracking-[0.06em] text-slate uppercase">
        <Icon name={icon} className="size-3.5 shrink-0" /><span className="min-w-0 break-words">{label}</span>
      </dt>
      <dd className="tabular-nums mt-1 font-serif text-xl leading-none font-medium text-pine">{value}</dd>
    </div>
  );
}

const CITY_STATUS = {
  pending: { label: 'Queued', tone: 'muted', icon: 'clock' },
  seeding: { label: 'Seeding', tone: 'info', icon: 'refresh' },
  ready: { label: 'Ready', tone: 'good', icon: 'check' },
  paused: { label: 'Paused', tone: 'warn', icon: 'clock' },
  failed: { label: 'Failed', tone: 'bad', icon: 'alert' },
};

/** Operator page: add cities/towns to pre-build the database, watch progress, pause / re-seed. */
export default function SeedingPage() {
  const qc = useQueryClient();
  const [names, setNames] = useState('');
  const [kind, setKind] = useState('town');
  const [radiusKm, setRadiusKm] = useState('');
  const [maxReviews, setMaxReviews] = useState(30);
  const [enrich, setEnrich] = useState(true);

  const cities = useQuery({ queryKey: ['cities'], queryFn: api.listCities, refetchInterval: 5000 });
  const queue = useQuery({ queryKey: ['queue'], queryFn: api.getQueue, refetchInterval: 5000 });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['cities'] });
    qc.invalidateQueries({ queryKey: ['queue'] });
  };

  const parsed = names.split(/[\n,]/).map((n) => n.trim()).filter((n) => n.length >= 2);
  const add = useMutation({
    mutationFn: () => api.addCities({ names: parsed, kind, maxReviews: Number(maxReviews), enrich, ...(radiusKm ? { radiusKm: Number(radiusKm) } : {}) }),
    onSuccess: () => {
      setNames('');
      refresh();
    },
  });
  const action = useMutation({
    mutationFn: ({ cityId, type, mode }) => (type === 'pause' ? api.pauseCity(cityId) : api.reseedCity(cityId, { mode })),
    onSuccess: refresh,
  });

  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Destinations' }]}
        deva="देवभूमि"
        eyebrow="Uttarakhand · destinations"
        title="Destinations across the hills"
        subtitle="Every seeded town, its hotels and micro-markets — and the hill towns still to add."
        actions={<Button href="#seed-form" variant="light" iconLeft="pin">Seed a new town</Button>}
        position="50% 40%"
      />
      <PageBody>
        {cities.data && (
          <div>
            <DestinationGallery
              items={cities.data.items}
              onSuggest={(n) => {
                setNames(n);
                document.getElementById('seed-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            />
          </div>
        )}

        <Card id="seed-form" ornament className="scroll-mt-24">
          <CardHeader
            icon="pin"
            title="Seed a new town"
            desc="Pre-build the database so owners get their data instantly. For each place we find it on Google Maps, search the whole area tile by tile for hotels, guest houses, resorts and homestays, link nearby hotels and group them into micro-markets, then collect every hotel from all platforms (most-reviewed first). Every hotel is refreshed about every 15 days afterwards, on its own staggered date."
          />
          <form className="grid gap-4 lg:grid-cols-[1.3fr_1fr]" onSubmit={(e) => { e.preventDefault(); if (parsed.length) add.mutate(); }}>
            <Field label="Cities / towns — one per line or comma-separated" hint={parsed.length ? `${parsed.length} place${parsed.length > 1 ? 's' : ''} ready: ${parsed.join(', ')}` : undefined}>
              <textarea className="field min-h-36 resize-y" rows={4} value={names} onChange={(e) => setNames(e.target.value)} placeholder={'Mussoorie\nDhanaulti, Chakrata'} />
            </Field>
            <div className="grid content-start gap-3 sm:grid-cols-3 lg:grid-cols-3">
              <Field label="Type">
                <select className="field" value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="town">Town</option>
                  <option value="city">City</option>
                </select>
              </Field>
              <Field label="Radius (km)">
                <input className="field" type="number" min={1} max={15} step={0.5} value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)} placeholder="auto" />
              </Field>
              <Field label="Reviews / platform">
                <input className="field" type="number" min={5} max={200} value={maxReviews} onChange={(e) => setMaxReviews(e.target.value)} />
              </Field>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl bg-ivory px-4 py-2 text-sm font-semibold text-ink ring-1 ring-line sm:col-span-3">
                <input type="checkbox" className="size-5 shrink-0 accent-forest" checked={enrich} onChange={(e) => setEnrich(e.target.checked)} /> Collect every hotel (not just find them)
              </label>
              <button
                type="submit"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-forest px-6 text-[0.92rem] font-bold text-white shadow-[0_12px_24px_-14px_rgb(16_47_41/0.9)] transition hover:bg-pine disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-3"
                disabled={!parsed.length || add.isPending}
              >
                <Icon name="mountain" className="size-4.5" />
                {add.isPending ? 'Adding…' : `Start seeding${parsed.length ? ` ${parsed.length} place${parsed.length > 1 ? 's' : ''}` : ''}`}
              </button>
            </div>
          </form>
          <p className="mt-4 flex gap-2 text-xs text-slate">
            <Icon name="info" className="mt-px size-4 shrink-0" />
            <span>
              “auto” radius uses the area Google Maps frames when you search the town (about 3–4 km for a small town). Seeding
              runs in the background on this machine while the app is open; a small town takes roughly 20–40 minutes to map
              and then about a minute per hotel to collect.
            </span>
          </p>
          <div className="mt-3 space-y-3 empty:hidden">
            {add.isError && <Notice tone="bad">{add.error.message}</Notice>}
            {add.isSuccess && (
              <Notice tone="warn" icon="clock">
                {add.data.items.map((i) => `${i.name}: ${i.alreadyRunning ? 'already being seeded' : 'queued'}`).join(' · ')}
              </Notice>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader icon="map" title="Places" desc="Every town in the database, its collection progress and what runs next." />
          <DataState query={cities} isEmpty={(d) => !d.items.length} emptyTitle="No cities yet" emptyHint="Add a town above to start building the database.">
            {(d) => (
              <Table>
                <thead>
                  <tr>
                    <th>Place</th>
                    <th>Status</th>
                    <th className="text-right!">Hotels</th>
                    <th>Collected</th>
                    <th className="text-right!">Reviews</th>
                    <th className="text-right!">Clusters</th>
                    <th>Jobs</th>
                    <th>Seeded</th>
                    <th className="relative"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((c) => {
                    const st = CITY_STATUS[c.status] ?? CITY_STATUS.pending;
                    const pct = c.stats.hotels ? Math.round((c.stats.profiled / c.stats.hotels) * 100) : 0;
                    return (
                      <tr key={c.cityId}>
                        <td className="min-w-52">
                          <Link to={`/seeding/${c.cityId}`} className="font-bold text-pine hover:text-forest hover:underline">{c.displayName ?? c.name}</Link>
                          {c.stats.profiled > 0 && <> <span className="text-slate">·</span> <Link className="text-xs font-semibold text-forest hover:underline" to={`/seeding/${c.cityId}/destination`}>destination view</Link></>}
                          <div className="mt-0.5 text-xs text-slate">{[c.kind === 'city' ? 'City' : 'Town', c.region, c.radiusKm && `${c.radiusKm} km radius`].filter(Boolean).join(' · ')}</div>
                          {c.lastError && c.status !== 'ready' && <div className="mt-1 flex items-start gap-1 text-xs text-bad"><Icon name="alert" className="size-3.5 shrink-0" />{c.lastError}</div>}
                        </td>
                        <td><Badge tone={st.tone} icon={st.icon}>{st.label}</Badge></td>
                        <td className="tabular-nums text-right">{formatNumber(c.stats.hotels)}</td>
                        <td className="min-w-32">
                          <Progress value={pct} className="w-28" />
                          <span className="tabular-nums mt-1 block text-xs text-slate" title={`${c.stats.profiled} of ${c.stats.hotels}`}>{c.stats.profiled}/{c.stats.hotels}{c.stats.failed ? ` · ${c.stats.failed} failed` : ''}</span>
                        </td>
                        <td className="tabular-nums text-right">{formatNumber(c.stats.reviews)}</td>
                        <td className="tabular-nums text-right">{c.stats.clusters}</td>
                        <td className="text-xs whitespace-nowrap">{c.stats.runningJobs ? `${c.stats.runningJobs} running · ` : ''}{c.stats.queuedJobs} queued</td>
                        <td className="text-xs whitespace-nowrap">
                          {c.lastSeededAt ? timeAgo(c.lastSeededAt) : '–'}
                          {c.stats.nextRefreshAt && <div className="text-slate">next refresh {relativeTime(c.stats.nextRefreshAt)}</div>}
                        </td>
                        <td>
                          <div className="flex flex-nowrap justify-end gap-2">
                            {['pending', 'seeding'].includes(c.status) || c.stats.queuedJobs ? (
                              <Button size="sm" variant="ghost" className="min-h-10" disabled={action.isPending} onClick={() => action.mutate({ cityId: c.cityId, type: 'pause' })}>Pause</Button>
                            ) : null}
                            {['paused', 'failed'].includes(c.status) && (
                              <Button size="sm" variant="ghost" className="min-h-10" disabled={action.isPending} onClick={() => action.mutate({ cityId: c.cityId, mode: 'resume' })}>Resume</Button>
                            )}
                            {c.status === 'ready' && !c.stats.queuedJobs && (
                              <>
                                <Button size="sm" variant="ghost" iconLeft="refresh" className="min-h-10" title="Search the map again for new or closed hotels and collect hotels whose refresh is due" disabled={action.isPending} onClick={() => action.mutate({ cityId: c.cityId, mode: 'refresh' })}>Re-seed</Button>
                                <Button size="sm" variant="subtle" className="min-h-10" title="Search the map again and re-collect every hotel now" disabled={action.isPending} onClick={() => action.mutate({ cityId: c.cityId, mode: 'full' })}>Full re-seed</Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </DataState>
          {action.isError && <Notice tone="bad" className="mt-4">{action.error.message}</Notice>}
        </Card>

        <QueuePanel queue={queue} />
      </PageBody>
    </>
  );
}

function QueuePanel({ queue }) {
  return (
    <Card tone="parchment">
      <CardHeader icon="clock" title="Background work" desc="The front desk’s queue: what is collecting now and what runs next." />
      <DataState query={queue}>
        {(q) => {
          const totals = {};
          for (const r of q.byKind) totals[r.status] = (totals[r.status] ?? 0) + r.n;
          const jobs = [...q.running, ...q.next];
          return (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <QueueStat label="Running" value={totals.running ?? 0} icon="refresh" />
                <QueueStat label="Queued" value={totals.queued ?? 0} icon="clock" />
                <QueueStat label="Done · 24 h" value={totals.completed ?? 0} icon="check" />
                <QueueStat label="Failed · 24 h" value={totals.failed ?? 0} icon="alert" />
              </div>
              <p className="mt-3 text-xs text-slate">Owners’ requests always run before seeding and scheduled refreshes.</p>
              {jobs.length === 0 ? (
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-4 ring-1 ring-line">
                  <AipanRule className="h-3 w-16 shrink-0" />
                  <span className="font-serif text-lg text-pine">Nothing to do.</span>
                </div>
              ) : (
                <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line">
                  {jobs.map((j) => (
                    <li key={j.jobId} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                      <Badge tone={JOB_STATUS[j.status]?.tone ?? 'muted'} className="self-start sm:self-auto">{JOB_STATUS[j.status]?.label ?? j.status}</Badge>
                      <span className="min-w-0 text-sm">{JOB_KIND[j.kind] ?? j.kind}: <strong className="text-pine">{j.hotelName ?? j.cityName ?? '–'}</strong></span>
                      <span className="min-w-0 text-xs text-slate sm:ml-auto sm:text-right">{j.reason} · priority {j.priority}{j.status === 'running' && j.message ? ` · ${j.message}` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          );
        }}
      </DataState>
    </Card>
  );
}

function QueueStat({ label, value, icon }) {
  return (
    <div className={cx('rounded-2xl bg-white px-3 py-2.5 ring-1 ring-line')}>
      <p className="flex items-center gap-1.5 text-[0.68rem] font-extrabold tracking-[0.1em] text-slate uppercase"><Icon name={icon} className="size-3.5" />{label}</p>
      <p className="tabular-nums mt-1 font-serif text-2xl leading-none text-pine">{value}</p>
    </div>
  );
}
