import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { gsap, ScrollTrigger } from '../motion/motion.js';

/** Number that counts up once when it scrolls into view (writes the DOM directly — no re-renders). */
export function AnimatedCounter({ value, decimals = 0, prefix = '', suffix = '', duration = 1.6, className = '' }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fmt = (n) => `${prefix}${n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
    if (reduce) {
      el.textContent = fmt(value);
      return undefined;
    }
    const obj = { n: 0 };
    el.textContent = fmt(0);
    const tween = gsap.to(obj, {
      n: value,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = fmt(obj.n);
      },
      scrollTrigger: { trigger: el, start: 'top 92%', once: true },
    });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [value, decimals, prefix, suffix, duration, reduce]);
  return (
    <span ref={ref} className={className} aria-label={`${prefix}${value}${suffix}`}>
      {prefix}
      {value}
      {suffix}
    </span>
  );
}

/** Arrow that nudges in its direction when the parent control is hovered. */
export const Arrow = ({ dir = 'right' }) => (
  <span className={`arrow arrow-${dir}`} aria-hidden="true">
    <svg viewBox="0 0 20 20" width="18" height="18">
      <path d="M3 10h13M11 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

/** Primary/secondary call to action. `to` → in-app route; `onClick` → button. */
export function Cta({ to, onClick, children, variant = 'primary', arrow = 'right', className = '', ...rest }) {
  const cls = `cta cta-${variant} ${className}`;
  const inner = (
    <>
      <span>{children}</span>
      {arrow && <Arrow dir={arrow} />}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cls} {...rest}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick} {...rest}>
      {inner}
    </button>
  );
}

/**
 * Horizontal comparison bars (0–100). Your hotel in the brand green, competitors in slate blue —
 * a validated pair; every bar is also direct-labelled so identity never relies on colour.
 */
export function ComparisonBars({ rows, max = 100, caption, unit = '', compact = false }) {
  const reduce = useReducedMotion();
  return (
    <figure className={`cbars ${compact ? 'cbars-compact' : ''}`}>
      <div className="cbars-legend" aria-hidden="true">
        <span><i className="sw sw-you" /> Your hotel</span>
        <span><i className="sw sw-peer" /> Competitors</span>
      </div>
      <ul className="cbars-list">
        {rows.map((r) => (
          <li key={r.label} className={r.you ? 'is-you' : ''}>
            <span className="cbars-label">{r.label}</span>
            <span className="cbars-track" tabIndex={0} aria-label={`${r.label}: ${r.value}${unit}`}>
              <motion.span
                className="cbars-fill"
                initial={false}
                animate={{ scaleX: Math.max(0.02, r.value / max) }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 20, mass: 0.8 }}
              />
              <span className="cbars-tip" role="tooltip">{r.label} · {r.value}{unit}</span>
            </span>
            <span className="cbars-value">{r.value}{unit}</span>
          </li>
        ))}
      </ul>
      {caption && <figcaption className="cbars-caption">{caption}</figcaption>}
    </figure>
  );
}

export const SectionLabel = ({ children, tone = 'dark' }) => <p className={`eyebrow eyebrow-${tone}`}>{children}</p>;

export const DemoTag = ({ children = 'Illustrative demo data' }) => <span className="demo-tag">{children}</span>;

/** Refresh trigger positions after content that changes height (e.g. an expanded panel). */
export const refreshScroll = () => requestAnimationFrame(() => ScrollTrigger.refresh());
