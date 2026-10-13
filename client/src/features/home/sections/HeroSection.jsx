import { useRef } from 'react';
import Landscape from '../components/Landscape.jsx';
import RegionMap from '../components/RegionMap.jsx';
import { Cta } from '../components/ui.jsx';
import { gsap, useSectionMotion, EASE, parallax } from '../motion/motion.js';
import { useSmoothScroll } from '../motion/SmoothScroll.jsx';

const LINES = ['Every guest review', 'across Uttarakhand,', 'in one clear picture.'];

export default function HeroSection() {
  const ref = useRef(null);
  const { scrollTo } = useSmoothScroll();

  useSectionMotion(ref, ({ reduce, isDesktop, fine, root }) => {
    const q = gsap.utils.selector(root);
    if (reduce) {
      gsap.from(q('.hero-copy > *, .dash-wrap'), { opacity: 0, duration: 0.4, stagger: 0.05 });
      return undefined;
    }
    const tl = gsap.timeline({ defaults: { ease: EASE.settle } });
    // Landscape layers settle at different speeds (far ranges barely move, the foreground travels most).
    q('.landscape [data-depth]').forEach((layer) => {
      const d = Number(layer.dataset.depth);
      tl.from(layer, { yPercent: 6 + d * 18, opacity: d < 0.2 ? 0 : 1, duration: 1.6 + d, ease: 'power2.out' }, 0);
    });
    tl.from(q('.hero-line > span'), { yPercent: 115, duration: 1.1, stagger: 0.12 }, 0.45)
      .from(q('.hero-eyebrow'), { y: 14, opacity: 0, duration: 0.8 }, 0.4)
      .from(q('.hero-lede'), { y: 22, opacity: 0, duration: 0.9 }, 0.95)
      .from(q('.hero-cta-primary'), { x: -36, y: 28, opacity: 0, duration: 0.9 }, 1.1)
      .from(q('.hero-cta-secondary'), { x: 36, y: 28, opacity: 0, duration: 0.9 }, 1.18)
      .from(q('.hero-proof > *'), { y: 12, opacity: 0, stagger: 0.06, duration: 0.6 }, 1.3)
      // The region panel slides diagonally in from the right with a slight 3D turn, then the pins drop in.
      .from(q('.dash-wrap'), { x: isDesktop ? 220 : 0, y: isDesktop ? 90 : 60, rotationY: isDesktop ? -16 : 0, rotationX: 6, opacity: 0, duration: 1.5, transformPerspective: 1200 }, 0.7)
      .from(q('.rpin'), { y: -18, opacity: 0, stagger: 0.04, duration: 0.5, ease: 'back.out(2)' }, 1.4)
      .from(q('.hero-scroll'), { opacity: 0, y: -10, duration: 0.8 }, 2.1);

    parallax(root, { trigger: root, start: 'top top', end: 'bottom top', distance: 220 });
    gsap.to(q('.hero-copy'), { y: -80, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to(q('.dash-wrap'), { y: -40, x: isDesktop ? 30 : 0, ease: 'none', scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: true } });

    if (isDesktop && fine) {
      const card = q('.region')[0];
      const rx = gsap.quickTo(card, 'rotationX', { duration: 0.8, ease: 'power3' });
      const ry = gsap.quickTo(card, 'rotationY', { duration: 0.8, ease: 'power3' });
      gsap.set(card, { transformPerspective: 1100 });
      const onMove = (e) => {
        const r = root.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 6);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 4);
      };
      const onLeave = () => {
        rx(0);
        ry(0);
      };
      root.addEventListener('pointermove', onMove);
      root.addEventListener('pointerleave', onLeave);
      return () => {
        root.removeEventListener('pointermove', onMove);
        root.removeEventListener('pointerleave', onLeave);
      };
    }
    return undefined;
  });

  return (
    <section ref={ref} className="hero" aria-labelledby="hero-title">
      <Landscape variant="dawn" label="Illustration: snow-capped Himalayan peaks at dawn above pine ridges and a hillside town" className="hero-bg" />
      <div className="hero-scrim" aria-hidden="true" />
      <div className="hero-inner">
        <div className="hero-copy">
          <p className="eyebrow eyebrow-dark hero-eyebrow">Review intelligence for Uttarakhand</p>
          <h1 id="hero-title" className="hero-title">
            {LINES.map((l, i) => (
              <span key={l} className="hero-line">
                <span className={i === 1 ? 'accent' : ''}>{l}</span>
              </span>
            ))}
          </h1>
          <p className="hero-lede">
            We read what guests write about hotels across the hills — on every platform, in English, Hindi and Hinglish. Each hotel sees where
            it stands in its own micro-market; each destination sees what visitors keep running into.
          </p>
          <div className="hero-ctas">
            <Cta to="/search" className="hero-cta-primary">Find your hotel</Cta>
            <Cta onClick={() => scrollTo('#destinations', { offset: -72, focus: true })} variant="ghost" arrow="down" className="hero-cta-secondary">
              Explore destinations
            </Cta>
          </div>
          <ul className="hero-proof" aria-label="What it covers">
            <li><span className="proof-k">Hotels &amp; homestays</span> benchmarked in their micro-market</li>
            <li><span className="proof-k">Tourism boards</span> see town-wide issues</li>
            <li><span className="proof-k">EN · हिंदी · Hinglish</span> every review read</li>
          </ul>
        </div>
        <div className="dash-wrap">
          <RegionMap />
        </div>
      </div>
      <button type="button" className="hero-scroll" onClick={() => scrollTo('#coverage', { offset: -72 })} aria-label="Scroll to coverage">
        <span className="hero-scroll-line" aria-hidden="true" />
        <span>Scroll</span>
      </button>
    </section>
  );
}
