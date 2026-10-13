import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ScrollTrigger, gsap, useSectionMotion, EASE } from '../motion/motion.js';
import { useSmoothScroll } from '../motion/SmoothScroll.jsx';
import { Cta } from '../components/ui.jsx';

const LINKS = [
  { href: '#coverage', label: 'Platform' },
  { href: '#insights', label: 'Micro-markets' },
  { href: '#destinations', label: 'Destinations' },
  { href: '#how-it-works', label: 'How it works' },
];

export function Brand({ light = false }) {
  return (
    <span className={`brand-mark ${light ? 'is-light' : ''}`}>
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
        <path d="M2 25 L11 11 L16 18 L21 9 L30 25 Z" fill="currentColor" opacity="0.9" />
        <path d="M18.6 13.2 L21 9 L23.4 13.2 L22 12.4 L21 13.6 L20 12.4 Z" fill="#fff" />
        <circle cx="25" cy="7" r="2.4" fill="#E8A15A" />
      </svg>
      <span className="brand-word">
        Review <em>Intelligence</em>
      </span>
    </span>
  );
}

export default function Navbar() {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const { scrollTo } = useSmoothScroll();

  useSectionMotion(ref, ({ reduce }) => {
    const nav = ref.current;
    // Solid bar once the hero is scrolled past (class toggle — no React state on scroll).
    ScrollTrigger.create({ start: 80, end: 'max', onToggle: (self) => nav.classList.toggle('is-solid', self.isActive) });
    gsap.from(nav, { y: reduce ? 0 : -24, opacity: 0, duration: reduce ? 0.3 : 0.9, delay: reduce ? 0 : 0.35, ease: EASE.out });
  });

  const go = (e, href) => {
    e.preventDefault();
    setOpen(false);
    scrollTo(href, { offset: -72, focus: true });
  };

  return (
    <header ref={ref} className="hm-nav">
      <div className="hm-nav-inner">
        <Link to="/" className="hm-brand" aria-label="Review Intelligence home">
          <Brand />
        </Link>
        <nav aria-label="Homepage" className="hm-links">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={(e) => go(e, l.href)}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hm-nav-actions">
          <Link to="/seeding" className="hm-nav-alt">Open dashboard</Link>
          <Cta to="/search" variant="primary" className="cta-small">Find your hotel</Cta>
          <button type="button" className="hm-menu-btn" aria-expanded={open} aria-controls="hm-mobile-menu" onClick={() => setOpen((o) => !o)}>
            <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
            <span className={`burger ${open ? 'is-open' : ''}`} aria-hidden="true"><i /><i /></span>
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            id="hm-mobile-menu"
            className="hm-mobile"
            aria-label="Homepage menu"
            initial={{ opacity: 0, y: -12, clipPath: 'inset(0 0 100% 0 round 18px)' }}
            animate={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0 round 18px)' }}
            exit={{ opacity: 0, y: -8, clipPath: 'inset(0 0 100% 0 round 18px)' }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={(e) => go(e, l.href)}>
                {l.label}
              </a>
            ))}
            <Link to="/seeding" onClick={() => setOpen(false)}>Seed a destination</Link>
            <Link to="/search" onClick={() => setOpen(false)} className="hm-mobile-cta">Explore your hotel →</Link>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
