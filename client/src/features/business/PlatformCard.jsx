import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/httpClient.js';
import { StatusBadge, Stars } from '../../components/DataState.jsx';
import { PLATFORM_LABELS, STATUS_INFO, formatInr, formatNumber, timeAgo } from '../../utils/format.js';
import { Badge, Button, Card, Field, Notice } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';

const PROBLEM = ['NOT_FOUND', 'NEEDS_CONFIRMATION', 'BLOCKED', 'LAYOUT_CHANGED', 'TIMEOUT', 'NETWORK_ERROR', 'FAILED'];

/** Sub-heading inside a platform card. */
const H3 = ({ children }) => <h4 className="eyebrow mb-2 text-slate">{children}</h4>;

/** Label · bar · value row used for category scores and rating distribution. */
function BarRow({ label, pct, value }) {
  return (
    <li className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
      <span className="truncate text-ink" title={label}>{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-parchment" aria-hidden="true">
        <span className="block h-full rounded-full bg-forest" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </span>
      <span className="num min-w-10 text-right font-bold text-pine">{value}</span>
    </li>
  );
}

/** One fact in the definition list. */
function Fact({ label, children, wide }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-xs font-semibold text-slate">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold break-words text-ink">{children}</dd>
    </div>
  );
}

export default function PlatformCard({ platform, state, jobState, bizId, running }) {
  const label = PLATFORM_LABELS[platform];
  const listing = state?.listing;
  const status = jobState?.status === 'RUNNING' ? 'RUNNING' : state?.status ?? jobState?.status ?? 'PENDING';

  return (
    <Card as="article" className="flex min-w-0 flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 font-serif text-xl font-medium text-pine">
          <span className="grid size-9 place-items-center rounded-xl bg-mist text-forest"><Icon name="hotel" className="size-4.5" /></span>
          {label}
        </h3>
        <StatusBadge status={status} info={STATUS_INFO} />
      </header>

      {!state && !jobState && <p className="text-sm text-slate">Not collected yet.</p>}
      {!state && jobState && <p className="text-sm text-slate">{jobState.message}</p>}

      {state?.error && <Notice tone={status === 'NOT_FOUND' ? 'warn' : 'bad'}>{state.error}</Notice>}

      {listing && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-ivory p-4 ring-1 ring-line">
            <div className="min-w-0 flex-1">
              <a href={listing.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1.5 font-bold break-words text-forest hover:underline">
                <span className="min-w-0">{listing.name}</span>
                <Icon name="external" className="mt-1 size-3.5 shrink-0" title="opens in a new tab" />
              </a>
              {state.match && platform !== 'google_maps' && (
                <p className="mt-1 text-xs text-slate">
                  {state.match.decision === 'user_selected' ? 'Match chosen by you' : state.match.decision === 'google_link' ? 'Matched through Google Maps’ price link' : `Match score ${state.match.score}`}
                  {state.match.distanceKm != null && ` · ${state.match.distanceKm} km from Google pin`}
                </p>
              )}
            </div>
            <Stars rating={listing.rating} />
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Fact label={`Reviews on ${label}`}><span className="num">{formatNumber(listing.reviewCount)}</span></Fact>
            <Fact label="Reviews collected">
              <span className="num">{formatNumber(state.reviewsStored ?? state.reviewsCollected)}</span>{' '}
              <span className="text-xs font-medium text-slate">({state.reviewSort?.replace('_', ' ')})</span>
            </Fact>
            {listing.starClass && <Fact label="Star class">{listing.starClass}★</Fact>}
            {listing.category && <Fact label="Category">{listing.category}</Fact>}
            {listing.priceInr && <Fact label="Price shown"><span className="num">{formatInr(listing.priceInr)}</span></Fact>}
            <Fact label="Collected">{timeAgo(listing.fetchedAt)}</Fact>
            {listing.address && <Fact label="Address" wide>{listing.address}</Fact>}
            {listing.phone && <Fact label="Phone" wide>{listing.phone}</Fact>}
          </dl>
          {listing.priceNote && <p className="text-xs text-slate">{listing.priceNote}</p>}

          {listing.subscores?.length > 0 && (
            <div>
              <H3>Category scores</H3>
              <ul className="space-y-2">
                {listing.subscores.map((s) => (
                  <BarRow key={s.name} label={s.name} pct={(s.score / s.scaleMax) * 100} value={s.score} />
                ))}
              </ul>
            </div>
          )}

          {listing.ratingDistribution?.length > 0 && (
            <div>
              <H3>Rating distribution</H3>
              <ul className="space-y-2">
                {listing.ratingDistribution.map((r) => {
                  const total = listing.ratingDistribution.reduce((a, x) => a + (x.count ?? 0), 0);
                  const pct = r.percent ?? (total ? Math.round((r.count / total) * 100) : 0);
                  return <BarRow key={r.label} label={r.label} pct={pct} value={r.count != null ? formatNumber(r.count) : `${pct}%`} />;
                })}
              </ul>
            </div>
          )}

          {listing.prices?.length > 0 && (
            <div>
              <H3>Prices across sites (via Google)</H3>
              <ul className="divide-y divide-line rounded-2xl ring-1 ring-line">
                {listing.prices.map((p) => (
                  <li key={p.provider} className="flex items-center justify-between gap-3 px-3.5 py-2 text-sm">
                    <span className="min-w-0 truncate">{p.provider}</span>
                    <span className="num font-bold text-pine">{formatInr(p.priceInr)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {listing.reviewSummary?.length > 0 && (
            <div>
              <H3>{label}’s own summary</H3>
              <ul className="space-y-1.5 text-sm text-ink">
                {listing.reviewSummary.map((s) => (
                  <li key={s} className="flex items-start gap-2"><Icon name="quote" className="mt-0.5 size-4 shrink-0 text-geru" />{s}</li>
                ))}
              </ul>
            </div>
          )}

          {listing.amenities?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {listing.amenities.slice(0, 14).map((a) => <Badge key={a} tone="muted">{a}</Badge>)}
            </div>
          )}
        </>
      )}

      {state?.notes?.length > 0 && (
        <ul className="space-y-1 rounded-2xl bg-mist/60 px-4 py-3 text-xs text-slate">
          {state.notes.map((n) => <li key={n} className="flex items-start gap-1.5"><Icon name="info" className="mt-px size-3.5 shrink-0" />{n}</li>)}
        </ul>
      )}

      {state && PROBLEM.includes(status) && !running && (
        <FixMatch bizId={bizId} platform={platform} alternatives={state.alternatives ?? []} />
      )}
    </Card>
  );
}

function FixMatch({ bizId, platform, alternatives }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const select = useMutation({
    mutationFn: (u) => api.selectListing(bizId, platform, u),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business', bizId] }),
  });
  return (
    <div className="space-y-3 rounded-2xl bg-geru-50/60 p-4 ring-1 ring-geru/15">
      {alternatives.length > 0 && (
        <div>
          <H3>Other results we found</H3>
          <ul className="space-y-2">
            {alternatives.map((a) => (
              <li key={a.url} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-line">
                <div className="min-w-0 flex-1 text-sm">
                  <a href={a.url} target="_blank" rel="noreferrer" className="font-bold break-all text-forest hover:underline">{a.name ?? a.url}</a>
                  <span className="text-xs text-slate"> · score {a.score}{a.distanceKm != null ? ` · ${a.distanceKm} km` : ''}</span>
                </div>
                <Button size="sm" variant="ghost" className="min-h-10" disabled={select.isPending} onClick={() => select.mutate(a.url)}>Use this</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); if (url) select.mutate(url); }}>
        <Field label="Correct listing URL" className="min-w-0 flex-1">
          <input className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={`Paste the correct ${PLATFORM_LABELS[platform]} URL`} />
        </Field>
        <Button type="submit" variant="primary" iconLeft="refresh" disabled={!url || select.isPending}>Retry</Button>
      </form>
      {select.isError && <Notice tone="bad">{select.error.message}</Notice>}
    </div>
  );
}
