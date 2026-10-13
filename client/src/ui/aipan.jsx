import { useId, useMemo } from 'react';

/**
 * Original motifs drawn in the style of Aipan (ऐपण) — the Kumaoni folk art painted in rice-paste
 * white over red ochre (geru) on thresholds, walls and pujā chowkis. Everything here is generated
 * geometry (rings of dots, scallops, lotus petals, vasudhārā lines); no artwork is copied.
 */

const RICE = '#fffdf7';
const GERU = '#8e1b1b';
const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
const f = (n) => n.toFixed(2);

/** Lotus-petal outline from radius r1 to r2 around angle a. */
function petal(r1, r2, a, spread) {
  const [bx1, by1] = polar(r1, a - spread);
  const [bx2, by2] = polar(r1, a + spread);
  const [tx, ty] = polar(r2, a);
  const [c1x, c1y] = polar(r1 + (r2 - r1) * 0.55, a - spread * 1.35);
  const [c2x, c2y] = polar(r1 + (r2 - r1) * 0.55, a + spread * 1.35);
  return `M${f(bx1)},${f(by1)} Q${f(c1x)},${f(c1y)} ${f(tx)},${f(ty)} Q${f(c2x)},${f(c2y)} ${f(bx2)},${f(by2)}`;
}

/** Ring of outward scallops (semicircles) at radius r. */
function scallops(r, n) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const [x0, y0] = polar(r, a0);
    const [x1, y1] = polar(r, a1);
    const rr = Math.hypot(x1 - x0, y1 - y0) / 2;
    d += `${i ? '' : `M${f(x0)},${f(y0)} `}A${f(rr)},${f(rr)} 0 0 1 ${f(x1)},${f(y1)} `;
  }
  return d;
}

const dots = (r, n, size, offset = 0) =>
  Array.from({ length: n }, (_, i) => {
    const [x, y] = polar(r, ((i + offset) / n) * Math.PI * 2);
    return { x, y, size };
  });

/**
 * Circular Aipan mandala (a "chowki"): lotus centre, petal rings, dot rings and scallops.
 * `bg` paints the geru disc behind; `color` is the paste colour.
 */
export function AipanMandala({ className = '', bg = GERU, color = RICE, petals = 8, detail = 'full', title }) {
  const g = useMemo(() => {
    const outerPetals = petals * 2;
    return {
      lotus: Array.from({ length: petals }, (_, i) => petal(9, 32, (i / petals) * Math.PI * 2 - Math.PI / 2, Math.PI / petals * 0.78)),
      lotusInner: Array.from({ length: petals }, (_, i) => petal(9, 22, (i / petals) * Math.PI * 2 - Math.PI / 2, Math.PI / petals * 0.42)),
      ring2: Array.from({ length: outerPetals }, (_, i) => petal(46, 70, ((i + 0.5) / outerPetals) * Math.PI * 2 - Math.PI / 2, Math.PI / outerPetals * 0.8)),
      scallop: scallops(80, 28),
      dotsA: dots(40, 24, 1.6),
      dotsB: dots(75, 32, 1.4, 0.5),
      dotsC: dots(91, 56, 1.3),
      seeds: dots(57, outerPetals, 1.7),
    };
  }, [petals]);
  const full = detail === 'full';
  return (
    <svg viewBox="-100 -100 200 200" className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      {bg && <circle r="99" fill={bg} />}
      <g fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle r="96" />
        {full && <circle r="86" strokeWidth="1" />}
        {full && <path d={g.scallop} />}
        <circle r="44" />
        {g.ring2.map((d, i) => <path key={i} d={d} />)}
        {g.lotus.map((d, i) => <path key={i} d={d} fill={color} fillOpacity="0.12" />)}
        {g.lotusInner.map((d, i) => <path key={i} d={d} strokeWidth="1" />)}
        <circle r="8" fill={color} />
        <circle r="4" fill={bg || 'none'} stroke="none" />
      </g>
      <g fill={color}>
        {g.dotsA.map((p, i) => <circle key={`a${i}`} cx={f(p.x)} cy={f(p.y)} r={p.size} />)}
        {full && g.dotsB.map((p, i) => <circle key={`b${i}`} cx={f(p.x)} cy={f(p.y)} r={p.size} />)}
        {full && g.dotsC.map((p, i) => <circle key={`c${i}`} cx={f(p.x)} cy={f(p.y)} r={p.size} />)}
        {g.seeds.map((p, i) => <circle key={`s${i}`} cx={f(p.x)} cy={f(p.y)} r={p.size} />)}
      </g>
    </svg>
  );
}

/**
 * Horizontal Aipan border band — scallops, dots and lozenges in paste-white on geru — the kind of
 * band painted along a threshold. Tiles to any width.
 */
export function AipanBorder({ className = '', height = 26, bg = GERU, color = RICE }) {
  const id = useId().replace(/:/g, '');
  const h = height;
  const m = h / 2;
  return (
    <svg className={`block w-full ${className}`} height={h} aria-hidden="true" focusable="false" preserveAspectRatio="none">
      <defs>
        <pattern id={`ab${id}`} width="32" height={h} patternUnits="userSpaceOnUse">
          <rect width="32" height={h} fill={bg} />
          <g fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round">
            <path d={`M0,2.5 H32`} strokeWidth="1" />
            <path d={`M0,${h - 2.5} H32`} strokeWidth="1" />
            <path d={`M0,4 A8,8 0 0 0 16,4 A8,8 0 0 0 32,4`} />
            <path d={`M0,${h - 4} A8,8 0 0 1 16,${h - 4} A8,8 0 0 1 32,${h - 4}`} />
            <path d={`M16,${m - 4.5} L20.5,${m} L16,${m + 4.5} L11.5,${m} Z`} />
          </g>
          <g fill={color}>
            <circle cx="8" cy="7.5" r="1.3" />
            <circle cx="24" cy="7.5" r="1.3" />
            <circle cx="8" cy={h - 7.5} r="1.3" />
            <circle cx="24" cy={h - 7.5} r="1.3" />
            <circle cx="0" cy={m} r="1.6" />
            <circle cx="32" cy={m} r="1.6" />
            <circle cx="16" cy={m} r="1" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height={h} fill={`url(#ab${id})`} />
    </svg>
  );
}

/** Vasudhārā — parallel paste lines with dot rows; a slim vertical or horizontal stripe. */
export function Vasudhara({ className = '', vertical = false, bg = GERU, color = RICE }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} aria-hidden="true" focusable="false" preserveAspectRatio="none" width="100%" height="100%">
      <defs>
        <pattern id={`vs${id}`} width={vertical ? 14 : 10} height={vertical ? 10 : 14} patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill={bg} />
          {vertical ? (
            <g fill={color}>
              <rect x="3" y="0" width="1.4" height="10" />
              <rect x="9.6" y="0" width="1.4" height="10" />
              <circle cx="7" cy="5" r="0.9" />
            </g>
          ) : (
            <g fill={color}>
              <rect x="0" y="3" width="10" height="1.4" />
              <rect x="0" y="9.6" width="10" height="1.4" />
              <circle cx="5" cy="7" r="0.9" />
            </g>
          )}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#vs${id})`} />
    </svg>
  );
}

/** Corner ornament: quarter rings of dots and arcs with a small lotus, for card corners. */
export function AipanCorner({ className = '', color = GERU, rotate = 0 }) {
  const g = useMemo(() => {
    const arc = (r) => `M${r},0 A${r},${r} 0 0 1 0,${r}`;
    const ds = (r, n) => Array.from({ length: n + 1 }, (_, i) => polar(r, (i / n) * (Math.PI / 2)));
    return { arcs: [14, 30, 46].map(arc), d1: ds(22, 5), d2: ds(38, 8), petals: [0.25, 0.75, 1.25].map((k) => petal(3, 12, (k * Math.PI) / 4, 0.32)) };
  }, []);
  return (
    <svg viewBox="-2 -2 60 60" className={className} style={{ transform: `rotate(${rotate}deg)` }} aria-hidden="true" focusable="false">
      <g fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round">
        {g.arcs.map((d, i) => <path key={i} d={d} />)}
        {g.petals.map((d, i) => <path key={i} d={d} />)}
      </g>
      <g fill={color}>
        {g.d1.map(([x, y], i) => <circle key={`a${i}`} cx={f(x)} cy={f(y)} r="1.4" />)}
        {g.d2.map(([x, y], i) => <circle key={`b${i}`} cx={f(x)} cy={f(y)} r="1.2" />)}
      </g>
    </svg>
  );
}

/** Small decorative divider: a line, three dots and a lozenge — for section headers. */
export function AipanRule({ className = '', color = GERU }) {
  return (
    <svg viewBox="0 0 120 12" className={className} aria-hidden="true" focusable="false">
      <g fill={color}>
        <rect x="0" y="5.4" width="44" height="1.2" rx="0.6" />
        <rect x="76" y="5.4" width="44" height="1.2" rx="0.6" />
        <circle cx="50" cy="6" r="1.6" />
        <circle cx="70" cy="6" r="1.6" />
        <path d="M60,0.5 L65.5,6 L60,11.5 L54.5,6 Z" />
      </g>
      <path d="M60,3.6 L62.4,6 L60,8.4 L57.6,6 Z" fill="#fffdf7" />
    </svg>
  );
}
