import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import Lenis from 'lenis';
import { gsap, ScrollTrigger, prefersReducedMotion } from './motion.js';

const ScrollCtx = createContext({ scrollTo: () => {} });

/**
 * One scroll system for the homepage: Lenis smooths the native window scroll and drives GSAP's
 * ticker, and ScrollTrigger updates from Lenis — so pinning, scrubbing and smoothing never fight.
 * Reduced motion → no Lenis, plain native scrolling.
 */
export function SmoothScroll({ children }) {
  const lenisRef = useRef(null);

  useEffect(() => {
    let lenis = null;
    let tick = null;
    if (!prefersReducedMotion()) {
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 0.9 });
      lenis.on('scroll', ScrollTrigger.update);
      tick = (time) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      lenisRef.current = lenis;
    }
    // Layout settles once the web fonts are in; recompute trigger positions then.
    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh).catch(() => {});
    window.addEventListener('load', refresh);
    return () => {
      window.removeEventListener('load', refresh);
      if (tick) gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis?.destroy();
      lenisRef.current = null;
    };
  }, []);

  const scrollTo = useCallback((target, opts = {}) => {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (lenisRef.current) {
      lenisRef.current.scrollTo(el ?? target, { offset: opts.offset ?? 0, duration: opts.duration ?? 1.4 });
    } else if (typeof target === 'number') {
      window.scrollTo({ top: target, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    } else if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY + (opts.offset ?? 0);
      window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
    if (el && opts.focus) el.focus({ preventScroll: true });
  }, []);

  return <ScrollCtx.Provider value={{ scrollTo }}>{children}</ScrollCtx.Provider>;
}

export const useSmoothScroll = () => useContext(ScrollCtx);
