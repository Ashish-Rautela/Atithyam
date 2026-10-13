import { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Contours } from '../components/Landscape.jsx';
import { DemoTag } from '../components/ui.jsx';
import { gsap, useSectionMotion, enter, draw } from '../motion/motion.js';
import { IMPACT } from '../data/homeDemo.js';

const CW = 900;
const CH = 320;
const PAD = { l: 44, r: 20, t: 24, b: 40 };
const xAt = (i) => PAD.l + (i * (CW - PAD.l - PAD.r)) / (IMPACT.months.length - 1);
// Score axis 20–80: the data sits between 40 and 70; 50 (balanced) is marked.
const Y0 = 20;
const Y1 = 80;
const yAt = (v) => PAD.t + ((Y1 - v) * (CH - PAD.t - PAD.b)) / (Y1 - Y0);
const avg = (arr, [a, b]) => Math.round(arr.slice(a, b + 1).reduce((s, v) => s + v, 0) / (b - a + 1));
const sum = (arr, [a, b]) => arr.slice(a, b + 1).reduce((s, v) => s + v, 0);

export default function ImpactTimelineSection() {
  const ref = useRef(null);
  const [cp, setCp] = useState('m3');
  const [hover, setHover] = useState(null);
  const reduce = useReducedMotion();
  const check = IMPACT.checkpoints.find((c) => c.id === cp);
  const before = IMPACT.checkpoints[0].range;
  const beforeScore = avg(IMPACT.score, before);
  const winScore = avg(IMPACT.score, check.range);
  const delta = winScore - beforeScore;
  const line = IMPACT.score.map((v, i) => `${i ? 'L' : 'M'}${xAt(i)},${yAt(v)}`).join(' ');
  const area = `${line} L${xAt(IMPACT.score.length - 1)},${yAt(Y0)} L${xAt(0)},${yAt(Y0)} Z`;
  const maxVol = Math.max(...IMPACT.volume);

  useSectionMotion(ref, ({ reduce: rm, root }) => {
    const q = gsap.utils.selector(root);
    enter(q('.impact-copy > *'), { from: 'right', trigger: q('.impact-copy')[0], stagger: 0.1, reduce: rm, distance: 0.6 });
    enter(q('.impact-card'), { from: 'diag-bl', trigger: q('.impact-card')[0], reduce: rm, distance: 0.8 });
    draw(q('.impact-line'), { trigger: q('.impact-card')[0], start: 'top 70%', duration: 2.2, reduce: rm });
    if (!rm) {
      gsap.from(q('.impact-area'), { opacity: 0, duration: 1.2, delay: 1, scrollTrigger: { trigger: q('.impact-card')[0], start: 'top 70%', once: true } });
      gsap.from(q('.vol-bar'), { scaleY: 0, transformOrigin: '50% 100%', stagger: 0.04, duration: 0.6, ease: 'power2.out', scrollTrigger: { trigger: q('.impact-vol')[0], start: 'top 90%', once: true } });
    }
  });

  return (
    <section ref={ref} className="impact" aria-labelledby="impact-title">
      <Contours className="impact-contours" seed={41} lines={6} color="#1D5746" />
      <div className="wrap impact-grid">
        <div className="impact-copy">
          <p className="eyebrow eyebrow-light">06 — Measuring change</p>
          <h2 id="impact-title" className="display">Did your changes <em>actually</em> work?</h2>
          <p className="lede">
            Log a change — a new breakfast menu, a refurbished floor, a new front-desk process — and watch what guests say about that topic
            before and after, with the number of reviews behind every point.
          </p>
          <div className="checkpoints" role="tablist" aria-label="Checkpoints">
            {IMPACT.checkpoints.map((c, i) => (
              <button key={c.id} type="button" role="tab" aria-selected={c.id === cp} className={c.id === cp ? 'is-on' : ''} onClick={() => setCp(c.id)}>
                <span className="cp-n">{i + 1}</span>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <figure className="impact-card">
          <div className="impact-head">
            <div>
              <p className="impact-k">Breakfast sentiment (0–100) · Deodar Heights</p>
              <p className="impact-big">
                <span className={delta >= 0 ? 'up' : 'down'}>{delta > 0 ? '+' : ''}{delta}</span>
                <span className="impact-big-k">
                  {check.id === 'before' ? 'baseline (Jan–Mar)' : `vs before (${beforeScore} → ${winScore})`}
                </span>
              </p>
            </div>
            <p className="impact-vols">
              {sum(IMPACT.volume, check.range)} reviews in this window
              <br />
              {sum(IMPACT.volume, before)} reviews before
            </p>
          </div>

          <svg viewBox={`0 0 ${CW} ${CH}`} className="impact-chart" role="img" aria-label={`Breakfast sentiment by month, from ${IMPACT.score[0]} in ${IMPACT.months[0]} to ${IMPACT.score.at(-1)} in ${IMPACT.months.at(-1)}; the menu changed in ${IMPACT.months[IMPACT.change.index]}.`}>
            {[30, 50, 70].map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={CW - PAD.r} y1={yAt(v)} y2={yAt(v)} className={v === 50 ? 'grid-mid' : 'grid'} />
                <text x={PAD.l - 10} y={yAt(v) + 4} className="axis" textAnchor="end">{v}</text>
              </g>
            ))}
            <motion.rect
              className="impact-window"
              y={PAD.t}
              height={CH - PAD.t - PAD.b}
              initial={false}
              animate={{ x: xAt(check.range[0]) - 18, width: xAt(check.range[1]) - xAt(check.range[0]) + 36 }}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 140, damping: 22 }}
            />
            <rect className="impact-window impact-window-before" x={xAt(before[0]) - 18} y={PAD.t} width={xAt(before[1]) - xAt(before[0]) + 36} height={CH - PAD.t - PAD.b} />
            <line x1={xAt(IMPACT.change.index)} x2={xAt(IMPACT.change.index)} y1={PAD.t - 6} y2={CH - PAD.b} className="impact-change" />
            <text x={xAt(IMPACT.change.index) + 8} y={PAD.t + 8} className="impact-change-k">{IMPACT.change.label}</text>
            <path d={area} className="impact-area" />
            <path d={line} className="impact-line" />
            {IMPACT.score.map((v, i) => (
              <g key={i} className="impact-pt" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${IMPACT.months[i]}: score ${v}, ${IMPACT.volume[i]} reviews`}>
                <rect x={xAt(i) - 20} y={PAD.t} width="40" height={CH - PAD.t - PAD.b} fill="transparent" />
                <circle cx={xAt(i)} cy={yAt(v)} r={hover === i ? 7 : 4.5} className="impact-dot" />
              </g>
            ))}
            {hover !== null && (
              <g className="impact-tip" transform={`translate(${Math.min(xAt(hover) + 10, CW - 150)},${Math.max(yAt(IMPACT.score[hover]) - 52, 4)})`} pointerEvents="none">
                <rect width="138" height="44" rx="8" />
                <text x="10" y="18">{IMPACT.months[hover]} · score {IMPACT.score[hover]}</text>
                <text x="10" y="35" className="impact-tip-sub">{IMPACT.volume[hover]} breakfast reviews</text>
              </g>
            )}
            {IMPACT.months.map((m, i) => <text key={m} x={xAt(i)} y={CH - 14} className="axis" textAnchor="middle">{m}</text>)}
          </svg>

          <div className="impact-vol" aria-label="Breakfast reviews per month">
            <span className="impact-vol-k">Reviews per month</span>
            <div className="impact-vol-bars">
              {IMPACT.volume.map((v, i) => (
                <span key={i} className={`vol-bar ${i >= check.range[0] && i <= check.range[1] ? 'is-on' : ''}`} style={{ height: `${(v / maxVol) * 100}%` }} title={`${IMPACT.months[i]}: ${v} reviews`} />
              ))}
            </div>
          </div>

          <figcaption className="impact-caveat">
            <strong>Read this as evidence, not proof.</strong> Review sentiment rose after the change, but season, guest mix and other changes
            can move it too. The comparison shows what guests said — not that the menu alone caused it.
          </figcaption>
          <DemoTag />
        </figure>
      </div>
    </section>
  );
}
