import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/httpClient.js';
import { DataState } from '../../components/DataState.jsx';
import { TrendChart } from '../../components/charts.jsx';
import { ASPECTS, ASPECT_LABEL, PLATFORM_LABELS, formatDate, monthLabel } from '../../utils/format.js';
import { Badge, Button, Card, CardHeader, Field, Notice } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';

/** Movement over time, its likely cause, emerging issues and seasonal patterns. */
export default function TrendsSection({ bizId, peers }) {
  const qc = useQueryClient();
  const [measure, setMeasure] = useState('rating');
  const trends = useQuery({ queryKey: ['trends', bizId, measure, peers], queryFn: () => api.getTrends(bizId, measure, peers) });
  const [form, setForm] = useState({ date: '', label: '', kind: 'event', aspect: '' });
  const add = useMutation({
    mutationFn: () => api.addEvent(bizId, { ...form, aspect: form.aspect || null }),
    onSuccess: () => {
      setForm({ date: '', label: '', kind: 'event', aspect: '' });
      qc.invalidateQueries({ queryKey: ['trends', bizId] });
    },
  });
  const del = useMutation({ mutationFn: (id) => api.deleteEvent(bizId, id), onSuccess: () => qc.invalidateQueries({ queryKey: ['trends', bizId] }) });

  return (
    <Card>
      <CardHeader
        icon="chart"
        title="Trend and cause"
        desc="How your scores move month by month, what likely caused it, and what is starting to go wrong."
        actions={
          <label className="flex items-center gap-2">
            <span className="label mb-0!">Measure</span>
            <select className="field min-h-10 w-auto rounded-full py-2 pr-9 text-sm font-semibold" value={measure} onChange={(e) => setMeasure(e.target.value)}>
              <option value="rating">Overall rating</option>
              {ASPECTS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </label>
        }
      />
      <DataState query={trends} loadingText="Loading trend…">
        {(t) => (
          <>
            <p className="mb-2 text-sm text-slate">{t.measureLabel}, by month of review.</p>
            <TrendChart you={t.you} market={t.market} events={t.events} changepoint={t.changepoint} yDomain={measure === 'rating' ? [1, 5] : [0, 100]} />
            <div className="mt-5">
              {t.changepoint ? (
                <Notice
                  tone={t.changepoint.direction === 'down' ? 'bad' : 'good'}
                  icon={t.changepoint.direction === 'down' ? 'trendDown' : 'trendUp'}
                  title={`${t.changepoint.direction === 'down' ? '▼ Drop' : '▲ Rise'} from ${monthLabel(t.changepoint.month)}: ${t.changepoint.before} → ${t.changepoint.after}`}
                >
                  ({t.changepoint.reviewsBefore} reviews before, {t.changepoint.reviewsAfter} after).{' '}
                  {t.changepoint.relatedEvents.length > 0
                    ? `Starts around “${t.changepoint.relatedEvents.map((e) => e.label).join('”, “')}”.`
                    : 'No logged event near this date — add one below if you know what changed.'}
                  {t.changepoint.marketAlsoMoved && ' The whole market moved at the same time, so this is likely seasonal or market-wide.'}
                </Notice>
              ) : (
                <p className="flex items-start gap-2 rounded-2xl bg-ivory px-4 py-3 text-sm text-slate ring-1 ring-line">
                  <Icon name="info" className="mt-0.5 size-4 shrink-0" />
                  No significant shift detected in this measure (needs at least ~8 reviews on each side of a change).
                </p>
              )}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Panel icon="alert" title="Emerging issues">
                <p className="text-sm text-slate">Complaints rising in the last 60 days compared with the 6 months before — caught before they move your score.</p>
                {t.emerging.length === 0 ? <p className="mt-3 text-sm font-semibold text-good">Nothing emerging.</p> : (
                  <ul className="mt-3 divide-y divide-line">
                    {t.emerging.map((e) => (
                      <li key={e.issue} className="py-3 text-sm first:pt-0 last:pb-0">
                        <p className="text-ink">
                          <strong>{e.label}</strong> <span className="text-slate">({e.aspectLabel})</span> — {e.recent} complaints recently vs {e.before} before
                        </p>
                        {e.alsoInMarket && <Badge tone="warn" icon="users" className="mt-1.5">Also rising at competitors</Badge>}
                        <p className="mt-1 text-xs text-slate">First complaint {formatDate(e.firstEvidenceAt)} · flagged {formatDate(e.detectedAt)} ({e.daysToDetect} days later)</p>
                        {e.evidence[0] && (
                          <p className="mt-2 border-l-2 border-geru/70 pl-3">
                            <span className="font-serif text-ink italic">“{e.evidence[0].quote}”</span> <span className="text-xs text-slate">— {PLATFORM_LABELS[e.evidence[0].platform]}</span>
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel icon="calendar" title="Seasonal patterns (whole market)">
                {t.seasonal.length === 0 ? <p className="text-sm text-slate">No complaint clusters in a particular month yet.</p> : (
                  <ul className="space-y-2 text-sm">
                    {t.seasonal.map((s) => <li key={s.issue} className="text-ink"><strong>{s.label}</strong>: {s.share}% of {s.complaints} complaints fall in {s.month}</li>)}
                  </ul>
                )}
                {t.interventions.length > 0 && (
                  <>
                    <h3 className="mt-5 mb-2 flex items-center gap-2 font-serif text-lg text-pine"><Icon name="trendUp" className="size-4.5 text-forest" />Effect of your changes</h3>
                    <ul className="space-y-2 text-sm">
                      {t.interventions.map((i) => (
                        <li key={i.id} className="text-ink">
                          <strong>{i.label}</strong> ({i.date}): rating {i.rating.before ?? '–'} → {i.rating.after ?? '–'}
                          {i.aspectScore && `; ${ASPECT_LABEL[i.aspect]} ${i.aspectScore.before ?? '–'} → ${i.aspectScore.after ?? '–'}`}
                          {!i.enoughData && <span className="text-xs text-slate"> (too few reviews yet to judge)</span>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Panel>
            </div>

            <div className="mt-6 border-t border-line pt-5">
              <h3 className="flex items-center gap-2 font-serif text-lg text-pine"><Icon name="flag" className="size-4.5 text-geru" />Events at your hotel</h3>
              <p className="mt-1 text-sm text-slate">Log what changed (a chef left, a new geyser) — it is drawn on the chart and matched to shifts. “Intervention” also measures 90 days before vs after.</p>
              {t.events.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {t.events.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-ivory py-1.5 pr-1.5 pl-4 text-sm ring-1 ring-line">
                      <span className="min-w-0">
                        <span className="num text-slate">{e.date}</span> · <strong className="text-ink">{e.label}</strong>{' '}
                        <Badge tone={e.kind === 'intervention' ? 'good' : 'geru'}>{e.kind}{e.aspect ? ` · ${ASPECT_LABEL[e.aspect]}` : ''}</Badge>
                      </span>
                      <Button size="sm" variant="ghost" className="min-h-10" aria-label={`Remove event: ${e.label}`} onClick={() => del.mutate(e.id)}>Remove</Button>
                    </li>
                  ))}
                </ul>
              )}
              <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[10rem_minmax(0,1fr)_12rem_10rem_auto] lg:items-end" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
                <Field label="Date">
                  <input type="date" className="field min-h-11 py-2" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                </Field>
                <Field label="What happened">
                  <input className="field min-h-11 py-2" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Head chef left" required minLength={2} maxLength={120} />
                </Field>
                <Field label="Type">
                  <select className="field min-h-11 py-2" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                    <option value="event">Event</option>
                    <option value="intervention">Intervention (a fix)</option>
                  </select>
                </Field>
                <Field label="Aspect">
                  <select className="field min-h-11 py-2" value={form.aspect} onChange={(e) => setForm({ ...form, aspect: e.target.value })}>
                    <option value="">Any aspect</option>
                    {ASPECTS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                  </select>
                </Field>
                <Button type="submit" iconLeft="calendar" className="min-h-11" disabled={add.isPending}>Add</Button>
              </form>
              {add.isError && <Notice tone="bad" className="mt-3">{add.error.message}</Notice>}
            </div>
          </>
        )}
      </DataState>
    </Card>
  );
}

function Panel({ icon, title, children }) {
  return (
    <div className="rounded-2xl bg-ivory/70 p-4 ring-1 ring-line sm:p-5">
      <h3 className="mb-2 flex items-center gap-2 font-serif text-lg text-pine"><Icon name={icon} className="size-4.5 text-forest" />{title}</h3>
      {children}
    </div>
  );
}
