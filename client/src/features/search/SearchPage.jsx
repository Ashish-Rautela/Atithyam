import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../services/httpClient.js';
import { DataState } from '../../components/DataState.jsx';
import { formatNumber, timeAgo, freshnessText, PROFILE_STATUS } from '../../utils/format.js';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Notice, PageBody, PageHero, Spinner } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';
import { AipanRule } from '../../ui/aipan.jsx';

/** Small "4.3★ · 1,204 Google reviews" line with icons. */
function RatingLine({ rating, count }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink">
      <span className="inline-flex items-center gap-1 font-bold">
        <Icon name="star" className="size-4 text-amber" />
        {rating ? <span className="num">{rating}★</span> : <span className="font-medium text-slate">No rating</span>}
      </span>
      <span className="inline-flex items-center gap-1 text-slate">
        <Icon name="quote" className="size-4" />
        <span><span className="num font-semibold text-ink">{formatNumber(count)}</span> Google reviews</span>
      </span>
    </p>
  );
}

/** A hotel result rendered as a card with a "This is my property" action. */
function HotelCard({ name, badge, meta, rating, count, extra, action }) {
  return (
    <li className="flex flex-col gap-4 rounded-3xl bg-rice p-5 ring-1 ring-line transition hover:ring-forest/30 hover:shadow-card">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-mist text-forest">
          <Icon name="hotel" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-lg leading-snug font-medium break-words text-pine">
            {name}
            {badge && <span className="ml-2 inline-block align-middle">{badge}</span>}
          </h3>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-slate">
            <Icon name="pin" className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 break-words">{meta}</span>
          </p>
        </div>
      </div>
      <RatingLine rating={rating} count={count} />
      {extra}
      <div className="mt-auto">{action}</div>
    </li>
  );
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Pre-filled from the homepage's "Start with your hotel's name" form.
  const [name, setName] = useState(() => params.get('name') ?? '');
  const [location, setLocation] = useState('Mussoorie');
  const [maxReviews, setMaxReviews] = useState(60);

  // Instant database lookup while typing (no scraping).
  const [debounced, setDebounced] = useState({ name: '', location: '' });
  useEffect(() => {
    const t = setTimeout(() => setDebounced({ name: name.trim(), location: location.trim() }), 300);
    return () => clearTimeout(t);
  }, [name, location]);
  const lookup = useQuery({
    queryKey: ['lookup', debounced.name, debounced.location],
    queryFn: () => api.lookup(debounced.name, debounced.location),
    enabled: debounced.name.length >= 3,
    placeholderData: (prev) => prev,
  });

  const search = useMutation({ mutationFn: () => api.search(name.trim(), location.trim()) });
  const create = useMutation({
    mutationFn: (candidate) =>
      candidate.hotelId
        ? api.createBusiness({ hotelId: candidate.hotelId, location: location.trim() || undefined, maxReviews: Number(maxReviews) })
        : api.createBusiness({ name: candidate.name, location: location.trim(), googleUrl: candidate.url, maxReviews: Number(maxReviews) }),
    onSuccess: ({ bizId }) => navigate(`/business/${bizId}/benchmark`),
  });
  const dbMatches = debounced.name.length >= 3 ? lookup.data?.items ?? [] : [];
  const recent = useQuery({ queryKey: ['businesses'], queryFn: api.listBusinesses });

  const onSubmit = (e) => {
    e.preventDefault();
    if (name.trim().length >= 2) search.mutate();
  };

  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Check in' }]}
        deva="स्वागत है"
        eyebrow="Front desk"
        title="Check in your hotel"
        subtitle="Tell us your hotel’s name and town. If we already know it you get its data instantly; otherwise we find it on Google Maps, collect it from every platform, and do the same for the hotels around it."
      />
      <PageBody>
        <Card ornament className="shadow-lift">
          <CardHeader
            icon="key"
            title="Find your property"
            desc="Start typing — hotels already in our database appear below straight away."
          />
          <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_10rem] lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_10rem_auto] lg:items-end">
            <Field label="Property name">
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. JW Marriott Walnut Grove" required minLength={2} maxLength={120} autoFocus />
            </Field>
            <Field label="Town / area">
              <input className="field" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Mussoorie" maxLength={120} />
            </Field>
            <Field label="Reviews per platform">
              <input className="field num" type="number" min={5} max={500} value={maxReviews} onChange={(e) => setMaxReviews(e.target.value)} />
            </Field>
            <Button type="submit" size="lg" iconLeft="search" className="w-full md:col-span-3 lg:col-span-1 lg:w-auto" disabled={search.isPending || name.trim().length < 2}>
              {search.isPending ? 'Searching Google Maps…' : 'Search Google Maps'}
            </Button>
          </form>
          {search.isPending && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-mist px-4 py-3 text-sm text-slate" role="status">
              <Spinner className="size-6 shrink-0" />
              A browser window opens on the server machine while we search. This takes 10–30 seconds.
            </div>
          )}
          {search.isError && <Notice tone="bad" className="mt-4">{search.error.message}</Notice>}
        </Card>

        {dbMatches.length > 0 && (
          <Card>
            <CardHeader
              icon="bell"
              title="Already in our database"
              desc="Pick yours to open it straight away — no waiting. Not listed? Use “Search Google Maps”."
            />
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {dbMatches.map((h) => (
                <HotelCard
                  key={h.hotelId}
                  name={h.name}
                  meta={[h.cityName, h.address].filter(Boolean).join(' · ') || 'Address not collected yet'}
                  rating={h.googleRating}
                  count={h.googleReviewCount}
                  extra={
                    <div>
                      <Badge tone={(PROFILE_STATUS[h.profileStatus] ?? PROFILE_STATUS.none).tone} icon="clock">{freshnessText(h)}</Badge>
                    </div>
                  }
                  action={
                    <Button className="w-full" iconLeft="key" disabled={create.isPending} onClick={() => create.mutate({ hotelId: h.hotelId })}>
                      {create.isPending && create.variables?.hotelId === h.hotelId ? 'Opening…' : 'This is my property'}
                    </Button>
                  }
                />
              ))}
            </ul>
            {create.isError && !search.isSuccess && <Notice tone="bad" className="mt-4">{create.error.message}</Notice>}
          </Card>
        )}

        {search.isSuccess && (
          <Card>
            <CardHeader icon="map" title="Which one is yours?" desc="Results from Google Maps." />
            {search.data.candidates.length === 0 ? (
              <EmptyState
                icon="search"
                title="No matches on Google Maps."
                hint="Try the name exactly as it appears on Google, or add the area (e.g. “Landour”)."
              />
            ) : (
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {search.data.candidates.map((c) => (
                  <HotelCard
                    key={c.url}
                    name={c.name}
                    badge={c.inDatabase && <Badge tone="good" icon="check">In database</Badge>}
                    meta={[c.category, c.address].filter(Boolean).join(' · ') || 'Address not shown'}
                    rating={c.rating}
                    count={c.reviewCount}
                    action={
                      <Button className="w-full" iconLeft="key" disabled={create.isPending} onClick={() => create.mutate(c)}>
                        {create.isPending && create.variables?.url === c.url ? 'Starting…' : 'This is my property'}
                      </Button>
                    }
                  />
                ))}
              </ul>
            )}
            {create.isError && <Notice tone="bad" className="mt-4">{create.error.message}</Notice>}
          </Card>
        )}

        <Card>
          <CardHeader icon="hotel" title="My properties" desc="Hotels you have checked in. Open one to see its benchmark." />
          <DataState query={recent} isEmpty={(d) => !d.items.length} emptyTitle="No properties yet" emptyHint="Search for your property above to start.">
            {(d) => (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {d.items.map((b) => (
                  <li key={b.bizId}>
                    <Link
                      to={`/business/${b.bizId}/benchmark`}
                      className="group relative flex h-full flex-col overflow-hidden rounded-[1.6rem] bg-white p-5 pt-6 ring-1 ring-line shadow-card transition hover:-translate-y-0.5 hover:ring-forest/40"
                    >
                      <span aria-hidden="true" className="absolute top-4 right-5 size-3.5 rounded-full bg-ivory ring-2 ring-line" />
                      <span aria-hidden="true" className="absolute -top-3 right-[1.55rem] h-7 w-px bg-pine/25" />
                      <span className="eyebrow flex items-center gap-2 pr-8 text-geru">
                        <Icon name="key" className="size-4" /> Room key
                      </span>
                      <span className="mt-2 font-serif text-xl leading-snug font-medium break-words text-pine group-hover:underline">{b.name}</span>
                      <span className="mt-1.5 flex items-start gap-1.5 text-sm text-slate">
                        <Icon name="pin" className="mt-0.5 size-4 shrink-0" />
                        <span className="min-w-0 break-words">{b.location ?? b.address ?? ''}</span>
                      </span>
                      <AipanRule className="my-3 h-2 w-16" />
                      <span className="flex flex-wrap items-center gap-2 text-xs text-slate">
                        <Badge tone={(PROFILE_STATUS[b.profileStatus] ?? PROFILE_STATUS.none).tone} icon="clock">{freshnessText(b)}</Badge>
                        <span>added {timeAgo(b.claimedAt ?? b.createdAt)}</span>
                      </span>
                      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-forest">
                        Open benchmark <Icon name="arrowRight" className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DataState>
        </Card>
      </PageBody>
    </>
  );
}
