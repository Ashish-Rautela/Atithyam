import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Contours } from '../components/Landscape.jsx';
import { DemoTag } from '../components/ui.jsx';
import { gsap, useSectionMotion, enter, EASE } from '../motion/motion.js';
import { PLATFORMS, REVIEW_SNIPPETS, TOPIC_NODES, LANGUAGE_CYCLE } from '../data/homeDemo.js';

const CARD_W = 28; // % of the composition width
const node = (id) => TOPIC_NODES.find((n) => n.id === id);

/** Curved connector from a review card's inner edge to a topic node, in pixels of a w×h box. */
function connector(card, topicId, w, h) {
  const n = node(topicId);
  const leftSide = card.pos.x < 40;
  const ax = ((leftSide ? card.pos.x + CARD_W : card.pos.x) / 100) * w;
  const ay = ((card.pos.y + 9) / 100) * h;
  const nx = (n.x / 100) * w;
  const ny = (n.y / 100) * h;
  const mx = (ax + nx) / 2;
  return `M${ax.toFixed(1)},${ay.toFixed(1)} C${mx.toFixed(1)},${ay.toFixed(1)} ${mx.toFixed(1)},${ny.toFixed(1)} ${nx.toFixed(1)},${ny.toFixed(1)}`;
}

/** Size of an element, kept current with ResizeObserver. */
function useSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function LanguageCycle() {
  const [i, setI] = useState(1);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const reduce = useReducedMotion();
  const ref = useRef(null);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.4 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (reduce || paused || !inView) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % LANGUAGE_CYCLE.length), 3600);
    return () => clearInterval(t);
  }, [reduce, paused, inView]);
  const cur = LANGUAGE_CYCLE[i];
  return (
    <div ref={ref} className="langcycle" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <p className="langcycle-k">One review, three ways guests write it — one meaning</p>
      <div className="seg seg-light" role="tablist" aria-label="Review language">
        {LANGUAGE_CYCLE.map((l, k) => (
          <button key={l.code} type="button" role="tab" aria-selected={k === i} className={k === i ? 'is-on' : ''} onClick={() => setI(k)}>
            {k === i && <motion.span layoutId="uni-lang" className="seg-pill" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
            <span className="seg-text">{l.label}</span>
          </button>
        ))}
      </div>
      <div className="langcycle-stage" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={cur.code} className="langcycle-text" lang={cur.code === 'hi' ? 'hi' : undefined}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, filter: 'blur(3px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -14, filter: 'blur(3px)' }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
            “{cur.text}”
          </motion.p>
        </AnimatePresence>
        <div className="langcycle-out" aria-label="Detected topics">
          <span className="tag tag-good">Cleanliness · positive</span>
          <span className="tag tag-bad">Hot water · negative</span>
        </div>
      </div>
    </div>
  );
}

export default function ReviewUniverseSection() {
  const ref = useRef(null);
  const compRef = useRef(null);
  const linksRef = useRef(null);
  const size = useSize(compRef);

  useSectionMotion(ref, ({ reduce, isDesktop, root }) => {
    const q = gsap.utils.selector(root);
    enter(q('.uni-head > *'), { from: 'left', trigger: q('.uni-head')[0], stagger: 0.1, reduce, distance: 0.6 });
    enter(q('.platform'), { from: 'bottom', trigger: q('.platforms')[0], stagger: 0.07, reduce, distance: 0.4, duration: 0.8 });
    const comp = q('.uni-comp')[0];
    if (reduce || !isDesktop) {
      q('.rcard').forEach((c) => enter(c, { from: /left|-tl|-bl/.test(c.dataset.from) ? 'left' : 'right', trigger: c, reduce, distance: 0.5 }));
    } else {
      const tl = gsap.timeline({ scrollTrigger: { trigger: comp, start: 'top 72%', once: true }, defaults: { ease: EASE.settle } });
      q('.rcard').forEach((c, i) => {
        const from = c.dataset.from;
        const dx = /left|-tl|-bl/.test(from) ? -1 : 1;
        const dy = /diag-t/.test(from) ? -1 : /diag-b/.test(from) ? 1 : 0;
        tl.from(c, { x: dx * 260, y: dy * 140, rotation: dx * 6, opacity: 0, duration: 1.3 }, i * 0.14);
      });
      tl.from(q('.rcard .tag'), { y: 10, opacity: 0, stagger: 0.05, duration: 0.5 }, 0.9);
      tl.from(q('.tnode'), { scale: 0.6, opacity: 0, stagger: 0.06, duration: 0.7, ease: 'back.out(2)' }, 0.75);
      // Connectors draw themselves (CSS transition on stroke-dashoffset, so they survive resizes).
      tl.call(() => linksRef.current?.classList.add('is-drawn'), null, 1.05);
    }
    if (reduce || !isDesktop) linksRef.current?.classList.add('is-drawn');
    enter(q('.langcycle'), { from: 'right', trigger: q('.langcycle')[0], reduce, distance: 0.7 });
  });

  return (
    <section ref={ref} id="how" tabIndex={-1} className="uni" aria-labelledby="uni-title">
      <Contours className="uni-contours" seed={11} lines={8} color="#1D5746" />
      <div className="wrap">
        <div className="uni-head">
          <p className="eyebrow eyebrow-light">01 — Collect &amp; understand</p>
          <h2 id="uni-title" className="display">Every review tells <em>part</em> of the story.</h2>
          <p className="lede">
            Guests leave their thoughts on half a dozen sites, in English, Hindi and everything in between. We gather them into one place
            and read every line — then tag what each guest was actually talking about.
          </p>
        </div>
        <ul className="platforms" aria-label="Review sources">
          {PLATFORMS.map((p) => (
            <li key={p.name} className={`platform ${p.status === 'planned' ? 'is-planned' : ''}`}>
              <span className="platform-dot" style={{ background: p.hue }} aria-hidden="true" />
              {p.name}
              {p.status === 'planned' && <span className="platform-soon">planned</span>}
            </li>
          ))}
        </ul>

        <div className="uni-comp" ref={compRef}>
          <svg ref={linksRef} className="uni-links" viewBox={`0 0 ${size.w || 1} ${size.h || 1}`} aria-hidden="true" focusable="false">
            {size.w > 0 && REVIEW_SNIPPETS.flatMap((c) => c.topics.map(([t, s], k) => (
              <path key={`${c.id}-${t}`} d={connector(c, t, size.w, size.h)} pathLength="1" className={s > 0 ? 'lk-good' : 'lk-bad'} style={{ transitionDelay: `${(REVIEW_SNIPPETS.indexOf(c) * 2 + k) * 0.08}s` }} />
            )))}
          </svg>
          {TOPIC_NODES.map((n) => (
            <span key={n.id} className="tnode" style={{ left: `${n.x}%`, top: `${n.y}%` }} aria-hidden="true">{n.label}</span>
          ))}
          {REVIEW_SNIPPETS.map((c) => (
            <article key={c.id} className="rcard" data-from={c.from} style={{ '--x': `${c.pos.x}%`, '--y': `${c.pos.y}%`, '--tilt': `${c.tilt}deg` }}>
              <header className="rcard-head">
                <span className="rcard-lang">{c.lang}</span>
                <span className="rcard-src">{c.platform}</span>
              </header>
              <p className="rcard-text" lang={c.lang === 'हिंदी' ? 'hi' : undefined}>“{c.text}”</p>
              <div className="rcard-tags">
                {c.topics.map(([t, s]) => (
                  <span key={t} className={`tag ${s > 0 ? 'tag-good' : 'tag-bad'}`}>{node(t).label} {s > 0 ? '+' : '−'}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
        <div className="uni-foot">
          <LanguageCycle />
          <DemoTag>Example reviews for illustration</DemoTag>
        </div>
      </div>
    </section>
  );
}
