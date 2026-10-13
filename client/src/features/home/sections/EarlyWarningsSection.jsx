import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Landscape, { RidgeDivider } from '../components/Landscape.jsx';
import { DemoTag } from '../components/ui.jsx';
import { gsap, useSectionMotion, enter, parallax, draw } from '../motion/motion.js';
import { ALERTS, SEVERITY } from '../data/homeDemo.js';

const WEEKS = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7'];

function Sparkline({ values }) {
  const max = Math.max(2, ...values);
  const pts = values.map((v, i) => [10 + i * 46, 70 - (v / max) * 52]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  return (
    <svg className="spark" viewBox="0 0 300 92" role="img" aria-label={`Mentions per week: ${values.join(', ')}`}>
      <line x1="10" y1="70" x2="286" y2="70" className="spark-base" />
      <motion.path d={d} className="spark-line" initial={false} animate={{ d }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
      {pts.map(([x, y], i) => (
        <motion.circle key={i} r="4.5" className="spark-dot" initial={false} animate={{ cx: x, cy: y }} transition={{ duration: 0.6 }} />
      ))}
      {WEEKS.map((w, i) => <text key={w} x={10 + i * 46} y="88" className="spark-label">{w}</text>)}
    </svg>
  );
}

function EvidenceModal({ alert, onClose }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <motion.div className="modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ev-title"
        tabIndex={-1}
        data-lenis-prevent
        className="modal"
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 220, damping: 26 }}
      >
        <p className={`sev sev-${SEVERITY[alert.severity].tone}`}>{SEVERITY[alert.severity].label} · {alert.topic}</p>
        <h3 id="ev-title" className="modal-title">{alert.title}</h3>
        <p className="muted-k">{alert.count} supporting reviews · {alert.period}</p>
        <ul className="ev-list">
          {alert.evidence.map((e) => (
            <li key={e.date + e.text}>
              <span className="ev-meta">{e.date} · {e.platform}</span>
              <span>“{e.text}”</span>
            </li>
          ))}
        </ul>
        <DemoTag>Sample alert — not a real detection</DemoTag>
        <button type="button" className="cta cta-primary cta-small modal-close" onClick={onClose}>Close</button>
      </motion.div>
    </motion.div>
  );
}

export default function EarlyWarningsSection() {
  const ref = useRef(null);
  const [active, setActive] = useState(0);
  const [modal, setModal] = useState(null);
  const reduce = useReducedMotion();
  const closeModal = useCallback(() => setModal(null), []);

  useSectionMotion(ref, ({ reduce: rm, isDesktop, root }) => {
    const q = gsap.utils.selector(root);
    if (!rm) parallax(root, { trigger: root, distance: isDesktop ? 200 : 80 });
    enter(q('.warn-copy > *'), { from: 'bottom', trigger: q('.warn-copy')[0], stagger: 0.1, reduce: rm, distance: 0.6 });
    // Alerts arrive on tangents from different sides, then stack.
    const sides = [{ x: 240, y: -60, rotate: 6 }, { x: -200, y: 80, rotate: -5 }, { x: 160, y: 160, rotate: 4 }];
    q('.alert-slot').forEach((el, i) => {
      if (rm) gsap.from(el, { opacity: 0, duration: 0.3, scrollTrigger: { trigger: q('.alerts')[0], start: 'top 80%', once: true } });
      else gsap.from(el, { ...sides[i], opacity: 0, duration: 1.3, delay: i * 0.15, ease: 'expo.out', scrollTrigger: { trigger: q('.alerts')[0], start: 'top 78%', once: true } });
    });
    draw(q('.warn-timeline-path'), { trigger: q('.warn-timeline')[0], start: 'top 85%', end: 'bottom 45%', scrub: true, reduce: rm });
  });

  const a = ALERTS[active];
  return (
    <section ref={ref} className="warn" aria-labelledby="warn-title">
      <RidgeDivider fill="#102F29" seed={31} className="warn-divider" />
      <Landscape variant="forest" label="Illustration: misty pine forest and dark ridges at dusk" className="warn-bg" />
      <div className="warn-shade" aria-hidden="true" />
      <div className="wrap warn-grid">
        <div className="warn-copy">
          <p className="eyebrow eyebrow-dark">04 — Early warnings</p>
          <h2 id="warn-title" className="display display-light">Catch problems <em>before</em> they become bad reviews.</h2>
          <p className="lede lede-light">
            A handful of guests mentioning the same thing is a signal. We compare the last few weeks with the months before, so a new problem
            shows up while it is still small — with the reviews that prove it.
          </p>
          <div className="warn-timeline">
            <svg className="warn-timeline-deco" viewBox="0 0 400 40" aria-hidden="true" focusable="false">
              <path className="warn-timeline-path" d="M2 30 C 80 30, 110 8, 180 12 S 300 34, 398 10" />
            </svg>
            <p className="warn-timeline-k">Weekly mentions — {a.topic}</p>
            <Sparkline values={a.timeline} />
          </div>
        </div>

        <div className="alerts" role="list" aria-label="Example alerts">
          {ALERTS.map((al, i) => {
            const order = (i - active + ALERTS.length) % ALERTS.length;
            const sev = SEVERITY[al.severity];
            return (
              <div key={al.id} className="alert-slot" role="listitem" style={{ zIndex: ALERTS.length - order }}>
                <motion.div
                  className={`alert ${order === 0 ? 'is-active' : ''}`}
                  initial={false}
                  animate={{ y: order * -30, x: order * 26, scale: 1 - order * 0.05 }}
                  transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 170, damping: 24 }}
                >
                  <button type="button" className="alert-select" aria-pressed={order === 0} onClick={() => setActive(i)}>
                    <span className="alert-top">
                      <span className={`sev sev-${sev.tone}`}>
                        <motion.span key={order === 0 ? `on-${al.id}` : al.id} className="sev-dot" initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 12 }} aria-hidden="true" />
                        {sev.label}
                      </span>
                      <span className="alert-topic">{al.topic}</span>
                    </span>
                    <span className="alert-title">{al.title}</span>
                    <span className="alert-meta">{al.count} supporting reviews · {al.period}</span>
                  </button>
                  <AnimatePresence initial={false}>
                    {order === 0 && (
                      <motion.div className="alert-more" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduce ? 0 : 0.35 }}>
                        <ul className="alert-ev">
                          {al.evidence.slice(0, 2).map((e) => (
                            <li key={e.date}><span className="ev-meta">{e.date} · {e.platform}</span> “{e.text}”</li>
                          ))}
                        </ul>
                        <button type="button" className="alert-btn" onClick={() => setModal(al)}>
                          View evidence <span aria-hidden="true">→</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>
            );
          })}
        </div>
        <DemoTag>Sample alerts · not real detections</DemoTag>
      </div>
      {/* Portal to the page root so the dialog sits above the fixed navigation. */}
      {createPortal(<AnimatePresence>{modal && <EvidenceModal alert={modal} onClose={closeModal} />}</AnimatePresence>, document.querySelector('.hm') ?? document.body)}
    </section>
  );
}
