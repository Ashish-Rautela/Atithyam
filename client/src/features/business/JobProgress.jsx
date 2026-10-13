import { StatusBadge } from '../../components/DataState.jsx';
import { PLATFORM_LABELS, STATUS_INFO } from '../../utils/format.js';
import { Card, CardHeader, Progress, Spinner } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';

export default function JobProgress({ job }) {
  const entries = Object.entries(job.platforms ?? {});
  const done = entries.filter(([, p]) => !['PENDING', 'RUNNING'].includes(p.status)).length;
  return (
    <Card aria-live="polite">
      <CardHeader
        icon="bell"
        title="Collecting data"
        actions={<span className="num rounded-full bg-mist px-3 py-1 text-sm font-bold text-forest">{done} of {entries.length} platforms done</span>}
      />
      <Progress value={(done / Math.max(entries.length, 1)) * 100} />
      <ul className="mt-4 divide-y divide-line">
        {entries.map(([platform, p]) => (
          <li key={platform} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3 sm:grid-cols-[10rem_auto_minmax(0,1fr)]">
            <span className="font-bold text-ink">{PLATFORM_LABELS[platform]}</span>
            <span className="justify-self-end sm:justify-self-start"><StatusBadge status={p.status} info={STATUS_INFO} /></span>
            <span className="col-span-2 flex items-center gap-2 text-sm text-slate sm:col-span-1">
              {p.status === 'RUNNING' && <Spinner className="size-5 shrink-0" />} {p.message}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-start gap-2 text-sm text-slate">
        <Icon name="clock" className="mt-0.5 size-4 shrink-0" />
        Platforms are visited one after another with pauses, so a full run takes a few minutes.
      </p>
    </Card>
  );
}
