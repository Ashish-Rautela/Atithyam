import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '../ui/kit.jsx';
import { AipanCorner, AipanMandala } from '../ui/aipan.jsx';
import { Icon } from '../ui/icons.jsx';

const PLAN = {
  pro: { name: 'Hotel Pro', line: 'Benchmarks against the hotels next door, competitors, trends and AI summaries.', icon: 'chart' },
  destination: { name: 'Destination', line: 'Town-wide dashboards, micro-markets and city seeding for tourism boards.', icon: 'map' },
};

/** Inline card shown where a page needs a plan the account does not have (HTTP 402). */
export function PlanRequiredCard({ requiredPlan = 'pro', message, className = '' }) {
  const p = PLAN[requiredPlan] ?? PLAN.pro;
  return (
    <section className={`relative overflow-hidden rounded-[2rem] bg-geru p-6 text-rice shadow-lift sm:p-8 ${className}`} aria-labelledby="plan-req-title">
      <AipanMandala className="pointer-events-none absolute -top-16 -right-16 size-56 opacity-15" bg={null} color="#fffdf7" />
      <div className="relative flex flex-wrap items-start gap-5">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/25"><Icon name={p.icon} className="size-7 text-amber" /></span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-amber">Part of {p.name}</p>
          <h2 id="plan-req-title" className="mt-1 font-serif text-2xl text-white sm:text-3xl">Unlock this view with {p.name}</h2>
          <p className="mt-2 max-w-2xl text-rice/85">{message || p.line}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button to={`/pricing?plan=${requiredPlan}`} variant="light" icon="arrowRight">See plans &amp; upgrade</Button>
            <Button to="/account" variant="glass">My account</Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** 401 / 403 / 402 shown nicely; returns null for other errors. */
export function AccessError({ error }) {
  const loc = useLocation();
  if (!error) return null;
  if (error.status === 402) return <PlanRequiredCard requiredPlan={error.detail?.requiredPlan} message={error.message} />;
  if (error.status === 401) {
    return (
      <div className="rounded-3xl bg-white p-6 text-center shadow-card ring-1 ring-line">
        <p className="font-serif text-2xl text-pine">Please sign in</p>
        <p className="mt-1 text-slate">Your session has ended. Sign in again to continue.</p>
        <Button className="mt-4" to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} icon="arrowRight">Sign in</Button>
      </div>
    );
  }
  if (error.status === 403) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-card ring-1 ring-line">
        <p className="flex items-center gap-2 font-serif text-2xl text-pine"><Icon name="key" className="size-6 text-geru" /> Not in your account</p>
        <p className="mt-1 max-w-2xl text-slate">{error.message}</p>
        <Button className="mt-4" to="/search" icon="arrowRight">Check in your hotel</Button>
      </div>
    );
  }
  return null;
}

/** Modal after an action (button) needed a paid plan. */
export function UpgradeDialog({ open, requiredPlan = 'pro', message, onClose }) {
  const first = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    first.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  const p = PLAN[requiredPlan] ?? PLAN.pro;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] grid place-items-center bg-pine/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            role="dialog" aria-modal="true" aria-labelledby="upgrade-title"
            className="relative w-full max-w-md overflow-hidden rounded-[2rem] bg-ivory p-7 shadow-lift"
            initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 12, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <AipanCorner className="pointer-events-none absolute top-3 left-3 size-12 opacity-25" />
            <AipanCorner className="pointer-events-none absolute right-3 bottom-3 size-12 opacity-25" rotate={180} />
            <span className="grid size-14 place-items-center rounded-2xl bg-geru text-rice"><Icon name={p.icon} className="size-7" /></span>
            <h2 id="upgrade-title" className="mt-4 font-serif text-3xl text-pine">This needs {p.name}</h2>
            <p className="mt-2 text-slate">{message || p.line}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link ref={first} to={`/pricing?plan=${requiredPlan}`} onClick={onClose} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-geru px-5 font-bold text-rice hover:bg-geru-600">
                See plans <Icon name="arrowRight" className="size-4" />
              </Link>
              <button type="button" onClick={onClose} className="min-h-11 rounded-full px-5 font-bold text-pine ring-1 ring-line hover:bg-white">Not now</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
