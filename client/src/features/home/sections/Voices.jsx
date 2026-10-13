import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Badge, Segmented } from '../../../ui/kit.jsx';
import { AipanMandala, Vasudhara } from '../../../ui/aipan.jsx';
import { Icon } from '../../../ui/icons.jsx';
import { PLATFORMS, REVIEW_SNIPPETS, TOPIC_NODES, LANGUAGE_CYCLE } from '../data/homeDemo.js';
import { Head, Reveal, DemoNote } from './parts.jsx';

const topicLabel = (id) => TOPIC_NODES.find((n) => n.id === id)?.label ?? id;

/** The guest book: reviews from every platform and language, each tagged by topic. */
export default function Voices() {
  const reduce = useReducedMotion();
  const [lang, setLang] = useState('hinglish');
  const [auto, setAuto] = useState(true);
  const ref = useRef(null);
  useEffect(() => {
    if (reduce || !auto) return undefined;
    let visible = false;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.3 });
    if (ref.current) io.observe(ref.current);
    const t = setInterval(() => {
      if (visible) setLang((l) => LANGUAGE_CYCLE[(LANGUAGE_CYCLE.findIndex((x) => x.code === l) + 1) % LANGUAGE_CYCLE.length].code);
    }, 3800);
    return () => { clearInterval(t); io.disconnect(); };
  }, [reduce, auto]);
  const cur = LANGUAGE_CYCLE.find((l) => l.code === lang);

  return (
    <section id="how" className="relative overflow-hidden bg-parchment/50 py-20 sm:py-28" aria-labelledby="voices-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div id="voices-title">
          <Head eyebrow="01 · The guest book" title="Every review tells" accent="part of the story." desc="Guests write on half a dozen sites, in English, Hindi and everything in between. We gather them into one guest book and tag what each guest was actually talking about." />
        </div>

        <Reveal from="up" className="mt-8 flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <span key={p.name} className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-bold ${p.status === 'planned' ? 'border border-dashed border-pine/25 text-slate' : 'bg-white text-pine shadow-card ring-1 ring-line'}`}>
              <i className="size-2.5 rounded-full" style={{ background: p.hue }} /> {p.name}
              {p.status === 'planned' && <span className="text-[0.66rem] tracking-wider text-amber-ink uppercase">planned</span>}
            </span>
          ))}
        </Reveal>

        {/* An open guest book: languages on the left page, tagged entries on the right. */}
        <div ref={ref} className="relative mt-12 grid overflow-hidden rounded-[2rem] bg-rice shadow-lift ring-1 ring-line lg:grid-cols-2">
          <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-8 -translate-x-1/2 bg-linear-to-r from-transparent via-pine/8 to-transparent lg:block" />
          <div className="relative border-b border-line p-6 sm:p-10 lg:border-r lg:border-b-0">
            <div className="absolute inset-y-0 left-0 w-2.5"><Vasudhara vertical className="h-full w-full" /></div>
            <p className="eyebrow flex items-center gap-2 text-geru"><Icon name="language" className="size-4" /> One review, three ways guests write it</p>
            <div className="mt-4" onPointerDown={() => setAuto(false)}>
              <Segmented id="voice-lang" ariaLabel="Language" size="sm" value={lang} onChange={(v) => { setAuto(false); setLang(v); }} options={LANGUAGE_CYCLE.map((l) => ({ value: l.code, label: l.label }))} />
            </div>
            <div className="mt-6 min-h-[9rem]" aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                <motion.blockquote
                  key={cur.code}
                  lang={cur.code === 'hi' ? 'hi' : undefined}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -14 }}
                  transition={{ duration: 0.4 }}
                  className={`text-pine ${cur.code === 'hi' ? 'font-deva text-3xl leading-snug' : 'font-serif text-3xl leading-tight'}`}
                >
                  “{cur.text}”
                </motion.blockquote>
              </AnimatePresence>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate">Read as →</span>
              <Badge tone="good" icon="sparkle">Cleanliness · positive</Badge>
              <Badge tone="bad" icon="bed">Hot water · negative</Badge>
            </div>
            <AipanMandala className="pointer-events-none absolute right-6 bottom-6 size-24 opacity-15" detail="simple" />
          </div>
          <ul className="divide-y divide-line p-2 sm:p-4">
            {REVIEW_SNIPPETS.map((c, i) => (
              <Reveal as="li" key={c.id} from={i % 2 ? 'right' : 'up-right'} delay={i * 0.08} className="rounded-2xl p-4 transition hover:bg-mist/50 sm:p-5">
                <div className="flex items-center justify-between text-[0.7rem] font-extrabold tracking-[0.1em] uppercase">
                  <span className="text-amber-ink">{c.lang}</span>
                  <span className="text-slate">{c.platform}</span>
                </div>
                <p className={`mt-1.5 text-lg leading-snug text-pine ${c.lang === 'हिंदी' ? 'font-deva' : 'font-serif'}`} lang={c.lang === 'हिंदी' ? 'hi' : undefined}>“{c.text}”</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.topics.map(([t, s]) => <Badge key={t} tone={s > 0 ? 'good' : 'bad'}>{topicLabel(t)} {s > 0 ? '+' : '−'}</Badge>)}
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
        <DemoNote>Example reviews for illustration</DemoNote>
      </div>
    </section>
  );
}
