import { useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { RidgeDivider } from '../components/Landscape.jsx';
import { ComparisonBars, DemoTag, Arrow } from '../components/ui.jsx';
import { gsap, ScrollTrigger, useSectionMotion, enter } from '../motion/motion.js';
import { useSmoothScroll } from '../motion/SmoothScroll.jsx';
import { STORY_STAGES } from '../data/homeDemo.js';

/** Each stage brings its review cards in along a different path. */
const TRAJECTORIES = [
  (i) => ({ x: i % 2 ? 160 : -160, y: 0, rotate: i % 2 ? 4 : -4 }), // food: from opposite sides
  (i) => ({ x: 60 - i * 40, y: -120, rotate: -3 }), // cleanliness: falls in diagonally from above
  (i) => ({ x: 0, y: 40, scale: 0.7, rotate: 0 }), // staff: accumulates around the topic
  (i) => ({ x: 200, y: 60 + i * 20, rotate: 3 }), // value: sweeps in from the right
];

function StoryPanel({ stage, onSelect }) {
  const reduce = useReducedMotion();
  const s = STORY_STAGES[stage];
  const traj = TRAJECTORIES[stage];
  return (
    <div className="story-panel" aria-live="polite">
      <div className="story-tabs" role="tablist" aria-label="Topics in the story">
        <LayoutGroup id="story-tabs">
          {STORY_STAGES.map((t, i) => (
            <button key={t.id} type="button" role="tab" aria-selected={i === stage} className={i === stage ? 'is-on' : ''} onClick={() => onSelect(i)}>
              {i === stage && <motion.span layoutId="story-tab" className="story-tab-pill" transition={{ type: 'spring', stiffness: 320, damping: 30 }} />}
              <span className="story-tab-text">{t.topic}</span>
            </button>
          ))}
        </LayoutGroup>
      </div>

      <div className="story-body">
        <div className="story-reviews">
          <AnimatePresence mode="popLayout" initial={false}>
            {s.reviews.map((r, i) => (
              <motion.article
                key={`${s.id}-${i}`}
                className={`story-review ${r.sentiment > 0 ? 'is-pos' : 'is-neg'}`}
                initial={reduce ? { opacity: 0 } : { opacity: 0, ...traj(i) }}
                animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: stage % 2 ? -80 : 80, scale: 0.94, transition: { duration: 0.25 } }}
                transition={{ type: 'spring', stiffness: 120, damping: 20, delay: reduce ? 0 : 0.06 * i }}
              >
                <span className="story-review-meta">{r.lang} · {r.platform}</span>
                <p lang={r.lang === 'हिंदी' ? 'hi' : undefined}>“{r.text}”</p>
                <span className={`tag ${r.sentiment > 0 ? 'tag-good' : 'tag-bad'}`}>{r.sentiment > 0 ? 'Praise' : 'Complaint'}</span>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>

        <div className="story-chart">
          <p className="story-chart-title">
            {s.topic} — guest sentiment <span className="muted">(0–100, 50 = balanced)</span>
          </p>
          <ComparisonBars rows={s.bars} caption={`${s.mentions} mentions analysed · ${s.source}`} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.blockquote
              key={s.id}
              className="story-quote"
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.4, delay: reduce ? 0 : 0.15 }}
            >
              “{s.quote.text}”<cite>{s.quote.source}</cite>
            </motion.blockquote>
          </AnimatePresence>
          {/* Thread from the evidence down to the insight it supports. */}
          <svg className="story-thread" viewBox="0 0 40 46" aria-hidden="true" focusable="false">
            <motion.path key={s.id} d="M20 0 C 20 18, 6 22, 20 46" fill="none" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, delay: reduce ? 0 : 0.2, ease: [0.65, 0, 0.35, 1] }} />
          </svg>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={s.id}
            className={`story-insight tone-${s.tone}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 26, clipPath: 'inset(0 0 100% 0 round 18px)' }}
            animate={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0 round 18px)' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -16 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="story-insight-k">{s.tone === 'advantage' ? '▲ Competitive advantage' : '● Needs attention'}</p>
            <p className="story-insight-text">{s.insight}</p>
            <p className="story-rec"><strong>Recommendation:</strong> {s.recommendation}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <DemoTag>Illustrative demo · fictional hotel</DemoTag>
    </div>
  );
}

export default function PinnedInsightsSection() {
  const ref = useRef(null);
  const stRef = useRef(null);
  const stageRef = useRef(0);
  const [stage, setStage] = useState(0);
  const [pinned, setPinned] = useState(false);
  const { scrollTo } = useSmoothScroll();

  useSectionMotion(ref, ({ reduce, isDesktop, root }) => {
    const q = gsap.utils.selector(root);
    enter(q('.story-copy > *'), { from: 'left', trigger: root, start: 'top 70%', stagger: 0.1, reduce, distance: 0.6 });
    enter(q('.story-panel'), { from: 'depth', trigger: root, start: 'top 70%', reduce, duration: 1.3 });
    if (reduce || !isDesktop) {
      setPinned(false);
      return undefined;
    }
    // Signature sequence: pin the composition for three screens; scroll progress picks the topic.
    const progress = gsap.timeline().fromTo(q('.story-progress-fill'), { scaleY: 0 }, { scaleY: 1, ease: 'none' });
    stRef.current = ScrollTrigger.create({
      trigger: root,
      start: 'top top',
      end: () => `+=${window.innerHeight * 2.6}`,
      pin: q('.story-pin')[0],
      scrub: 0.4,
      animation: progress,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        const i = Math.min(STORY_STAGES.length - 1, Math.floor(self.progress * STORY_STAGES.length * 0.999));
        if (i !== stageRef.current) {
          stageRef.current = i;
          setStage(i);
        }
      },
    });
    setPinned(true);
    return () => {
      stRef.current = null;
    };
  });

  const select = (i) => {
    const st = stRef.current;
    if (pinned && st) {
      scrollTo(st.start + ((i + 0.5) / STORY_STAGES.length) * (st.end - st.start), { duration: 1.1 });
    } else {
      stageRef.current = i;
      setStage(i);
    }
  };

  return (
    <section ref={ref} id="story" className="story" aria-labelledby="story-title">
      <RidgeDivider fill="#102F29" seed={9} className="story-divider" />
      <div className="story-pin">
        <div className="wrap story-grid">
          <div className="story-copy">
            <p className="eyebrow eyebrow-dark">02 — From noise to a decision</p>
            <h2 id="story-title" className="display display-light">
              From thousands of reviews to <em>one clear</em> decision.
            </h2>
            <p className="lede lede-light">
              Each topic is scored for your hotel and for the hotels around you. Where you trail, you get the reviews that explain why and a
              specific next step. Where you lead, you know what to protect.
            </p>
            <div className="story-steps-wrap">
            <span className="story-progress" aria-hidden="true"><span className="story-progress-fill" /></span>
            <ol className="story-steps" aria-label="Topics">
              {STORY_STAGES.map((t, i) => (
                <li key={t.id} className={i === stage ? 'is-on' : i < stage ? 'is-done' : ''}>
                  <button type="button" onClick={() => select(i)} aria-current={i === stage ? 'step' : undefined}>
                    <span className="story-step-n">{String(i + 1).padStart(2, '0')}</span> {t.topic}
                  </button>
                </li>
              ))}
            </ol>
            </div>
            {!pinned && (
              <div className="story-stepper">
                <button type="button" className="icon-btn" onClick={() => select(Math.max(0, stage - 1))} disabled={stage === 0} aria-label="Previous topic">
                  <Arrow dir="left" />
                </button>
                <span>{stage + 1} / {STORY_STAGES.length}</span>
                <button type="button" className="icon-btn" onClick={() => select(Math.min(STORY_STAGES.length - 1, stage + 1))} disabled={stage === STORY_STAGES.length - 1} aria-label="Next topic">
                  <Arrow />
                </button>
              </div>
            )}
          </div>
          <StoryPanel stage={stage} onSelect={select} />
        </div>
      </div>
    </section>
  );
}
