import { useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

/** Media conditions every section animates against (gsap.matchMedia keeps them in sync and reverts on change). */
export const MEDIA = {
  motion: '(prefers-reduced-motion: no-preference)',
  reduce: '(prefers-reduced-motion: reduce)',
  desktop: '(min-width: 960px)',
  fine: '(hover: hover) and (pointer: fine)',
};

export const EASE = {
  out: 'power3.out',
  soft: 'power2.out',
  settle: 'expo.out',
  inOut: 'power2.inOut',
};

/** Offsets for each named entrance. Distances shrink on smaller screens (see `scale`). */
const FROM = {
  left: { x: -90 },
  right: { x: 90 },
  top: { y: -70 },
  bottom: { y: 80 },
  'diag-tl': { x: -80, y: -60, rotate: -3 },
  'diag-tr': { x: 80, y: -60, rotate: 3 },
  'diag-bl': { x: -80, y: 70, rotate: 2 },
  'diag-br': { x: 90, y: 70, rotate: -2 },
  depth: { scale: 0.88, y: 30, z: -80 },
};

/**
 * Directional entrance. `from` is one of left, right, top, bottom, diag-tl|tr|bl|br, depth or mask.
 * Plays once when `trigger` enters; reduced motion → a short fade only.
 */
export function enter(targets, { from = 'bottom', trigger, start = 'top 82%', stagger = 0, delay = 0, duration = 1.1, distance = 1, reduce = false, ease = EASE.settle } = {}) {
  const st = trigger ? { trigger, start, once: true } : undefined;
  if (reduce) return gsap.from(targets, { opacity: 0, duration: 0.35, stagger: stagger ? 0.05 : 0, delay, scrollTrigger: st });
  if (from === 'mask') {
    return gsap.from(targets, { clipPath: 'inset(0 0 100% 0)', y: 24, duration, stagger, delay, ease, scrollTrigger: st, clearProps: 'clipPath' });
  }
  const o = FROM[from] ?? FROM.bottom;
  const scaled = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, ['x', 'y', 'z'].includes(k) ? v * distance : v]));
  return gsap.from(targets, { ...scaled, opacity: 0, duration, stagger, delay, ease, scrollTrigger: st, transformPerspective: o.z ? 900 : undefined });
}

/** Draw SVG strokes from zero length. */
export function draw(paths, { trigger, start = 'top 80%', duration = 1.6, stagger = 0.12, delay = 0, scrub = false, end, reduce = false } = {}) {
  const els = gsap.utils.toArray(paths);
  if (!els.length) return null;
  for (const p of els) {
    const len = typeof p.getTotalLength === 'function' ? p.getTotalLength() : 1000;
    gsap.set(p, { strokeDasharray: len, strokeDashoffset: reduce ? 0 : len });
  }
  if (reduce) return null;
  return gsap.to(els, {
    strokeDashoffset: 0,
    duration,
    stagger,
    delay,
    ease: scrub ? 'none' : EASE.inOut,
    scrollTrigger: trigger ? (scrub ? { trigger, start, end, scrub: 0.6 } : { trigger, start, once: true }) : undefined,
  });
}

/** Scroll-linked parallax for layers carrying data-depth (0 = fixed to the page, 1 = moves the most). */
export function parallax(scope, { trigger, distance = 160, start = 'top bottom', end = 'bottom top' } = {}) {
  for (const layer of gsap.utils.toArray(scope.querySelectorAll('[data-depth]'))) {
    const d = Number(layer.dataset.depth) || 0;
    gsap.fromTo(layer, { y: -distance * d * 0.5 }, { y: distance * d * 0.5, ease: 'none', scrollTrigger: { trigger: trigger ?? scope, start, end, scrub: true } });
  }
}

/**
 * Run a section's choreography inside gsap.matchMedia scoped to `ref`, so every tween and
 * ScrollTrigger it creates is reverted on unmount or when the media conditions change.
 * `build(ctx)` receives { isDesktop, reduce, fine, root }.
 */
export function useSectionMotion(ref, build, deps = []) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const mm = gsap.matchMedia(root);
    mm.add(MEDIA, (context) => {
      const { desktop, reduce, fine } = context.conditions;
      return build({ isDesktop: desktop, reduce, fine, root });
    });
    return () => mm.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia(MEDIA.reduce).matches;
