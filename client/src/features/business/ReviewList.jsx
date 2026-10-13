import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../services/httpClient.js';
import { DataState, Stars } from '../../components/DataState.jsx';
import { ASPECTS, ASPECT_LABEL, PLATFORM_LABELS, PLATFORM_ORDER, formatDate } from '../../utils/format.js';
import { Badge, Button, Card, CardHeader, Field, Segmented } from '../../ui/kit.jsx';
import { AspectIcon, Icon } from '../../ui/icons.jsx';
import { AipanRule } from '../../ui/aipan.jsx';

const PAGE = 20;

/** Aspect chip: topic icon + label + sentiment word/sign (never colour alone). */
function AspectChip({ aspect, sentiment }) {
  const tone = sentiment > 0 ? 'bg-good-bg text-good' : sentiment < 0 ? 'bg-bad-bg text-bad' : 'bg-parchment text-slate';
  const sign = sentiment > 0 ? '+' : sentiment < 0 ? '−' : '·';
  const word = sentiment > 0 ? 'praise' : sentiment < 0 ? 'complaint' : 'mentioned';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${tone}`} title={`${ASPECT_LABEL[aspect]}: ${word}`}>
      <AspectIcon aspect={aspect} className="size-3.5" />
      <span aria-hidden="true">{sign}</span>
      {ASPECT_LABEL[aspect]}
      <span className="sr-only">({word})</span>
    </span>
  );
}

export default function ReviewList({ bizId, refreshKey, platforms = PLATFORM_ORDER, withAspects = true }) {
  const [aspect, setAspect] = useState('');
  const [platform, setPlatform] = useState('all');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [band, setBand] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(0), [platform, debouncedQ, band, aspect]);

  const [minRating, maxRating] = band === 'low' ? [0, 2.5] : band === 'mid' ? [2.5, 3.99] : band === 'high' ? [4, 5] : [];
  const query = useQuery({
    queryKey: ['reviews', bizId, platform, debouncedQ, band, aspect, page, refreshKey],
    queryFn: () => {
      const [a, s] = aspect.split(':');
      return api.getReviews(bizId, { platform, q: debouncedQ, minRating, maxRating, aspect: a || undefined, sentiment: s, limit: PAGE, offset: page * PAGE });
    },
    placeholderData: keepPreviousData,
  });

  const tabOptions = ['all', ...platforms].map((p) => ({
    value: p,
    label: p === 'all' ? 'All' : PLATFORM_LABELS[p],
    count: query.data?.countsByPlatform && p !== 'all' && platform === 'all' && query.data.countsByPlatform[p] ? query.data.countsByPlatform[p] : undefined,
  }));

  return (
    <Card ornament>
      <CardHeader
        icon="quote"
        title={<>Guest book <span className="font-deva text-base text-geru" lang="hi">अतिथि पुस्तिका</span></>}
        desc="Every review your guests left, across the platforms. Search, filter by topic or rating."
      />

      <div className={`grid gap-3 ${withAspects ? 'sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]' : 'sm:grid-cols-2'}`}>
        <Field label="Search reviews" className="sm:col-span-2 lg:col-span-1">
          <span className="relative block">
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-slate" />
            <input className="field pl-10!" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search text…" />
          </span>
        </Field>
        {withAspects && (
          <Field label="Topic">
            <select className="field" value={aspect} onChange={(e) => setAspect(e.target.value)}>
              <option value="">All aspects</option>
              {ASPECTS.map((a) => (
                <optgroup key={a.key} label={a.label}>
                  <option value={a.key}>{a.label}: any</option>
                  <option value={`${a.key}:-1`}>{a.label}: complaints</option>
                  <option value={`${a.key}:1`}>{a.label}: praise</option>
                </optgroup>
              ))}
            </select>
          </Field>
        )}
        <Field label="Rating">
          <select className="field" value={band} onChange={(e) => setBand(e.target.value)}>
            <option value="">All ratings</option>
            <option value="high">Positive (≥ 4 of 5)</option>
            <option value="mid">Mixed</option>
            <option value="low">Negative (≤ 2.5 of 5)</option>
          </select>
        </Field>
      </div>

      <div className="scrollbar-thin -mx-5 mt-4 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6">
        <Segmented id={`reviews-${bizId}`} ariaLabel="Platform" className="flex-nowrap! [&_button]:whitespace-nowrap" options={tabOptions} value={platform} onChange={setPlatform} />
      </div>

      <div className="mt-5">
        <DataState
          query={query}
          isEmpty={(d) => d.total === 0}
          emptyTitle={debouncedQ || band || aspect ? 'No reviews match these filters' : 'No reviews collected yet'}
          emptyHint={debouncedQ || band ? 'Clear the search or rating filter.' : 'They appear here as each platform finishes.'}
          loadingText="Loading reviews…"
        >
          {(d) => (
            <>
              <ol className="divide-y divide-dashed divide-pine/15 rounded-3xl bg-rice px-4 ring-1 ring-line sm:px-6">
                {d.items.map((r) => (
                  <li key={`${r.platform}-${r.reviewId}`} className="relative py-5 sm:pl-14">
                    <span aria-hidden="true" className="absolute top-5 left-0 hidden size-10 place-items-center rounded-full bg-parchment font-serif text-lg text-geru sm:grid">
                      <Icon name="staff" className="size-5" />
                    </span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="font-serif text-base font-semibold text-pine">
                        {r.reviewerCountry ? `Guest from ${r.reviewerCountry}` : 'A guest'}
                      </span>
                      <Badge tone="muted">{PLATFORM_LABELS[r.platform]}{r.via ? ' · via Agoda' : ''}</Badge>
                      <span className="ml-auto"><Stars rating={r.rating} /></span>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-slate">
                      <Icon name="calendar" className="size-3.5" />
                      {formatDate(r.publishedAt, r.publishedPrecision) ?? r.publishedRaw ?? 'Date not shown'}
                      {r.travellerType && ` · ${r.travellerType}`}
                      {r.reviewerCountry && ` · ${r.reviewerCountry}`}
                      {r.language && r.language !== 'en' && ` · ${r.language}`}
                      {r.syndicatedFrom && ` · originally on ${r.syndicatedFrom}`}
                    </p>

                    {r.title && <h3 className="mt-3 font-serif text-lg leading-snug font-medium text-pine">{r.title}</h3>}
                    {r.text && <p className="mt-2 text-[0.95rem] leading-relaxed whitespace-pre-line text-ink">{r.text}</p>}
                    {r.liked && (
                      <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">
                        <Badge tone="good" icon="check" className="mr-1.5">Liked</Badge>{r.liked}
                      </p>
                    )}
                    {r.disliked && (
                      <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">
                        <Badge tone="bad" icon="alert" className="mr-1.5">Disliked</Badge>{r.disliked}
                      </p>
                    )}
                    {!r.text && !r.title && !r.liked && !r.disliked && <p className="mt-2 text-sm text-slate italic">Rating only, no written review.</p>}

                    {withAspects && r.aspects?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {r.aspects.map((a) => <AspectChip key={a.aspect} aspect={a.aspect} sentiment={a.sentiment} />)}
                      </div>
                    )}
                    {r.roomType && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate">
                        <Icon name="bed" className="size-3.5" />Room: {r.roomType}{r.stayMonth ? ` · stayed ${r.stayMonth}` : ''}
                      </p>
                    )}
                    {r.ownerReply && (
                      <blockquote className="mt-3 ml-3 border-l-2 border-geru/40 bg-parchment/50 py-2.5 pr-3 pl-4 text-sm text-ink sm:ml-6 rounded-r-2xl">
                        <p className="eyebrow mb-1 flex items-center gap-1.5 text-geru"><Icon name="key" className="size-3.5" />Owner reply</p>
                        {r.ownerReply}
                      </blockquote>
                    )}
                  </li>
                ))}
              </ol>
              <AipanRule className="mx-auto my-4 h-2.5 w-20" />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="num text-sm text-slate">
                  Showing {d.offset + 1}–{d.offset + d.items.length} of {d.total}
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" iconLeft="arrowLeft" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button variant="ghost" icon="arrowRight" disabled={d.offset + d.items.length >= d.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </DataState>
      </div>
    </Card>
  );
}
