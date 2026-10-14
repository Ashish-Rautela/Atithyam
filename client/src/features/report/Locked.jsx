import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../ui/icons.jsx';
import { cx } from '../../ui/kit.jsx';

/**
 * Premium content behind frosted glass. The children are PLACEHOLDERS (the server never sends the
 * real locked data); they only give the blur a believable shape.
 */
export function Locked({ children, title, hint, to, cta = 'Unlock with Hotel Pro', className, tight = false }) {
  return (
    <div className={cx('relative isolate overflow-hidden rounded-3xl', className)}>
      <div aria-hidden="true" className="pointer-events-none select-none blur-[6px] saturate-[0.6]">{children}</div>
      <div className="absolute inset-0 bg-linear-to-b from-ivory/0 via-ivory/35 to-ivory/80" />
      <div className={cx('absolute inset-0 flex items-center justify-center p-4', tight && 'items-end pb-5')}>
        <div className="max-w-sm rounded-3xl bg-white/95 px-5 py-4 text-center shadow-lift ring-1 ring-line backdrop-blur">
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-geru text-rice shadow-[0_10px_20px_-12px_rgb(142_27_27/0.9)]">
            <Icon name="lock" className="size-5" />
          </span>
          {title && <p className="mt-2 font-serif text-xl leading-snug text-pine">{title}</p>}
          {hint && <p className="mt-1 text-sm text-slate">{hint}</p>}
          <Link to={to} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-geru px-5 text-sm font-bold text-rice transition hover:bg-geru-600">
            <Icon name="key" className="size-4" /> {cta}
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Small inline lock for a single value (e.g. one topic's score). */
export function LockedValue({ className }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)}>
      <span aria-hidden="true" className="h-2.5 w-20 rounded-full bg-linear-to-r from-slate/30 via-slate/15 to-slate/30 blur-[3px]" />
      <Icon name="lock" className="size-3.5 text-geru" />
      <span className="sr-only">Locked - part of Hotel Pro</span>
    </span>
  );
}

// Nonsense words so the blurred text has a natural rhythm but carries no information.
const SYL = ['ka', 'ra', 'mo', 'te', 'lu', 'ne', 'pa', 'si', 'do', 'ri', 'ga', 'vo', 'shi', 'ta', 'me', 'lo'];
function words(seed, n) {
  let x = seed * 9301 + 49297;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: n }, () => Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => SYL[Math.floor(rnd() * SYL.length)]).join('')).join(' ');
}

/** Placeholder paragraph lines (for blurred areas). */
export function FakeText({ lines = 3, seed = 1, className }) {
  return (
    <div className={cx('space-y-1.5', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <p key={i} className="text-[0.95rem] leading-relaxed text-ink">{words(seed + i, i === lines - 1 ? 7 : 13)}</p>
      ))}
    </div>
  );
}

/** Placeholder cards shaped like the real "problem" / "action" cards. */
export function FakeCards({ count = 3, seed = 3, numbered = false }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: Math.max(1, count) }, (_, i) => (
        <div key={i} className="flex gap-4 rounded-2xl bg-white p-4 ring-1 ring-line">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-geru-50 font-serif text-lg text-geru">{numbered ? i + 1 : '!'}</span>
          <div className="min-w-0 flex-1">
            <p className="font-serif text-lg text-pine">{words(seed * 7 + i, 5)}</p>
            <p className="text-sm text-slate">{words(seed * 11 + i, 14)}</p>
            <p className="mt-2 border-l-2 border-geru pl-3 font-serif text-ink italic">“{words(seed * 13 + i, 10)}”</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Lazy section: renders a light skeleton until the section scrolls near the viewport, then its
 * content (with a soft reveal). Keeps the first paint of a long report fast.
 */
export function LazySection({ children, minHeight = 240, className, id }) {
  const ref = useRef(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return undefined;
    if (!('IntersectionObserver' in window)) {
      setShow(true);
      return undefined;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setShow(true);
        io.disconnect();
      }
    }, { rootMargin: '300px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return (
    <section ref={ref} id={id} className={cx('scroll-mt-24', className)} style={show ? undefined : { minHeight }}>
      {show ? <div className="animate-[rise_0.5s_ease-out_both]">{children}</div> : (
        <div aria-hidden="true" className="h-full animate-pulse rounded-[2rem] bg-white/60 ring-1 ring-line" style={{ minHeight }} />
      )}
    </section>
  );
}
