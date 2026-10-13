import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/httpClient.js';
import { formatNumber } from '../../utils/format.js';
import { Card, CardHeader } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';

const ROW_ICON = ['layers', 'clock', 'chart', 'trendUp', 'hotel', 'quote'];

/** The problem statement's "metrics of improvement", computed for this hotel. */
export default function MetricsCard({ b, bizId, peers }) {
  const trends = useQuery({ queryKey: ['trends', bizId, 'rating', peers], queryFn: () => api.getTrends(bizId, 'rating', peers) });
  const detect = trends.data?.emerging?.map((e) => e.daysToDetect).filter(Number.isFinite) ?? [];
  const avgDetect = detect.length ? Math.round(detect.reduce((s, d) => s + d, 0) / detect.length) : null;
  const ranked = b.aspects.filter((a) => a.rank !== null && a.status !== 'insufficient');
  const intervention = trends.data?.interventions?.find((i) => i.enoughData);
  const flagged = b.issues.filter((i) => i.kind !== 'normal').length;
  const rows = [
    ['Reviews analysed vs read', `${formatNumber(b.coverage.analysed)} analysed automatically`, `≈ ${b.coverage.readingHoursSaved} hours of reading by hand`],
    ['Time from an issue emerging to its identification', avgDetect !== null ? `${avgDetect} days on average` : '—', detect.length ? `${detect.length} emerging issue(s) flagged` : 'No emerging issue right now'],
    ['Aspect-level competitive position', ranked.map((a) => `${a.label} #${a.rank}/${a.rankOf}`).join(' · ') || '—', 'Rank among hotels with enough mentions'],
    ['Rating movement after intervention', intervention ? `${intervention.rating.before} → ${intervention.rating.after}` : '—', intervention ? intervention.label : 'Log an “Intervention” under Trend and cause'],
    ['Properties benchmarked', `${b.peerSet.withData + 1}`, b.peerSet.label],
    ['Issues surfaced with evidence', `${flagged}`, 'Your problems, market-wide issues and strengths, each with quotes'],
  ];
  return (
    <Card>
      <CardHeader icon="check" title="Metrics of improvement" desc="What the benchmark does for you, measured on this hotel." />
      <dl className="divide-y divide-line border-t border-line">
        {rows.map(([k, v, note], idx) => (
          <div key={k} className="grid gap-x-6 gap-y-1 py-3.5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1fr)] md:items-center">
            <dt className="flex items-center gap-2.5 text-sm font-semibold text-slate">
              <Icon name={ROW_ICON[idx]} className="size-4 shrink-0 text-forest" />
              {k}
            </dt>
            <dd className="num pl-6.5 font-bold text-pine md:pl-0">{v}</dd>
            <dd className="pl-6.5 text-sm text-slate md:pl-0">{note}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
