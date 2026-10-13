import { useMemo, useRef, useState } from 'react';
import { ASPECT_LABEL, POSITION, monthLabel } from '../utils/format.js';
import { Badge, EmptyState } from '../ui/kit.jsx';
import { AspectIcon } from '../ui/icons.jsx';

/* Chart colours are theme tokens (index.css): --color-you (forest green), --color-market (slate blue),
   --color-peer, and the diverging trio --color-div-neg / -mid / -pos. Identity never relies on colour
   alone: every chart has a legend, direct labels or a table. */

const Legend = ({ children }) => <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-slate">{children}</div>;

/**
 * Aspect position: one row per aspect, a 0–100 track with every competitor as a small dot, the
 * market's middle half as a band, the market median as a tick and you as the large green dot.
 */
export function AspectStrip({ aspects }) {
  const [hover, setHover] = useState(null);
  return (
    <div role="table" aria-label="Aspect scores: you against the market">
      <div role="row" className="hidden grid-cols-[minmax(170px,1.1fr)_minmax(220px,3fr)_56px_64px_minmax(170px,1.3fr)] gap-4 border-b border-line pb-2 text-[0.7rem] font-extrabold tracking-[0.1em] text-slate uppercase md:grid">
        <span role="columnheader">Topic</span>
        <span role="columnheader" className="flex justify-between normal-case tracking-normal"><span>0 · mostly negative</span><span>50</span><span>100 · mostly positive</span></span>
        <span role="columnheader" className="text-right">You</span>
        <span role="columnheader" className="text-right">Market</span>
        <span role="columnheader">Position</span>
      </div>
      {aspects.map((a) => {
        const pos = POSITION[a.status] ?? POSITION.par;
        return (
          <div role="row" key={a.aspect} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-2 border-b border-line py-3 last:border-0 md:grid-cols-[minmax(170px,1.1fr)_minmax(220px,3fr)_56px_64px_minmax(170px,1.3fr)]">
            <span role="cell" className="flex items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-mist text-forest"><AspectIcon aspect={a.aspect} className="size-4" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink">{a.label}</span>
                <span className="text-xs text-slate">{a.you.n} mentions</span>
              </span>
            </span>
            <span role="cell" className="relative order-last col-span-3 h-7 rounded-full bg-ivory ring-1 ring-line md:order-none md:col-span-1" onMouseLeave={() => setHover(null)}>
              <span aria-hidden="true" className="absolute top-1 bottom-1 left-1/2 w-px bg-pine/15" />
              {a.market.p25 !== null && a.market.p75 !== null && (
                <span aria-hidden="true" className="absolute top-2 bottom-2 rounded-full bg-market/20" style={{ left: `${a.market.p25}%`, width: `${Math.max(a.market.p75 - a.market.p25, 0.8)}%` }} />
              )}
              {a.peers.map((p) => (
                <span
                  key={p.hotelId}
                  className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-peer ring-2 ring-white"
                  style={{ left: `${p.score}%` }}
                  onMouseEnter={() => setHover({ aspect: a.aspect, text: `${p.name}: ${p.score} (${p.n} mentions)`, x: p.score })}
                />
              ))}
              {a.market.median !== null && (
                <span className="absolute top-0.5 bottom-0.5 w-[3px] -translate-x-1/2 rounded bg-market" style={{ left: `${a.market.median}%` }} title={a.market.basis === 'pooled' ? `Market score ${a.market.median} (all competitors' mentions pooled)` : `Market median ${a.market.median}`} />
              )}
              {a.you.score !== null && (
                <span
                  className="absolute top-1/2 z-10 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-you shadow ring-[3px] ring-white"
                  style={{ left: `${a.you.score}%` }}
                  onMouseEnter={() => setHover({ aspect: a.aspect, text: `You: ${a.you.score} (${a.you.n} mentions)`, x: a.you.score })}
                />
              )}
              {hover?.aspect === a.aspect && (
                <span className="pointer-events-none absolute bottom-[calc(100%+6px)] z-20 -translate-x-1/2 rounded-lg bg-pine px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-white" style={{ left: `${Math.min(Math.max(hover.x, 12), 88)}%` }}>{hover.text}</span>
              )}
            </span>
            <span role="cell" className="num text-right font-serif text-lg font-semibold text-pine">{a.you.score ?? '–'}</span>
            <span role="cell" className="num text-right text-sm text-slate">{a.market.median ?? '–'}</span>
            <span role="cell" className="col-span-3 flex flex-wrap gap-1.5 md:col-span-1">
              <Badge tone={pos.tone}>{pos.icon} {pos.label}</Badge>
              {a.marketWide && <Badge tone="warn" title="Most competitors get more complaints than praise here">⚑ Market-wide</Badge>}
            </span>
          </div>
        );
      })}
      <Legend>
        <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-full bg-you" /> You</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-peer" /> Each competitor</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-3 w-[3px] rounded bg-market" /> Market median</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2 w-5 rounded-full bg-market/20" /> Middle half of the market</span>
      </Legend>
    </div>
  );
}

/** Diverging cell colour: warm (negative) ← grey (50) → cool (positive). */
export function divergingStyle(score) {
  if (score === null || score === undefined) return {};
  const d = Math.max(-1, Math.min(1, (score - 50) / 40));
  const pole = d >= 0 ? 'var(--color-div-pos)' : 'var(--color-div-neg)';
  return { background: `color-mix(in oklab, ${pole} ${Math.round(Math.abs(d) * 85)}%, var(--color-div-mid))`, color: Math.abs(d) > 0.6 ? '#fff' : 'var(--color-ink)' };
}

/** Hotels × aspects heatmap. */
export function Heatmap({ rows, aspects, rowLabel = 'Hotel', extraCols = [] }) {
  return (
    <div>
      <div className="scrollbar-thin -mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
        <table className="w-full min-w-[720px] border-separate border-spacing-1 text-sm">
          <thead>
            <tr className="text-[0.7rem] font-extrabold tracking-[0.08em] text-slate uppercase">
              <th className="px-2 py-2 text-left">{rowLabel}</th>
              {extraCols.map((c) => <th key={c.key} className="px-2 py-2 text-right">{c.label}</th>)}
              {aspects.map((a) => (
                <th key={a.key} className="px-1 py-2 text-center">
                  <span className="flex flex-col items-center gap-1"><AspectIcon aspect={a.key} className="size-4 text-forest" />{a.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.isYou ? '[&>td:first-child]:bg-forest [&>td:first-child]:text-white' : ''}>
                <td className="rounded-xl px-3 py-2 font-semibold whitespace-nowrap">{r.label}{r.isYou && <span className="ml-1 text-xs font-bold opacity-80">· you</span>}</td>
                {extraCols.map((c) => <td key={c.key} className="num px-2 py-2 text-right text-slate">{c.render(r)}</td>)}
                {aspects.map((a) => {
                  const cell = r.cells[a.key];
                  return (
                    <td key={a.key} className="num h-10 rounded-xl text-center font-bold" style={divergingStyle(cell?.score)} title={`${ASPECT_LABEL[a.key] ?? a.label}: ${cell?.score ?? 'not enough mentions'} (${cell?.n ?? 0} mentions)`}>
                      {cell?.score ?? <span className="text-slate/60">·</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Legend>
        <span className="inline-flex overflow-hidden rounded-md" aria-hidden="true">{[10, 30, 50, 70, 90].map((v) => <i key={v} className="h-3 w-6" style={divergingStyle(v)} />)}</span>
        <span>0 = all mentions negative · 50 = balanced · 100 = all positive · “·” = fewer than 3 mentions</span>
      </Legend>
    </div>
  );
}

/**
 * Monthly line chart: you vs market, with logged events as dashed markers and the detected
 * changepoint shaded. Crosshair + tooltip on hover.
 */
export function TrendChart({ you, market, events = [], changepoint, yDomain, unit = '' }) {
  const ref = useRef(null);
  const [hi, setHi] = useState(null);
  const W = 760;
  const H = 260;
  const P = { l: 40, r: 16, t: 16, b: 30 };
  const months = you.map((p) => p.month);
  const vals = [...you, ...market].map((p) => p.value).filter((v) => v !== null);
  const [y0, y1] = yDomain ?? [Math.min(...vals, 0), Math.max(...vals, 1)];
  const x = (i) => P.l + (months.length <= 1 ? 0 : (i / (months.length - 1)) * (W - P.l - P.r));
  const y = (v) => P.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - P.t - P.b);
  const path = (series) => {
    let d = '';
    let pen = false;
    series.forEach((p, i) => {
      if (p.value === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const ticks = useMemo(() => {
    const step = (y1 - y0) / 4;
    return [0, 1, 2, 3, 4].map((k) => y0 + k * step);
  }, [y0, y1]);
  const monthIndex = (iso) => months.findIndex((m) => m.slice(0, 7) === String(iso).slice(0, 7));
  const onMove = (e) => {
    const box = ref.current.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    months.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    setHi(best);
  };
  if (!months.length) return <EmptyState title="No dated reviews yet" icon="chart" />;
  const cpIdx = changepoint ? monthIndex(changepoint.month) : -1;

  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full touch-pan-y" onMouseMove={onMove} onMouseLeave={() => setHi(null)} role="img" aria-label="Monthly trend: you and the market">
        {cpIdx >= 0 && <rect x={x(cpIdx)} y={P.t} width={Math.max(W - P.r - x(cpIdx), 0)} height={H - P.t - P.b} fill="var(--color-amber)" opacity="0.12" />}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" />
            <text x={P.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-slate)">{Math.round(t * 10) / 10}</text>
          </g>
        ))}
        {months.map((m, i) => (i % Math.ceil(months.length / 8) === 0 ? <text key={m} x={x(i)} y={H - 9} textAnchor="middle" fontSize="11" fill="var(--color-slate)">{monthLabel(m)}</text> : null))}
        {events.map((e) => {
          const i = monthIndex(e.date);
          if (i < 0) return null;
          return (
            <g key={e.id}>
              <line x1={x(i)} x2={x(i)} y1={P.t} y2={H - P.b} stroke={e.kind === 'intervention' ? 'var(--color-good)' : 'var(--color-geru)'} strokeWidth="1.5" strokeDasharray="4 4" />
              <text x={x(i) + 4} y={P.t + 10} fontSize="11" fontWeight="700" fill="var(--color-ink)">{e.label}</text>
            </g>
          );
        })}
        <path d={path(market)} fill="none" stroke="var(--color-market)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={path(you)} fill="none" stroke="var(--color-you)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
        {you.map((p, i) => (p.value !== null ? <circle key={p.month} cx={x(i)} cy={y(p.value)} r={hi === i ? 5.5 : 3.2} fill="var(--color-you)" stroke="#fff" strokeWidth="2" /> : null))}
        {hi !== null && <line x1={x(hi)} x2={x(hi)} y1={P.t} y2={H - P.b} stroke="var(--color-slate)" strokeDasharray="3 3" />}
      </svg>
      {hi !== null && (
        <div className="pointer-events-none absolute top-0 z-10 min-w-44 -translate-x-1/2 rounded-xl bg-pine px-3 py-2 text-xs text-white shadow-lift" style={{ left: `${Math.min(Math.max((x(hi) / W) * 100, 14), 86)}%` }}>
          <p className="mb-1 font-bold">{monthLabel(months[hi])}</p>
          <p className="flex items-center gap-1.5"><i className="h-0.5 w-3 bg-you" /> You: {you[hi].value ?? '–'}{unit} <span className="opacity-70">({you[hi].n} reviews)</span></p>
          <p className="flex items-center gap-1.5"><i className="h-0.5 w-3 bg-market" /> Market: {market[hi].value ?? '–'}{unit} <span className="opacity-70">({market[hi].n})</span></p>
        </div>
      )}
      <Legend>
        <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-4 bg-you" /> You</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-4 bg-market" /> Market</span>
        {events.length > 0 && <span className="inline-flex items-center gap-1.5"><i className="h-3 border-l-2 border-dashed border-geru" /> Logged event</span>}
        {changepoint && <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-4 bg-amber/25" /> Since the detected change</span>}
      </Legend>
    </div>
  );
}

/** Horizontal diverging bar: share of negative (left) vs positive (right) mentions. */
export function SentimentBar({ pos, neg }) {
  return (
    <span className="relative inline-flex h-2.5 w-44 overflow-hidden rounded-full bg-parchment" title={`${Math.round((pos ?? 0) * 100)}% positive · ${Math.round((neg ?? 0) * 100)}% negative`}>
      <span className="absolute top-0 right-1/2 bottom-0 bg-div-neg" style={{ width: `${(neg ?? 0) * 50}%` }} />
      <span className="absolute top-[-2px] bottom-[-2px] left-1/2 w-0.5 bg-white" />
      <span className="absolute top-0 bottom-0 left-1/2 bg-div-pos" style={{ width: `${(pos ?? 0) * 50}%` }} />
    </span>
  );
}

/** Small vertical bars (monthly counts). */
export function MiniBars({ data, valueKey, labelKey }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  return (
    <div className="flex h-36 items-end gap-1.5" role="img" aria-label="Monthly counts">
      {data.map((d) => (
        <span key={d[labelKey]} className="flex h-full flex-1 flex-col items-center justify-end" title={`${monthLabel(d[labelKey])}: ${d[valueKey]}`}>
          <span className="w-full max-w-8 rounded-t-md bg-geru/85" style={{ height: `${Math.max(2, (d[valueKey] / max) * 100)}%` }} />
          <small className="mt-1 text-[0.65rem] text-slate">{monthLabel(d[labelKey]).split(' ')[0]}</small>
        </span>
      ))}
    </div>
  );
}
