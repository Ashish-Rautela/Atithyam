import { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Badge, MountainPhoto } from '../../../ui/kit.jsx';
import { AipanCorner } from '../../../ui/aipan.jsx';
import { Icon, AspectIcon } from '../../../ui/icons.jsx';
import { gsap, ScrollTrigger, useSectionMotion } from '../motion/motion.js';
import { useSmoothScroll } from '../motion/SmoothScroll.jsx';
import { STORY_STAGES } from '../data/homeDemo.js';
import { CompareBars, DemoNote, Head } from './parts.jsx';

const ASPECT_OF = { food: 'food', clean: 'cleanliness', staff: 'staff', value: 'value' };
const ENTRY = [
  (i) => ({ x: i % 2 ? 140 : -140 }),
  (i) => ({ y: -90, x: 40 - i * 30 }),
  () => ({ scale: 0.8, y: 30 }),
  (i) => ({ x: 160, y: 30 + i * 10 }),
];

/**
 * Signature sequence: pinned on desktop, scrolling moves through four topics of one (fictional)
 * hotel — reviews, comparison with nearby hotels, the insight and a recommendation.
 * Phones and reduced motion get the same content with tabs instead of pinning.
 */
export default function TopicStory() {
  const ref = useRef(null);
  const stRef = useRef(null);
  const stageRef = useRef(0);
  const [stage, setStage] = useState(0);
  const [pinned, setPinned] = useState(false);
  const reduce = useReducedMotion();
  const { scrollTo } = useSmoothScroll();
  const s = STORY_STAGES[stage];

  useSectionMotion(ref, ({ reduce: rm, isDesktop, root }) => {
    if (rm || !isDesktop) {
      setPinned(false);
      return undefined;
    }
    const q = gsap.utils.selector(root);
    const tl = gsap.timeline().fromTo(q('[data-progress]'), { scaleY: 0 }, { scaleY: 1, ease: 'none' });
    stRef.current = ScrollTrigger.create({
      trigger: root,
      start: 'top top',
      end: () => `+=${window.innerHeight * 2.4}`,
      pin: q('[data-pin]')[0],
      scrub: 0.4,
      animation: tl,
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
    return () => { stRef.current = null; };
  });

  const select = (i) => {
    const st = stRef.current;
    if (pinned && st) scrollTo(st.start + ((i + 0.5) / STORY_STAGES.length) * (st.end - st.start), { duration: 1 });
    else {
      stageRef.current = i;
      setStage(i);
    }
  };

  return (
    <section ref={ref} id="story" className="relative bg-pine text-mist" aria-labelledby="story-title">
      <div data-pin className="relative isolate flex min-h-screen items-center overflow-hidden py-20">
        <div className="absolute inset-0 -z-10 opacity-25"><MountainPhoto position="50% 20%" /></div>
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-pine via-pine/85 to-pine" />
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
          <div className="flex flex-col justify-center">
            <div id="story-title">
              <Head light eyebrow="02 · For hotel owners" title="From thousands of reviews to" accent="one clear decision." deva="आपका होटल, आपके पड़ोसी" desc="Each topic is scored for your hotel and for the hotels around you. Where you trail, you see the reviews that explain why and a specific next step." />
            </div>
            <div className="relative mt-8 pl-6">
              <span className="absolute top-1 bottom-1 left-0 w-0.5 rounded bg-white/15"><span data-progress className="block h-full origin-top rounded bg-amber" style={{ transform: pinned ? undefined : `scaleY(${(stage + 1) / STORY_STAGES.length})` }} /></span>
              <ol className="space-y-1" aria-label="Topics">
                {STORY_STAGES.map((t, i) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => select(i)} aria-current={i === stage ? 'step' : undefined} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left text-base font-bold transition ${i === stage ? 'text-white' : 'text-mist/50 hover:text-mist/80'}`}>
                      <span className={`grid size-8 place-items-center rounded-full ${i === stage ? 'bg-amber text-pine' : 'bg-white/10'}`}><AspectIcon aspect={ASPECT_OF[t.id]} className="size-4" /></span>
                      {t.topic}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="relative rounded-[2rem] bg-ivory p-4 text-ink shadow-lift sm:p-6">
            <AipanCorner className="pointer-events-none absolute top-3 left-3 size-12 opacity-20" />
            <AipanCorner className="pointer-events-none absolute right-3 bottom-3 size-12 opacity-20" rotate={180} />
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <p className="flex items-center gap-2 text-sm font-bold text-pine"><Icon name="hotel" className="size-4 text-geru" /> Deodar Heights · Mall Road, Mussoorie</p>
              <Badge tone="muted">vs 5 hotels nearby</Badge>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1.05fr]">
              <div className="min-h-[15rem] space-y-2.5">
                <AnimatePresence mode="popLayout" initial={false}>
                  {s.reviews.map((r, i) => (
                    <motion.article
                      key={`${s.id}-${i}`}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, ...ENTRY[stage](i) }}
                      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, x: -60, transition: { duration: 0.2 } }}
                      transition={{ type: 'spring', stiffness: 130, damping: 20, delay: reduce ? 0 : i * 0.06 }}
                      className={`rounded-2xl border-l-4 bg-white p-3.5 shadow-card ${r.sentiment > 0 ? 'border-good' : 'border-bad'}`}
                    >
                      <p className="text-[0.66rem] font-extrabold tracking-[0.1em] text-slate uppercase">{r.lang} · {r.platform}</p>
                      <p className={`mt-1 text-[0.92rem] ${r.lang === 'हिंदी' ? 'font-deva' : ''}`}>“{r.text}”</p>
                    </motion.article>
                  ))}
                </AnimatePresence>
              </div>
              <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
                <p className="mb-3 text-sm font-bold text-pine">{s.topic} — guest sentiment <span className="font-medium text-slate">(0–100)</span></p>
                <CompareBars rows={s.bars} />
                <p className="mt-3 text-xs text-slate">{s.mentions} mentions · {s.source}</p>
              </div>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={s.id}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 20, clipPath: 'inset(0 0 100% 0 round 20px)' }}
                animate={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0 round 20px)' }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className={`mt-4 rounded-[1.25rem] p-5 text-mist ${s.tone === 'advantage' ? 'bg-forest' : 'bg-geru'}`}
              >
                <p className="eyebrow text-amber">{s.tone === 'advantage' ? '▲ Competitive advantage' : '● Needs attention'}</p>
                <p className="mt-1 font-serif text-2xl leading-snug text-white">{s.insight}</p>
                <p className="mt-2 text-sm text-mist/90"><strong className="text-white">Next step:</strong> {s.recommendation}</p>
                <p className="mt-2 text-sm italic text-glacier">“{s.quote.text}” — {s.quote.source}</p>
              </motion.div>
            </AnimatePresence>
            <DemoNote>Illustrative demo · fictional hotel</DemoNote>
          </div>
        </div>
      </div>
    </section>
  );
}
