import { motion, useReducedMotion } from 'framer-motion';
import { AipanRule } from '../../../ui/aipan.jsx';
import { cx } from '../../../ui/kit.jsx';

const OFFSETS = {
  up: { y: 36 },
  down: { y: -36 },
  left: { x: -60 },
  right: { x: 60 },
  'up-left': { x: -48, y: 36, rotate: -1.5 },
  'up-right': { x: 48, y: 36, rotate: 1.5 },
  scale: { scale: 0.92, y: 20 },
};

/** Scroll-into-view entrance from a direction (once). Reduced motion → a short fade. */
export function Reveal({ from = 'up', delay = 0, className, children, as = 'div', amount = 0.25 }) {
  const reduce = useReducedMotion();
  const Tag = motion[as] ?? motion.div;
  return (
    <Tag
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, ...OFFSETS[from] }}
      whileInView={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
      viewport={{ once: true, amount }}
      transition={reduce ? { duration: 0.3 } : { duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Tag>
  );
}

/** Section heading: Aipan rule + eyebrow, serif title (with an italic accent), optional Hindi line. */
export function Head({ eyebrow, title, accent, deva, desc, light = false, center = false, className }) {
  return (
    <div className={cx(center && 'mx-auto text-center', 'max-w-3xl', className)}>
      <Reveal from="up">
        <p className={cx('eyebrow mb-3 flex items-center gap-3', center && 'justify-center', light ? 'text-amber' : 'text-geru')}>
          <AipanRule className="h-2.5 w-16" color={light ? '#e8a15a' : '#8e1b1b'} />
          {eyebrow}
        </p>
      </Reveal>
      <Reveal from="up" delay={0.06}>
        <h2 className={cx('font-serif text-[2.1rem] leading-[1.05] font-medium tracking-tight sm:text-5xl lg:text-[3.4rem]', light ? 'text-white' : 'text-pine')}>
          {title} {accent && <em className={cx('font-normal', light ? 'text-glacier' : 'text-forest')}>{accent}</em>}
        </h2>
      </Reveal>
      {deva && (
        <Reveal from="up" delay={0.1}>
          <p className={cx('mt-3 font-deva text-xl', light ? 'text-amber' : 'text-geru')} lang="hi">{deva}</p>
        </Reveal>
      )}
      {desc && (
        <Reveal from="up" delay={0.12}>
          <p className={cx('mt-4 text-base sm:text-lg', light ? 'text-mist/80' : 'text-slate')}>{desc}</p>
        </Reveal>
      )}
    </div>
  );
}

/** Horizontal comparison bars (0–100): your hotel (forest) vs competitors (slate blue), direct-labelled. */
export function CompareBars({ rows, max = 100, dark = false }) {
  const reduce = useReducedMotion();
  return (
    <div>
      <div className={cx('mb-3 flex gap-4 text-xs font-semibold', dark ? 'text-mist/70' : 'text-slate')}>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-you" /> Your hotel</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-market" /> Competitors</span>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[minmax(90px,34%)_1fr_2.4rem] items-center gap-3 text-sm">
            <span className={cx('truncate', r.you ? 'font-bold' : '', dark ? 'text-mist' : 'text-ink')}>{r.label}</span>
            <span className={cx('relative h-3 overflow-hidden rounded', dark ? 'bg-white/10' : 'bg-parchment')} title={`${r.label}: ${r.value}`}>
              <motion.span
                className={cx('absolute inset-0 origin-left rounded', r.you ? 'bg-you' : 'bg-market')}
                initial={false}
                animate={{ scaleX: Math.max(0.02, r.value / max) }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 20 }}
              />
            </span>
            <span className={cx('num text-right font-bold', dark ? 'text-white' : 'text-pine')}>{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const DemoNote = ({ children = 'Illustrative demo · fictional hotels', light = false }) => (
  <p className={cx('mt-4 inline-flex items-center gap-2 text-[0.7rem] font-extrabold tracking-[0.12em] uppercase', light ? 'text-glacier/80' : 'text-slate')}>
    <i className="size-1.5 rounded-full bg-amber" /> {children}
  </p>
);
