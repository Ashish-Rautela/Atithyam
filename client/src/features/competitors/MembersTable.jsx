import { Link } from 'react-router-dom';
import { StatusBadge } from '../../components/DataState.jsx';
import { PLATFORM_LABELS, PLATFORM_ORDER, STATUS_INFO, formatNumber } from '../../utils/format.js';
import { Badge, Card, CardHeader, Progress, Table } from '../../ui/kit.jsx';

/** Collection progress and per-platform results for every chosen competitor. No scoring yet. */
export default function MembersTable({ members, platforms = PLATFORM_ORDER }) {
  const done = members.filter((m) => !['queued', 'running'].includes(m.job?.status)).length;
  const pctDone = (done / Math.max(members.length, 1)) * 100;
  return (
    <Card>
      <CardHeader
        icon="layers"
        title={<><span className="mr-2 inline-grid size-7 translate-y-[-2px] place-items-center rounded-full bg-geru-50 align-middle font-sans text-sm font-extrabold text-geru">3</span>Competitor data</>}
        desc="Collection progress and what each platform returned for every chosen competitor."
        actions={<Badge tone={done === members.length ? 'good' : 'info'} icon={done === members.length ? 'check' : 'clock'}><span className="tabular-nums">{done}</span>&nbsp;of&nbsp;<span className="tabular-nums">{members.length}</span>&nbsp;finished</Badge>}
      />
      <Progress value={pctDone} className="mb-4" />
      <Table>
        <thead>
          <tr>
            <th>Competitor</th>
            <th>Run</th>
            {platforms.map((p) => <th key={p}>{PLATFORM_LABELS[p]}</th>)}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.placeId}>
              <td className="min-w-44">
                <Link to={`/business/${m.bizId}`} className="font-bold text-pine hover:text-forest hover:underline">{m.name}</Link>
                {m.reused && <div className="mt-0.5 text-xs text-slate">data up to date</div>}
              </td>
              <td>{m.job ? <Badge tone={jobTone(m.job.status)} className="capitalize">{m.job.status}</Badge> : <span className="text-slate">–</span>}</td>
              {platforms.map((p) => {
                const live = m.job?.platforms?.[p];
                const s = m.platforms?.[p];
                const status = live?.status === 'RUNNING' || live?.status === 'PENDING' ? live.status : s?.status ?? live?.status;
                return (
                  <td key={p} className="align-top! whitespace-nowrap">
                    {status ? <StatusBadge status={status} info={STATUS_INFO} /> : <span className="text-slate">–</span>}
                    {s?.rating && (
                      <div className="tabular-nums mt-1 text-xs">
                        <strong className="text-pine">{s.rating.value}</strong><span className="text-slate">/{s.rating.scaleMax}</span>
                        <span className="text-slate"> · {formatNumber(s.reviewCount)}</span>
                      </div>
                    )}
                    {s?.reviewsStored ? <div className="text-xs text-slate">{s.reviewsStored} reviews read</div> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="mt-4 text-xs text-slate">Open a competitor to see its full profile, category scores and reviews. Comparison and scoring come in the next step.</p>
    </Card>
  );
}

function jobTone(status) {
  return status === 'completed' ? 'good' : status === 'failed' || status === 'interrupted' ? 'bad' : 'info';
}
