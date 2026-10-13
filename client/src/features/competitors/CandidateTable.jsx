import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../services/httpClient.js';
import { formatInr, formatNumber, timeAgo } from '../../utils/format.js';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Notice, Table } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';

const TIER = {
  much_cheaper: { label: 'Much cheaper', tone: 'warn' },
  cheaper: { label: 'Cheaper', tone: 'muted' },
  similar: { label: 'Similar price', tone: 'good' },
  pricier: { label: 'Pricier', tone: 'muted' },
  much_pricier: { label: 'Much pricier', tone: 'warn' },
  unknown: { label: 'No price', tone: 'muted' },
};

/**
 * Candidate list with client-side filters. The server's default selection (radius, price 0.5–2×,
 * min reviews) is pre-ticked; the user can change it and then collect.
 */
export default function CandidateTable({ compset, bizId, onSaved }) {
  const { candidates, rules, target } = compset;
  const [selected, setSelected] = useState(() => new Set(compset.selectedPlaceIds));
  const [dirty, setDirty] = useState(false);
  const [maxKm, setMaxKm] = useState(8);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minReviews, setMinReviews] = useState(0);
  const [show, setShow] = useState('all');
  const [hideSponsored, setHideSponsored] = useState(false);
  const [maxReviews, setMaxReviews] = useState(30);
  const [force, setForce] = useState(false);

  // Reset local selection when the server's selection changes (e.g. after a new search).
  const serverKey = compset.selectedPlaceIds.join('|') + compset.discovery?.finishedAt;
  useEffect(() => {
    setSelected(new Set(compset.selectedPlaceIds));
    setDirty(false);
  }, [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(
    () =>
      candidates.filter((c) => {
        if (c.distanceKm != null && c.distanceKm > maxKm) return false;
        if (minPrice && (c.priceInr == null || c.priceInr < Number(minPrice))) return false;
        if (maxPrice && (c.priceInr == null || c.priceInr > Number(maxPrice))) return false;
        if ((c.reviewCount ?? 0) < minReviews) return false;
        if (hideSponsored && c.sponsored) return false;
        if (show === 'selected' && !selected.has(c.placeId)) return false;
        if (show === 'eligible' && !c.eligible) return false;
        return true;
      }),
    [candidates, maxKm, minPrice, maxPrice, minReviews, hideSponsored, show, selected],
  );

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDirty(true);
  };
  const setMany = (ids) => {
    setSelected(new Set(ids));
    setDirty(true);
  };

  const save = useMutation({ mutationFn: () => api.saveCompetitorSelection(bizId, [...selected]), onSuccess: () => { setDirty(false); onSaved(); } });
  const collect = useMutation({
    mutationFn: async () => {
      if (dirty) await api.saveCompetitorSelection(bizId, [...selected]);
      return api.collectCompetitors(bizId, { maxReviews: Number(maxReviews), force });
    },
    onSuccess: () => { setDirty(false); onSaved(); },
  });
  const tooMany = selected.size > 30;


  return (
    <Card>
      <CardHeader
        icon="users"
        title={<><StepNo n={2} />Choose competitors</>}
        desc={`Pre-selected: within ${rules.radiusKm} km, price ${rules.minPriceRatio}–${rules.maxPriceRatio}× yours (or unknown), at least ${rules.minReviews} Google reviews, nearest ${rules.maxCompetitors}. Prices are Google’s snapshot for ${target?.priceSource ? 'the same dates' : 'its default dates'}, not your rack rate.`}
        actions={
          <>
            <Badge tone="muted" icon="hotel"><span className="tabular-nums">{candidates.length}</span> found</Badge>
            <Badge tone={tooMany ? 'bad' : selected.size ? 'good' : 'muted'} icon="check"><span className="tabular-nums">{selected.size}</span> selected</Badge>
          </>
        }
      />

      <fieldset className="rounded-2xl bg-ivory/70 p-4 ring-1 ring-line">
        <legend className="sr-only">Filter the list</legend>
        <p className="eyebrow mb-3 flex items-center gap-2 text-slate"><Icon name="search" className="size-4" />Filter the list</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Field label="Max distance">
            <select className="field" value={maxKm} onChange={(e) => setMaxKm(Number(e.target.value))}>
              {[0.5, 1, 2, 3, 5, 8].map((k) => <option key={k} value={k}>{k} km</option>)}
            </select>
          </Field>
          <Field label="Price from ₹"><input className="field" type="number" min={0} value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="any" /></Field>
          <Field label="Price to ₹"><input className="field" type="number" min={0} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="any" /></Field>
          <Field label="Min Google reviews"><input className="field" type="number" min={0} value={minReviews} onChange={(e) => setMinReviews(Number(e.target.value) || 0)} /></Field>
          <Field label="Show">
            <select className="field" value={show} onChange={(e) => setShow(e.target.value)}>
              <option value="all">All</option>
              <option value="eligible">Match default rules</option>
              <option value="selected">Selected only</option>
            </select>
          </Field>
          <label className="col-span-2 flex min-h-12 cursor-pointer items-center gap-3 self-end rounded-2xl bg-white px-4 text-sm font-semibold text-ink ring-1 ring-line md:col-span-1">
            <input type="checkbox" className="size-5 shrink-0 accent-forest" checked={hideSponsored} onChange={(e) => setHideSponsored(e.target.checked)} /> Hide sponsored
          </label>
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Selection">
        <span className="eyebrow mr-1 text-slate">Selection</span>
        <Button size="sm" variant="ghost" iconLeft="sparkle" className="min-h-10" onClick={() => setMany(compset.candidates.filter((c) => c.eligible).slice(0, rules.maxCompetitors).map((c) => c.placeId))}>Use default selection</Button>
        <Button size="sm" variant="ghost" iconLeft="check" className="min-h-10" onClick={() => setMany([...new Set([...selected, ...visible.map((c) => c.placeId)])])}>Select all shown ({visible.length})</Button>
        <Button size="sm" variant="subtle" iconLeft="close" className="min-h-10" onClick={() => setMany([])}>Clear</Button>
      </div>

      <div className="mt-4">
        {visible.length === 0 ? (
          <EmptyState icon="search" title="No properties match these filters." hint="Widen the distance or price range." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th className="relative w-12"><span className="sr-only">Selected</span></th>
                <th>Property</th>
                <th className="text-right!">Distance</th>
                <th>Type</th>
                <th>Google rating</th>
                <th className="text-right!">Price / night</th>
                <th>vs you</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {target && (
                <tr className="bg-geru-50/50">
                  <td><span className="grid size-10 place-items-center text-geru"><Icon name="key" className="size-5" title="Your property" /></span></td>
                  <td>
                    <span className="font-bold text-pine">{target.name}</span> <Badge tone="geru" className="ml-1">You</Badge>
                  </td>
                  <td className="tabular-nums text-right text-slate">–</td>
                  <td>{target.starClass ? `${target.starClass}★ hotel` : ''}</td>
                  <td className="tabular-nums whitespace-nowrap">{target.rating?.value ?? '–'} <span className="text-xs text-slate">({formatNumber(target.reviewCount)})</span></td>
                  <td className="tabular-nums text-right whitespace-nowrap font-semibold">{formatInr(target.priceInr)}</td>
                  <td />
                  <td />
                </tr>
              )}
              {visible.map((c) => {
                const tier = TIER[c.priceTier] ?? TIER.unknown;
                const on = selected.has(c.placeId);
                return (
                  <tr key={c.placeId} className={on ? 'bg-mist/60' : ''}>
                    <td>
                      <label className="grid size-10 cursor-pointer place-items-center rounded-xl hover:bg-mist">
                        <input type="checkbox" className="size-5 accent-forest" aria-label={`Select ${c.name}`} checked={on} onChange={() => toggle(c.placeId)} />
                      </label>
                    </td>
                    <td className="min-w-52">
                      <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-pine hover:text-forest hover:underline">
                        {c.name}<Icon name="external" className="size-3.5 text-slate" title="opens Google Maps" />
                      </a>
                      {c.sponsored && <Badge tone="muted" className="ml-2">Sponsored</Badge>}
                      {!c.eligible && <div className="mt-0.5 text-xs text-slate">{c.exclusions.join(' · ')}</div>}
                    </td>
                    <td className="tabular-nums text-right whitespace-nowrap">{c.distanceKm != null ? `${c.distanceKm} km` : '–'}</td>
                    <td className="whitespace-nowrap">{c.starClass ? `${c.starClass}★ hotel` : c.lodgingType ?? '–'}</td>
                    <td className="tabular-nums whitespace-nowrap">{c.rating ?? '–'} <span className="text-xs text-slate">({formatNumber(c.reviewCount)})</span></td>
                    <td className="tabular-nums text-right whitespace-nowrap font-semibold">{formatInr(c.priceInr)}</td>
                    <td><Badge tone={tier.tone}>{tier.label}{c.priceRatio ? ` · ${c.priceRatio}×` : ''}</Badge></td>
                    <td className="text-xs whitespace-nowrap">
                      {c.fresh ? <Badge tone="good" icon="check">Ready</Badge> : c.lastProfiledAt ? <span className="text-slate">{timeAgo(c.lastProfiledAt)} (due)</span> : <span className="text-slate">Not yet</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>

      <div className="z-20 mt-6 lg:sticky lg:bottom-3 overflow-hidden rounded-3xl bg-pine p-4 text-mist shadow-lift sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex items-center gap-3 lg:mr-auto">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-amber"><Icon name="bell" className="size-5" /></span>
            <div>
              <p className="eyebrow text-glacier">Ready to collect</p>
              <p className="font-serif text-lg text-white"><span className="tabular-nums">{selected.size}</span> competitor{selected.size === 1 ? '' : 's'} selected{dirty ? ' · unsaved' : ''}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr] sm:items-end lg:flex lg:items-end">
            <label className="block lg:w-40">
              <span className="label text-glacier!">Reviews per platform</span>
              <input className="field" type="number" min={5} max={200} value={maxReviews} onChange={(e) => setMaxReviews(e.target.value)} />
            </label>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl bg-white/8 px-4 text-sm font-semibold ring-1 ring-white/15 lg:max-w-64">
              <input type="checkbox" className="size-5 shrink-0 accent-amber" checked={force} onChange={(e) => setForce(e.target.checked)} /> Re-collect all (even hotels with fresh data)
            </label>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="glass" iconLeft="check" className="min-h-12" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>Save selection</Button>
            <Button variant="geru" icon="arrowRight" className="min-h-12" disabled={!selected.size || tooMany || collect.isPending} onClick={() => collect.mutate()}>
              {collect.isPending ? 'Starting…' : `Collect data for ${selected.size} competitor${selected.size === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate">
        Competitors marked “Ready” already have fresh data in the database and are used as they are; the rest are collected in
        the background (about a minute each). Every hotel is refreshed automatically about every 15 days.
        {tooMany && <strong className="text-bad"> Select at most 30.</strong>}
      </p>
      <div className="mt-3 space-y-3 empty:hidden">
        {(save.isError || collect.isError) && <Notice tone="bad">{(save.error ?? collect.error).message}</Notice>}
        {collect.isSuccess && (
          <Notice tone="warn" icon="clock">Queued {collect.data.queued} competitor{collect.data.queued === 1 ? '' : 's'}{collect.data.reused ? `, ${collect.data.reused} already up to date` : ''}. Progress appears below.</Notice>
        )}
      </div>
    </Card>
  );
}

/** Small numbered step marker used in card titles. */
function StepNo({ n }) {
  return <span className="mr-2 inline-grid size-7 translate-y-[-2px] place-items-center rounded-full bg-geru-50 align-middle font-sans text-sm font-extrabold text-geru">{n}</span>;
}
