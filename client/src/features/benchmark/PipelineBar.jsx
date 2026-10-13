import { Badge, Button, Card, Spinner, cx } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';

const STEP_ICON = { you: 'hotel', find: 'search', collect: 'download', analyse: 'sparkle' };

/** Progress of the owner's pipeline: own data → competitors → collected → analysed. */
export default function PipelineBar({ pipeline, onUpgrade }) {
  const last = pipeline.stages.length - 1;
  return (
    <Card aria-label="Data collection progress">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow flex items-center gap-2 text-geru">
          <Icon name="key" className="size-4" /> Check-in journey
        </p>
        {pipeline.complete ? (
          <Badge tone="good" icon="check">All checked in</Badge>
        ) : pipeline.ready ? (
          <Badge tone="info" icon="clock">First benchmark ready · filling in</Badge>
        ) : (
          <Badge tone="warn" icon="clock">Collecting data</Badge>
        )}
      </div>

      <ol className="grid gap-0 md:grid-cols-4 md:gap-4">
        {pipeline.stages.map((s, i) => {
          const state = s.done ? 'done' : s.active ? 'active' : 'waiting';
          return (
            <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0 md:flex-col md:gap-3 md:pb-0">
              {i < last && (
                <span
                  aria-hidden="true"
                  className={cx(
                    'absolute top-12 bottom-1 left-[1.2rem] w-0.5 rounded-full md:top-[1.2rem] md:right-0 md:bottom-auto md:left-14 md:h-0.5 md:w-auto',
                    s.done ? 'bg-forest' : 'bg-line',
                  )}
                />
              )}
              <span
                aria-hidden="true"
                className={cx(
                  'relative z-10 grid size-10 shrink-0 place-items-center rounded-full',
                  state === 'done' && 'bg-forest text-white shadow-[0_8px_16px_-10px_rgb(16_47_41/0.9)]',
                  state === 'active' && 'bg-white ring-2 ring-amber',
                  state === 'waiting' && 'bg-ivory text-slate ring-1 ring-line',
                )}
              >
                {state === 'done' ? <Icon name="check" className="size-5" strokeWidth={2.4} /> : state === 'active' ? <Spinner className="size-6" /> : <Icon name={STEP_ICON[s.key] ?? 'clock'} className="size-4.5" />}
              </span>
              <span className="min-w-0 pt-0.5 md:pt-0">
                <span className={cx('eyebrow block text-[0.66rem]', state === 'done' ? 'text-forest' : state === 'active' ? 'text-amber-ink' : 'text-slate')}>
                  Step {i + 1} · {state === 'done' ? 'Done' : state === 'active' ? 'In progress' : 'Waiting'}
                </span>
                <span className="mt-0.5 block font-bold text-ink">{s.label}</span>
                {s.detail && <span className="block text-sm text-slate">{s.detail}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-ivory px-4 py-3 text-sm text-slate ring-1 ring-line">
        <Icon name="info" className="size-4.5 shrink-0 text-forest" />
        <p className="min-w-0 flex-1 basis-64">
          {pipeline.complete
            ? 'Everything is collected and analysed. Data refreshes automatically about every 15 days.'
            : pipeline.ready
              ? 'A first benchmark is shown below and fills in as more competitors are collected.'
              : 'Collecting data — the benchmark appears once your hotel and at least two competitors are analysed.'}{' '}
          Analysis: every review is analysed instantly by the offline rules, then upgraded by{' '}
          {pipeline.aiEnabled ? `AI (${pipeline.aiModel}) in the background — ${pipeline.coverage.byAi}/${pipeline.coverage.analysed} done` : 'AI once GEMINI_API_KEY is set in server/.env'}.
          {pipeline.aiProgress && (
            <span className="ml-1 inline-flex items-center gap-1.5 font-semibold text-ink">
              <Spinner className="size-4" /> {pipeline.aiProgress}
            </span>
          )}
        </p>
        {pipeline.aiEnabled && pipeline.coverage.analysed > pipeline.coverage.byAi && !pipeline.aiProgress && (
          <Button size="sm" iconLeft="sparkle" className="min-h-10" onClick={onUpgrade}>Run the AI pass now</Button>
        )}
      </div>
    </Card>
  );
}
