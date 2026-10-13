import { memo, useMemo } from 'react';

/**
 * Original, procedurally drawn Himalayan landscapes (no photography licence needed): a snow-capped
 * far range, middle ridges, mist, a pine-covered near ridge with a hillside hotel or a hill-town, and
 * a dark foreground. Each layer is its own absolutely positioned SVG carrying `data-depth`, so
 * sections can move layers at different rates with transforms only.
 */

const W = 1600;
const H = 900;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fractal ridge line (midpoint displacement). Returns [[x, y], …] across the full width. */
function ridge({ seed, base, amp, rough = 0.52, iterations = 7, peaks = [] }) {
  const r = rng(seed);
  let pts = [[0, base - r() * amp * 0.4], [W, base - r() * amp * 0.4]];
  // Optional anchor peaks for a recognisable skyline.
  for (const [px, ph] of peaks) pts.push([px * W, base - ph * amp]);
  pts.sort((a, b) => a[0] - b[0]);
  let disp = amp * 0.55;
  for (let i = 0; i < iterations; i++) {
    const next = [pts[0]];
    for (let j = 1; j < pts.length; j++) {
      const [x0, y0] = pts[j - 1];
      const [x1, y1] = pts[j];
      next.push([(x0 + x1) / 2, (y0 + y1) / 2 + (r() - 0.5) * disp], pts[j]);
    }
    pts = next;
    disp *= rough;
  }
  return pts;
}

const toArea = (pts) => `M0,${H} ${pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} L${W},${H} Z`;

function heightAt(pts, x) {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] >= x) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    }
  }
  return pts.at(-1)[1];
}

/** Pines along a ridge, merged into one path. */
function pines(pts, { seed, gap = 11, min = 16, max = 36, sink = 4, from = 0, to = W }) {
  const r = rng(seed);
  let d = '';
  for (let x = from; x < to; x += gap * (0.6 + r() * 0.9)) {
    const h = min + r() * (max - min);
    const w = h * (0.42 + r() * 0.12);
    const y = heightAt(pts, x) + sink + r() * 6;
    const t = y - h;
    d += `M${x.toFixed(1)},${t.toFixed(1)} L${(x + w * 0.32).toFixed(1)},${(t + h * 0.38).toFixed(1)} L${(x + w * 0.18).toFixed(1)},${(t + h * 0.38).toFixed(1)} L${(x + w * 0.5).toFixed(1)},${y.toFixed(1)} L${(x - w * 0.5).toFixed(1)},${y.toFixed(1)} L${(x - w * 0.18).toFixed(1)},${(t + h * 0.38).toFixed(1)} L${(x - w * 0.32).toFixed(1)},${(t + h * 0.38).toFixed(1)} Z `;
  }
  return d;
}

/** Hill-station buildings stepping down a slope: walls, pitched roofs, warm windows. */
function buildings(pts, { seed, from, to, count, scale = 1, hotelAt = -1 }) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = from + ((to - from) * (i + r() * 0.6)) / count;
    const big = i === hotelAt;
    const w = (big ? 92 : 30 + r() * 34) * scale;
    const h = (big ? 58 : 18 + r() * 22) * scale;
    const ground = Math.min(heightAt(pts, x), heightAt(pts, x + w)) + 10 * scale;
    const roof = 12 * scale + r() * 8 * scale;
    const roofColor = big ? '#2c5f4f' : r() > 0.5 ? '#8c3f2e' : '#3d6b5c';
    const windows = [];
    const rows = Math.max(1, Math.floor(h / (14 * scale)));
    const cols = Math.max(1, Math.floor(w / (13 * scale)));
    for (let a = 0; a < rows; a++) {
      for (let b = 0; b < cols; b++) {
        if (r() < 0.35 && !big) continue;
        windows.push({ x: x + 5 * scale + b * ((w - 10 * scale) / cols), y: ground - h + 5 * scale + a * (h / rows), lit: r() > 0.45 });
      }
    }
    out.push({ x, w, h, ground, roof, roofColor, windows, big });
  }
  return out;
}

const VARIANTS = {
  dawn: {
    sky: 'linear-gradient(180deg, #a9d2e2 0%, #cfe6ee 34%, #eef3ec 62%, #f7f0e0 78%, #f5e3c6 100%)',
    sun: { cx: 1180, cy: 470, r: 210, color: '#E8A15A', opacity: 0.35 },
    far: { fill: '#86a9b9', snow: '#ffffff', base: 520, amp: 300, seed: 7, peaks: [[0.2, 0.9], [0.42, 1.05], [0.63, 0.82], [0.83, 0.96]] },
    mid: { fill: '#6b968a', base: 660, amp: 120, seed: 21 },
    mist: 'rgba(238, 243, 236, 0.7)',
    near: { fill: '#1D5746', tree: '#174a3c', base: 790, amp: 90, seed: 33 },
    front: { fill: '#102F29', tree: '#0b241f', base: 900, amp: 50, seed: 51 },
    hotel: { from: 1040, to: 1460, count: 5, hotelAt: 2 },
  },
  forest: {
    sky: 'linear-gradient(180deg, #0c231f 0%, #12352d 45%, #1a4a3d 100%)',
    sun: { cx: 300, cy: 260, r: 120, color: '#B8DCE8', opacity: 0.12 },
    far: { fill: '#21463d', snow: '#5b7f78', base: 470, amp: 240, seed: 4, peaks: [[0.15, 0.8], [0.5, 1], [0.78, 0.86]] },
    mid: { fill: '#1a3f35', base: 560, amp: 150, seed: 15 },
    mist: 'rgba(184, 220, 232, 0.10)',
    near: { fill: '#13342c', tree: '#0f2b24', base: 650, amp: 130, seed: 27 },
    front: { fill: '#0a1f1b', tree: '#071814', base: 800, amp: 90, seed: 61 },
  },
  sunset: {
    sky: 'linear-gradient(180deg, #9cbccb 0%, #d8cdbd 34%, #f1c08a 60%, #E8A15A 82%, #d98a4b 100%)',
    sun: { cx: 980, cy: 500, r: 240, color: '#ffd29a', opacity: 0.8 },
    far: { fill: '#7f8f9c', snow: '#fff3e2', base: 540, amp: 320, seed: 12, peaks: [[0.25, 0.85], [0.5, 1.05], [0.72, 0.9]] },
    mid: { fill: '#5b6e6a', base: 620, amp: 150, seed: 44 },
    mist: 'rgba(247, 225, 196, 0.45)',
    near: { fill: '#2a4a40', tree: '#223f36', base: 710, amp: 110, seed: 38 },
    front: { fill: '#102F29', tree: '#0b241f', base: 840, amp: 70, seed: 73 },
  },
  panorama: {
    sky: 'linear-gradient(180deg, #b8dce8 0%, #dcebee 45%, #eef3ec 100%)',
    sun: null,
    far: { fill: '#9db8c4', snow: '#ffffff', base: 440, amp: 250, seed: 91, peaks: [[0.14, 0.62], [0.3, 1], [0.44, 0.7], [0.6, 0.95], [0.78, 0.6], [0.9, 0.82]] },
    mid: { fill: '#6f978b', base: 560, amp: 120, seed: 19 },
    mist: 'rgba(238, 243, 236, 0.7)',
    near: { fill: '#2b6553', tree: '#235546', base: 650, amp: 90, seed: 57 },
    front: { fill: '#1D5746', tree: '#174a3c', base: 820, amp: 60, seed: 83 },
    town: { from: 160, to: 1460, count: 34 },
  },
};

function build(variant) {
  const v = VARIANTS[variant] ?? VARIANTS.dawn;
  const far = ridge({ ...v.far, rough: 0.55, iterations: 8 });
  const mid = ridge({ ...v.mid });
  const near = ridge({ ...v.near, rough: 0.48 });
  const front = ridge({ ...v.front, rough: 0.45 });
  const minFar = Math.min(...far.map((p) => p[1]));
  return {
    v,
    far: toArea(far),
    snowTop: minFar,
    snowLine: minFar + (v.far.base - minFar) * 0.42,
    mid: toArea(mid),
    midTrees: pines(mid, { seed: v.mid.seed + 1, gap: 18, min: 8, max: 15, sink: 6 }),
    near: toArea(near),
    nearTrees: pines(near, { seed: v.near.seed + 1, gap: 10, min: 16, max: 34, from: 0, to: v.hotel ? v.hotel.from - 20 : W }) + (v.hotel ? pines(near, { seed: v.near.seed + 2, gap: 10, from: v.hotel.to + 20, to: W }) : ''),
    front: toArea(front),
    frontTrees: pines(front, { seed: v.front.seed + 1, gap: 14, min: 34, max: 70, sink: 10 }),
    hotel: v.hotel ? buildings(near, { seed: 5, ...v.hotel }) : [],
    town: v.town ? buildings(near, { seed: 9, from: v.town.from, to: v.town.to, count: v.town.count, scale: 0.62 }) : [],
  };
}

function Buildings({ items, glow }) {
  return (
    <g>
      {items.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.ground - b.h} width={b.w} height={b.h + 30} fill={b.big ? '#f4efe3' : '#e4dccb'} />
          <path d={`M${b.x - 4},${b.ground - b.h} L${b.x + b.w / 2},${b.ground - b.h - b.roof} L${b.x + b.w + 4},${b.ground - b.h} Z`} fill={b.roofColor} />
          {b.windows.map((w, j) => (
            <rect key={j} x={w.x} y={w.y} width={b.big ? 7 : 5} height={b.big ? 9 : 6} fill={w.lit ? glow : '#7e8f88'} opacity={w.lit ? 0.95 : 0.6} />
          ))}
          {b.big && <rect x={b.x - 6} y={b.ground - b.h * 0.45} width={b.w + 12} height={3} fill="#2c5f4f" />}
        </g>
      ))}
    </g>
  );
}

const Layer = ({ depth, children, className = '', align = 'xMidYMax' }) => (
  <div className={`ls-layer ${className}`} data-depth={depth} aria-hidden="true">
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio={`${align} slice`} focusable="false">
      {children}
    </svg>
  </div>
);

/**
 * `variant`: dawn | forest | sunset | panorama. `label` is the accessible description.
 * `align`: how the 16:9 scene is cropped into its box (xMidYMax keeps the foreground; xMidYMid suits wide bands).
 */
function Landscape({ variant = 'dawn', label, className = '', align = 'xMidYMax', decorative = false }) {
  const g = useMemo(() => build(variant), [variant]);
  const { v } = g;
  const id = `ls-${variant}`;
  return (
    <div className={`landscape ${className}`} style={{ background: v.sky }} {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}>
      {v.sun && (
        <Layer align={align} depth="0.05">
          <defs>
            <radialGradient id={`${id}-sun`}>
              <stop offset="0" stopColor={v.sun.color} stopOpacity={v.sun.opacity} />
              <stop offset="1" stopColor={v.sun.color} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={v.sun.cx} cy={v.sun.cy} r={v.sun.r * 2.2} fill={`url(#${id}-sun)`} />
        </Layer>
      )}
      <Layer align={align} depth="0.12">
        <defs>
          <linearGradient id={`${id}-snow`} gradientUnits="userSpaceOnUse" x1="0" y1={g.snowTop} x2="0" y2={v.far.base}>
            <stop offset="0" stopColor={v.far.snow} />
            <stop offset={(g.snowLine - g.snowTop) / (v.far.base - g.snowTop)} stopColor={v.far.snow} stopOpacity="0.92" />
            <stop offset={Math.min(1, (g.snowLine - g.snowTop) / (v.far.base - g.snowTop) + 0.12)} stopColor={v.far.fill} />
            <stop offset="1" stopColor={v.far.fill} />
          </linearGradient>
        </defs>
        <path d={g.far} fill={`url(#${id}-snow)`} />
      </Layer>
      <Layer align={align} depth="0.25">
        <path d={g.mid} fill={v.mid.fill} />
        <path d={g.midTrees} fill={v.mid.fill} opacity="0.9" />
        {g.town.length > 0 && <Buildings items={g.town} glow="#f2c27f" />}
      </Layer>
      <div className="ls-mist" data-depth="0.3" style={{ background: `linear-gradient(180deg, transparent 0%, ${v.mist} 55%, transparent 100%)` }} aria-hidden="true" />
      <Layer align={align} depth="0.45">
        <path d={g.near} fill={v.near.fill} />
        <path d={g.nearTrees} fill={v.near.tree} />
        {g.hotel.length > 0 && <Buildings items={g.hotel} glow="#E8A15A" />}
      </Layer>
      <Layer align={align} depth="0.7" className="ls-front">
        <path d={g.front} fill={v.front.fill} />
        <path d={g.frontTrees} fill={v.front.tree} />
      </Layer>
    </div>
  );
}

export default memo(Landscape);

/** Thin topographic contour lines for light sections (decorative). */
export function Contours({ className = '', seed = 3, lines = 7, color = 'currentColor' }) {
  const paths = useMemo(() => {
    const out = [];
    for (let i = 0; i < lines; i++) {
      const pts = ridge({ seed: seed + i * 13, base: 120 + i * 95, amp: 70, rough: 0.5, iterations: 5 });
      out.push(`M${pts.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(' L')}`);
    }
    return out;
  }, [seed, lines]);
  return (
    <svg className={`contours ${className}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke" opacity={0.18 + (i % 3) * 0.06} />
      ))}
    </svg>
  );
}

/** Organic landscape divider between sections (ridge silhouette). */
export function RidgeDivider({ fill, seed = 2, flip = false, className = '' }) {
  const d = useMemo(() => toArea(ridge({ seed, base: 760, amp: 260, rough: 0.5, iterations: 6 })), [seed]);
  return (
    <svg className={`ridge-divider ${className}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false" style={flip ? { transform: 'scaleY(-1)' } : undefined}>
      <path d={d} fill={fill} />
    </svg>
  );
}
