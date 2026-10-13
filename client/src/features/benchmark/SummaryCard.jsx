import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/httpClient.js';
import { DataState } from '../../components/DataState.jsx';
import { timeAgo } from '../../utils/format.js';
import { Badge, Button, Card } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';
import { AipanRule } from '../../ui/aipan.jsx';

/** "What this means for you": the benchmark condensed into a headline and up to 3 actions. */
export default function SummaryCard({ bizId, peers, fingerprint, cityId, clusterId, title = 'What this means' }) {
  const qc = useQueryClient();
  const key = cityId ? ['dest-summary', cityId, clusterId, fingerprint] : ['summary', bizId, peers, fingerprint];
  const summary = useQuery({
    queryKey: key,
    queryFn: () => (cityId ? api.getDestinationSummary(cityId, clusterId) : api.getSummary(bizId, peers)),
  });
  const regen = useMutation({
    mutationFn: () => (cityId ? api.getDestinationSummary(cityId, clusterId, true) : api.getSummary(bizId, peers, true)),
    onSuccess: (data) => qc.setQueryData(key, data),
  });
  return (
    <Card tone="pine" ornament className="overflow-hidden sm:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-forest/50 blur-3xl" />
      <div className="relative mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/10 text-amber ring-1 ring-white/20">
            <Icon name="sparkle" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-2 text-glacier"><AipanRule className="h-2 w-10" color="#e8a15a" />Front-desk briefing</p>
            <h2 className="mt-1 font-serif text-xl leading-tight font-medium text-white sm:text-[1.4rem]">{title}</h2>
          </div>
        </div>
        {summary.data && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-mist/75">
            <span>
              {summary.data.method?.startsWith('gemini') ? `Written by AI (${summary.data.method.split(':')[1]})` : 'Generated from the numbers (no AI key)'} · {timeAgo(summary.data.createdAt)}
            </span>
            <Button size="sm" variant="glass" iconLeft="refresh" className="min-h-10" disabled={regen.isPending} onClick={() => regen.mutate()}>
              {regen.isPending ? 'Writing…' : 'Regenerate'}
            </Button>
          </div>
        )}
      </div>
      <div className="relative">
        <DataState query={summary} loadingText="Writing summary…">
          {(s) => (
            <>
              <p className="max-w-4xl font-serif text-[1.45rem] leading-snug font-medium text-white sm:text-[1.8rem]">{s.headline}</p>
              <p className="mt-3 max-w-4xl text-[0.98rem] leading-relaxed text-mist/85">{s.situation}</p>
              {s.actions?.length > 0 && (
                <ol className="mt-6 grid gap-3 md:grid-cols-3">
                  {s.actions.map((a, i) => (
                    <li key={i} className="flex gap-3 rounded-2xl bg-white/6 p-4 ring-1 ring-white/12">
                      <span aria-hidden="true" className="num grid size-9 shrink-0 place-items-center rounded-full bg-amber font-serif text-lg font-semibold text-pine">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="font-bold text-white">
                          <span className="sr-only">Action {i + 1}: </span>
                          {a.title}
                        </p>
                        {a.aspect && <Badge tone="dark" className="mt-1.5">{a.aspect}</Badge>}
                        <p className="mt-1.5 text-sm text-mist/75">{a.why}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {s.watch?.length > 0 && (
                <p className="mt-5 flex flex-wrap items-center gap-2 text-sm text-mist/80">
                  <span className="eyebrow inline-flex items-center gap-1.5 text-amber"><Icon name="clock" className="size-4" />Watch:</span>
                  {s.watch.join(' · ')}
                </p>
              )}
            </>
          )}
        </DataState>
      </div>
    </Card>
  );
}
