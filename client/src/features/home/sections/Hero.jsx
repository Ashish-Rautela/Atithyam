import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { MountainPhoto, Badge } from '../../../ui/kit.jsx';
import { AipanBorder, AipanMandala } from '../../../ui/aipan.jsx';
import { Icon, AspectIcon } from '../../../ui/icons.jsx';
import { useSmoothScroll } from '../motion/SmoothScroll.jsx';

const rise = (delay, reduce, extra = {}) => ({
  initial: reduce ? { opacity: 0 } : { opacity: 0, y: 26, ...extra },
  animate: { opacity: 1, y: 0, x: 0, rotate: 0 },
  transition: reduce ? { duration: 0.3 } : { duration: 1, delay, ease: [0.22, 1, 0.36, 1] },
});

/** Guest-book entry card floating over the photo (illustrative). */
function GuestCard({ reduce }) {
  return (
    <motion.figure {...rise(0.9, reduce, { x: 60, rotate: 2 })} className="relative w-full max-w-sm rounded-3xl bg-rice/95 p-5 shadow-lift ring-1 ring-white/60 backdrop-blur">
      <div className="flex items-center justify-between text-[0.7rem] font-extrabold tracking-[0.12em] text-slate uppercase">
        <span className="inline-flex items-center gap-1.5 text-geru"><Icon name="quote" className="size-4" /> Guest book · Hinglish</span>
        <span>MakeMyTrip</span>
      </div>
      <blockquote className="mt-3 font-serif text-xl leading-snug text-pine">“Room saaf tha, but hot water ki problem thi.”</blockquote>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone="good"><AspectIcon aspect="cleanliness" className="size-3.5" /> Cleanliness +</Badge>
        <Badge tone="bad"><AspectIcon aspect="room" className="size-3.5" /> Hot water −</Badge>
      </div>
      <figcaption className="mt-3 text-xs text-slate">Read and tagged automatically — English, हिंदी or Hinglish.</figcaption>
    </motion.figure>
  );
}

/** Room-key tag showing a hotel's rank in its micro-market (illustrative). */
function KeyCard({ reduce }) {
  return (
    <motion.div {...rise(1.1, reduce, { x: 80, rotate: -3 })} className="relative w-64 rounded-[1.6rem] bg-geru p-5 pt-7 text-rice shadow-lift">
      <span aria-hidden="true" className="absolute top-4 right-5 size-4 rounded-full bg-pine/50 ring-2 ring-rice/50" />
      <span aria-hidden="true" className="absolute -top-6 right-[1.7rem] h-10 w-px bg-rice/60" />
      <p className="eyebrow text-amber">Room 204 · Mall Road</p>
      <p className="mt-2 font-serif text-[2.6rem] leading-none">#2 <span className="text-xl text-rice/80">of 6</span></p>
      <p className="mt-2 text-sm text-rice/85">for staff &amp; service among the hotels next door</p>
      <AipanMandala className="pointer-events-none absolute -right-8 -bottom-10 size-32 opacity-25" bg={null} />
    </motion.div>
  );
}

export default function Hero() {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const { scrollTo } = useSmoothScroll();
  const [name, setName] = useState('');
  const { scrollY } = useScroll();
  const photoY = useTransform(scrollY, [0, 900], [0, reduce ? 0 : 140]);
  const photoScale = useTransform(scrollY, [0, 900], [1.06, reduce ? 1.06 : 1.14]);

  const submit = (e) => {
    e.preventDefault();
    navigate(name.trim() ? `/search?name=${encodeURIComponent(name.trim())}` : '/search');
  };

  return (
    <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-pine" aria-labelledby="hero-title">
      <motion.div className="absolute inset-0 -z-10" style={{ y: photoY, scale: photoScale }}>
        <MountainPhoto priority position="50% 28%" alt="" />
      </motion.div>
      <div className="absolute inset-0 -z-10 bg-linear-to-b from-sky-deep/45 via-transparent to-pine" />
      <div className="absolute inset-0 -z-10 bg-linear-to-r from-pine/80 via-pine/30 to-transparent" />

      <div className="mx-auto grid w-full max-w-7xl flex-1 items-end gap-10 px-4 pt-32 pb-24 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:pb-28">
        <div>
          <motion.p {...rise(0.15, reduce)} className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-deva text-2xl text-amber" lang="hi">अतिथि देवो भव</span>
            <span className="eyebrow text-glacier">The guest is god · review intelligence for Uttarakhand</span>
          </motion.p>
          <h1 id="hero-title" className="text-shadow-soft font-serif text-[2.6rem] leading-[1.02] font-medium tracking-tight text-white sm:text-6xl lg:text-[4.6rem]">
            {['Every guest review', 'across the hills,', 'read and compared.'].map((l, i) => (
              <span key={l} className="block overflow-hidden pb-1">
                <motion.span
                  className={i === 1 ? 'block italic text-glacier' : 'block'}
                  initial={reduce ? { opacity: 0 } : { y: '110%' }}
                  animate={reduce ? { opacity: 1 } : { y: 0 }}
                  transition={{ duration: 1.1, delay: 0.3 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                >
                  {l}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.p {...rise(0.75, reduce)} className="text-shadow-soft mt-5 max-w-xl text-lg text-white/85">
            For the hotels, homestays and resorts of Uttarakhand — every review from every platform, understood in English, हिंदी and Hinglish,
            and compared with the hotels your guests actually choose between.
          </motion.p>

          <motion.form {...rise(0.9, reduce)} onSubmit={submit} className="mt-8 flex max-w-xl flex-col gap-2 rounded-[1.75rem] bg-white/95 p-2 shadow-lift ring-1 ring-white/50 backdrop-blur sm:flex-row sm:items-center sm:rounded-full" role="search">
            <label htmlFor="hero-hotel" className="sr-only">Your hotel’s name</label>
            <span className="hidden pl-3 text-forest sm:block"><Icon name="hotel" className="size-5" /></span>
            <input
              id="hero-hotel"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your hotel’s name — e.g. a homestay in Landour"
              className="min-h-12 flex-1 rounded-full bg-transparent px-4 text-base text-ink outline-none placeholder:text-slate/70 sm:px-2"
              autoComplete="organization"
            />
            <button type="submit" className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-geru px-6 font-bold text-rice transition hover:bg-geru-600">
              <Icon name="key" className="size-4.5" /> Check in your hotel
              <Icon name="arrowRight" className="size-4 transition group-hover:translate-x-0.5" />
            </button>
          </motion.form>
          <motion.div {...rise(1.05, reduce)} className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/80">
            <button type="button" onClick={() => scrollTo('#destinations', { offset: -80 })} className="inline-flex min-h-10 items-center gap-2 font-bold text-white underline decoration-amber decoration-2 underline-offset-4 hover:decoration-white">
              <Icon name="map" className="size-4" /> I run a tourism board
            </button>
            <span className="inline-flex items-center gap-2"><Icon name="language" className="size-4 text-amber" /> English · हिंदी · Hinglish</span>
            <span className="inline-flex items-center gap-2"><Icon name="layers" className="size-4 text-amber" /> Google · Booking.com · MakeMyTrip · Agoda · Tripadvisor</span>
          </motion.div>
        </div>

        <div className="relative hidden flex-col items-end gap-5 lg:flex">
          <KeyCard reduce={reduce} />
          <GuestCard reduce={reduce} />
          <p className="text-xs font-semibold text-white/60">Illustrative examples</p>
        </div>
      </div>

      <div className="relative">
        <AipanBorder height={26} />
      </div>
    </section>
  );
}
