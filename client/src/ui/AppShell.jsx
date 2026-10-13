import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AipanBorder, AipanMandala } from './aipan.jsx';
import { Icon } from './icons.jsx';
import { cx } from './kit.jsx';

/** Brand: an Aipan chowki as the mark, wordmark, and उत्तराखण्ड beneath. */
export function Brand({ light = false, compact = false }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <AipanMandala className="size-9 shrink-0 drop-shadow-sm" detail="simple" />
      <span className="leading-none">
        <span className={cx('block font-serif text-[1.15rem] font-semibold tracking-tight', light ? 'text-white' : 'text-pine')}>
          Review <em className={cx('font-normal', light ? 'text-glacier' : 'text-forest')}>Intelligence</em>
        </span>
        {!compact && <span className={cx('mt-1 block font-deva text-[0.8rem]', light ? 'text-amber' : 'text-geru')} lang="hi">उत्तराखण्ड · अतिथि देवो भव</span>}
      </span>
    </span>
  );
}

const NAV = [
  { to: '/', label: 'Home', end: true, icon: 'mountain' },
  { to: '/search', label: 'My hotel', icon: 'hotel', match: (p) => p.startsWith('/search') || p.startsWith('/business') },
  { to: '/seeding', label: 'Destinations', icon: 'map', match: (p) => p.startsWith('/seeding') },
];

/** Product header: transparent over the page photo, solid ivory once you scroll. */
export function AppHeader({ overPhoto = true }) {
  const { pathname } = useLocation();
  const [solid, setSolid] = useState(!overPhoto);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!overPhoto) return undefined;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setSolid(window.scrollY > 40));
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => {
      window.removeEventListener('scroll', on);
      cancelAnimationFrame(raf);
    };
  }, [overPhoto]);
  useEffect(() => setOpen(false), [pathname]);
  const light = !solid && !open;
  const isOn = (n) => (n.match ? n.match(pathname) : n.end ? pathname === n.to : pathname.startsWith(n.to));

  return (
    <header className={cx('fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-300', light ? 'bg-transparent' : 'bg-ivory/90 shadow-[0_1px_0_rgb(16_47_41/0.08)] backdrop-blur-xl')}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" aria-label="Review Intelligence — home" className="rounded-xl">
          <Brand light={light} />
        </Link>
        <nav aria-label="Main" className={cx('hidden items-center gap-1 rounded-full p-1 md:flex', light ? 'bg-white/10 ring-1 ring-white/25 backdrop-blur-md' : 'bg-white ring-1 ring-line')}>
          {NAV.map((n) => {
            const on = isOn(n);
            return (
              <NavLink key={n.to} to={n.to} end={n.end} className={cx('relative inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition-colors', on ? 'text-white' : light ? 'text-white/85 hover:text-white' : 'text-slate hover:text-pine')}>
                {on && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-forest" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                <Icon name={n.icon} className="relative size-4" />
                <span className="relative">{n.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <Link to="/search" className={cx('hidden min-h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition lg:inline-flex', light ? 'bg-rice text-pine hover:bg-white' : 'bg-geru text-rice hover:bg-geru-600')}>
          <Icon name="key" className="size-4" /> Check in your hotel
        </Link>
        <button type="button" className={cx('grid size-11 place-items-center rounded-full md:hidden', light ? 'bg-white/15 text-white ring-1 ring-white/30' : 'bg-white text-pine ring-1 ring-line')} aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? 'close' : 'menu'} className="size-5" />
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-nav"
            aria-label="Main"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mx-4 mb-3 grid gap-1 rounded-3xl bg-white p-2 shadow-lift ring-1 ring-line md:hidden"
          >
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={cx('flex min-h-12 items-center gap-3 rounded-2xl px-4 font-bold', isOn(n) ? 'bg-forest text-white' : 'text-pine hover:bg-mist')}>
                <Icon name={n.icon} className="size-5" /> {n.label}
              </NavLink>
            ))}
            <Link to="/search" className="flex min-h-12 items-center gap-3 rounded-2xl bg-geru px-4 font-bold text-rice">
              <Icon name="key" className="size-5" /> Check in your hotel
            </Link>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="relative overflow-hidden bg-pine text-mist">
      <AipanBorder height={24} />
      <AipanMandala className="pointer-events-none absolute -right-24 -bottom-24 size-[26rem] opacity-[0.07]" bg={null} />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <Brand light />
          <p className="mt-4 max-w-sm text-sm text-mist/75">
            Guest-review intelligence for the hotels, homestays and hill towns of Uttarakhand — every review read, every hotel compared with its own neighbourhood.
          </p>
          <p className="mt-4 font-deva text-lg text-amber" lang="hi">अतिथि देवो भव <span className="font-sans text-xs text-mist/60" lang="en">— the guest is god</span></p>
        </div>
        {[
          { h: 'For hotels', links: [['Check in your hotel', '/search'], ['Competitor benchmark', '/search'], ['Guest-review trends', '/search']] },
          { h: 'For destinations', links: [['All destinations', '/seeding'], ['Seed a hill town', '/seeding']] },
          { h: 'Platform', links: [['How it works', '/#how-it-works'], ['Micro-markets', '/#insights'], ['Home', '/']] },
        ].map((c) => (
          <div key={c.h}>
            <p className="eyebrow mb-3 text-glacier">{c.h}</p>
            <ul className="space-y-2 text-sm">
              {c.links.map(([l, to]) => (
                <li key={l}><Link to={to} className="text-mist/80 transition hover:text-white">{l}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="relative mx-auto flex max-w-7xl flex-wrap justify-between gap-2 border-t border-white/10 px-4 py-5 text-xs text-mist/55 sm:px-6 lg:px-8">
        <span>Aipan motifs on this site are original drawings in the Kumaoni folk style. Demo figures are labelled.</span>
        <span>Made in Devbhoomi Uttarakhand</span>
      </div>
    </footer>
  );
}
