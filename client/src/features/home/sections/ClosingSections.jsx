import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Landscape, { RidgeDivider } from '../components/Landscape.jsx';
import { Arrow } from '../components/ui.jsx';
import { gsap, useSectionMotion, enter, parallax } from '../motion/motion.js';
import { useSmoothScroll } from '../motion/SmoothScroll.jsx';
import { Brand } from './Navbar.jsx';

/* ------------------------------------------------------------------ Final CTA */

export function FinalCTASection() {
  const ref = useRef(null);
  const navigate = useNavigate();
  const [name, setName] = useState('');

  useSectionMotion(ref, ({ reduce, isDesktop, root }) => {
    const q = gsap.utils.selector(root);
    if (!reduce) parallax(root, { trigger: root, distance: isDesktop ? 240 : 90 });
    enter(q('.final-line > span'), { from: 'mask', trigger: root, start: 'top 60%', stagger: 0.12, reduce });
    enter(q('.final-sub, .final-form, .final-note'), { from: 'bottom', trigger: root, start: 'top 55%', stagger: 0.1, delay: 0.3, reduce, distance: 0.4 });
  });

  const submit = (e) => {
    e.preventDefault();
    navigate(name.trim() ? `/search?name=${encodeURIComponent(name.trim())}` : '/search');
  };

  return (
    <section ref={ref} className="final" aria-labelledby="final-title">
      <Landscape variant="sunset" label="Illustration: Himalayan peaks glowing at sunset over pine ridges" className="final-bg" />
      <div className="final-shade" aria-hidden="true" />
      <div className="wrap final-inner">
        <h2 id="final-title" className="final-title">
          <span className="final-line"><span>Better guest experiences</span></span>
          <span className="final-line"><span>start with <em>better insights.</em></span></span>
        </h2>
        <p className="final-sub">Understand what guests are saying, compare your hotel with nearby competitors, and decide what deserves attention first.</p>
        <form className="final-form" onSubmit={submit}>
          <label htmlFor="final-name" className="sr-only">Your hotel’s name</label>
          <input id="final-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your hotel’s name" maxLength={120} autoComplete="organization" />
          <button type="submit" className="cta cta-primary">
            <span>Explore your hotel</span>
            <Arrow />
          </button>
        </form>
        <p className="final-note">Start with your hotel’s name — or <Link to="/seeding" className="final-alt">explore a destination</Link>.</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Footer */

export function Footer() {
  const { scrollTo } = useSmoothScroll();
  const anchor = (href) => (e) => {
    e.preventDefault();
    scrollTo(href, { offset: -72, focus: true });
  };
  return (
    <footer className="foot">
      <RidgeDivider fill="#102F29" seed={17} className="foot-ridge" />
      <div className="wrap foot-grid">
        <div className="foot-brand">
          <Brand light />
          <p>Guest-review intelligence and destination benchmarking for hotels, homestays and tourism boards across Uttarakhand.</p>
        </div>
        <nav aria-label="Product" className="foot-col">
          <h3>Product</h3>
          <Link to="/search">Explore your hotel</Link>
          <a href="#how-it-works" onClick={anchor('#how-it-works')}>How it works</a>
          <a href="#insights" onClick={anchor('#insights')}>Micro-market benchmark</a>
        </nav>
        <nav aria-label="Hotel owners" className="foot-col">
          <h3>Hotel owners</h3>
          <a href="#story" onClick={anchor('#story')}>From reviews to decisions</a>
          <Link to="/search">Find your property</Link>
        </nav>
        <nav aria-label="Tourism boards" className="foot-col">
          <h3>Tourism boards</h3>
          <a href="#destinations" onClick={anchor('#destinations')}>Destination view</a>
          <Link to="/seeding">Destination insights</Link>
        </nav>
        <div className="foot-col">
          <h3>Company</h3>
          <span className="foot-muted">Contact — coming soon</span>
          <span className="foot-muted">Privacy &amp; terms — coming soon</span>
        </div>
      </div>
      <div className="wrap foot-base">
        <span>Landscapes on this page are original illustrations. Figures in the demos are illustrative.</span>
        <span>Made in Uttarakhand</span>
      </div>
    </footer>
  );
}
