import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Icon } from './icons.jsx';
import { AipanCorner, AipanBorder, AipanRule, AipanMandala } from './aipan.jsx';

const cx = (...c) => c.filter(Boolean).join(' ');
export { cx };

/* ------------------------------------------------------------------ photo */

/** The Himalaya photograph, responsive (webp sizes + jpg fallback), cropped with object-position. */
// Background photo of the Garhwal Himalaya, served from Cloudinary in the best format and size for
// each screen (AVIF/WebP, phone crops). To use another photo, upload it to Cloudinary and change
// PHOTO_ID, or point PHOTO_BASE at another Cloudinary account.
const PHOTO_BASE = 'https://res.cloudinary.com/dkjtln5qa/image/upload';
const PHOTO_ID = 'atithyam/himalaya-hero.jpg';
const photo = (t) => `${PHOTO_BASE}/${t}/${PHOTO_ID}`;
const WIDE = [800, 1280, 1920, 2560].map((w) => `${photo(`f_auto,q_auto:good,c_limit,w_${w}`)} ${w}w`).join(', ');
const TALL = [600, 900, 1200].map((w) => `${photo(`f_auto,q_auto:good,c_fill,g_auto,ar_3:4,w_${w}`)} ${w}w`).join(', ');

export function MountainPhoto({ className = '', position = '50% 40%', alt = '', priority = false }) {
  return (
    <picture>
      <source media="(max-width: 640px)" srcSet={TALL} sizes="100vw" />
      <source srcSet={WIDE} sizes="100vw" />
      <img
        src={photo('f_auto,q_auto:good,c_limit,w_1920')}
        alt={alt}
        className={cx('h-full w-full object-cover', className)}
        style={{ objectPosition: position }}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        width="2560"
        height="1440"
      />
    </picture>
  );
}

/* ------------------------------------------------------------------ buttons */

const BTN = {
  base: 'group inline-flex items-center justify-center gap-2 rounded-full font-bold transition duration-200 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap',
  size: { sm: 'min-h-9 px-3.5 text-[0.82rem]', md: 'min-h-11 px-5 text-[0.92rem]', lg: 'min-h-13 px-7 text-base' },
  variant: {
    primary: 'bg-forest text-white shadow-[0_12px_24px_-14px_rgb(16_47_41/0.9)] hover:bg-pine hover:-translate-y-px',
    geru: 'bg-geru text-rice shadow-[0_12px_24px_-14px_rgb(142_27_27/0.9)] hover:bg-geru-600 hover:-translate-y-px',
    light: 'bg-rice text-pine shadow-[0_10px_24px_-14px_rgb(0_0_0/0.6)] hover:bg-white hover:-translate-y-px',
    glass: 'bg-white/15 text-white ring-1 ring-white/40 backdrop-blur-md hover:bg-white/25',
    ghost: 'bg-white text-pine ring-1 ring-line hover:ring-forest/50',
    subtle: 'bg-transparent text-forest hover:bg-forest/8',
  },
};

/** Button or link. `to` → router link, `href` → anchor, otherwise a button. `icon` = trailing icon name. */
export function Button({ to, href, variant = 'primary', size = 'md', icon, iconLeft, className, children, ...rest }) {
  const cls = cx(BTN.base, BTN.size[size], BTN.variant[variant], className);
  const inner = (
    <>
      {iconLeft && <Icon name={iconLeft} className="size-4.5" />}
      <span>{children}</span>
      {icon && <Icon name={icon} className="size-4.5 transition-transform duration-300 group-hover:translate-x-0.5" />}
    </>
  );
  if (to) return <Link to={to} className={cls} {...rest}>{inner}</Link>;
  if (href) return <a href={href} className={cls} {...rest}>{inner}</a>;
  return <button type="button" className={cls} {...rest}>{inner}</button>;
}

/* ------------------------------------------------------------------ surfaces */

/** White card. `ornament` adds Aipan corners; `tone="pine"` for dark emphasis cards. */
export function Card({ as: Tag = 'section', className, children, ornament = false, tone = 'white', ...rest }) {
  const tones = {
    white: 'bg-white ring-1 ring-line shadow-card',
    pine: 'bg-pine text-mist shadow-lift',
    forest: 'bg-forest text-mist shadow-lift',
    parchment: 'bg-parchment/60 ring-1 ring-line',
    geru: 'bg-geru text-rice shadow-lift',
  };
  return (
    <Tag className={cx('relative rounded-3xl p-5 sm:p-6', tones[tone], className)} {...rest}>
      {ornament && (
        <>
          <AipanCorner className="pointer-events-none absolute top-2 left-2 size-10 opacity-25" color={tone === 'white' ? '#8e1b1b' : '#fffdf7'} />
          <AipanCorner className="pointer-events-none absolute right-2 bottom-2 size-10 opacity-25" color={tone === 'white' ? '#8e1b1b' : '#fffdf7'} rotate={180} />
        </>
      )}
      {children}
    </Tag>
  );
}

/** Card header: optional icon, title, description and actions on the right. */
export function CardHeader({ title, icon, desc, actions, className, as: H = 'h2' }) {
  return (
    <div className={cx('mb-4 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-mist text-forest">
            <Icon name={icon} className="size-5" />
          </span>
        )}
        <div className="min-w-0">
          <H className="font-serif text-xl leading-tight font-medium text-pine sm:text-[1.4rem]">{title}</H>
          {desc && <p className="mt-1 max-w-[70ch] text-sm text-slate">{desc}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Section title used between cards on long pages. */
export function SectionTitle({ eyebrow, title, desc, className }) {
  return (
    <div className={cx('mb-4 mt-2', className)}>
      {eyebrow && <p className="eyebrow mb-2 flex items-center gap-2 text-geru"><AipanRule className="h-2.5 w-14" />{eyebrow}</p>}
      <h2 className="font-serif text-2xl font-medium text-pine sm:text-3xl">{title}</h2>
      {desc && <p className="mt-1.5 max-w-[70ch] text-sm text-slate sm:text-[0.95rem]">{desc}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ badges & tags */

const TONES = {
  good: 'bg-good-bg text-good',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  info: 'bg-info-bg text-info',
  muted: 'bg-parchment text-slate',
  geru: 'bg-geru-50 text-geru',
  dark: 'bg-white/12 text-white ring-1 ring-white/25',
};

export function Badge({ tone = 'muted', icon, className, children, title }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.74rem] font-bold whitespace-nowrap', TONES[tone] ?? TONES.muted, className)}>
      {icon && <Icon name={icon} className="size-3.5" />}
      {children}
    </span>
  );
}

/** Status badge from a { status: { label, tone } } map (utils/format.js). */
export function StatusBadge({ status, info }) {
  const meta = info[status] ?? { label: status, tone: 'muted' };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/**
 * Hotel room-key tag: the stat tile used across dashboards. A punched hole and cord evoke the
 * brass-tag keys of hill hotels.
 */
export function KeyTag({ label, value, sub, foot, icon, tone = 'white', className, children }) {
  const dark = tone === 'pine' || tone === 'geru' || tone === 'forest';
  const bg = { white: 'bg-white ring-1 ring-line', pine: 'bg-pine', forest: 'bg-forest', geru: 'bg-geru', parchment: 'bg-parchment ring-1 ring-line' }[tone];
  return (
    <div className={cx('relative overflow-hidden rounded-[1.6rem] p-5 pt-6 shadow-card', bg, dark ? 'text-mist' : 'text-ink', className)}>
      <span aria-hidden="true" className={cx('absolute top-4 right-5 size-3.5 rounded-full ring-2', dark ? 'bg-pine/40 ring-white/40' : 'bg-ivory ring-line')} />
      <span aria-hidden="true" className={cx('absolute -top-3 right-[1.55rem] h-7 w-px', dark ? 'bg-white/40' : 'bg-pine/25')} />
      <div className={cx('flex items-center gap-2 pr-8', dark ? 'text-glacier' : 'text-slate')}>
        {icon && <Icon name={icon} className="size-4" />}
        <p className="eyebrow">{label}</p>
      </div>
      <p className={cx('num mt-2 font-serif text-[2.4rem] leading-none font-medium tracking-tight', dark ? 'text-white' : 'text-pine')}>{value}</p>
      {sub && <p className={cx('mt-2 text-sm', dark ? 'text-mist/85' : 'text-ink/80')}>{sub}</p>}
      {children}
      {foot && <p className={cx('mt-2 text-xs', dark ? 'text-mist/65' : 'text-slate')}>{foot}</p>}
      <svg aria-hidden="true" viewBox="0 0 120 40" className={cx('pointer-events-none absolute right-0 bottom-0 h-10 w-32', dark ? 'text-white/8' : 'text-forest/7')}>
        <path d="M0 40 L24 16 L38 28 L62 4 L86 26 L100 14 L120 30 L120 40 Z" fill="currentColor" />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ page hero */

/**
 * Page banner: the Himalaya photograph with a deodar-green fade, breadcrumb, title and actions,
 * finished with an Aipan border. Content below should start with `-mt-12` to overlap it.
 */
export function PageHero({ eyebrow, deva, title, subtitle, crumbs = [], actions, children, position = '50% 35%', tall = false }) {
  return (
    <header className={cx('relative isolate overflow-hidden', tall ? 'min-h-[420px] sm:min-h-[480px]' : 'min-h-[300px] sm:min-h-[340px]')}>
      <div className="absolute inset-0 -z-10">
        <MountainPhoto position={position} priority />
        <div className="absolute inset-0 bg-linear-to-b from-sky-deep/35 via-pine/30 to-pine/90" />
        <div className="absolute inset-0 bg-linear-to-r from-pine/70 via-pine/25 to-transparent" />
      </div>
      <div className="mx-auto flex h-full max-w-7xl flex-col justify-end px-4 pt-28 pb-20 sm:px-6 lg:px-8">
        {crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-white/80">
            {crumbs.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true" className="text-white/40">/</span>}
                {c.to ? <Link to={c.to} className="hover:text-white hover:underline">{c.label}</Link> : <span className="text-white">{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-3xl">
            {(eyebrow || deva) && (
              <p className="mb-2 flex flex-wrap items-baseline gap-x-3 text-glacier">
                {deva && <span className="font-deva text-lg text-amber" lang="hi">{deva}</span>}
                {eyebrow && <span className="eyebrow">{eyebrow}</span>}
              </p>
            )}
            <h1 className="text-shadow-soft font-serif text-[2.1rem] leading-[1.05] font-medium tracking-tight text-white sm:text-5xl">{title}</h1>
            {subtitle && <p className="text-shadow-soft mt-3 max-w-2xl text-[0.98rem] text-white/85 sm:text-lg">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
      <div className="absolute inset-x-0 bottom-0">
        <AipanBorder height={22} />
      </div>
    </header>
  );
}

/** Standard page body container that overlaps the hero. */
export function PageBody({ className, children }) {
  return <main id="main" className={cx('relative z-10 mx-auto -mt-10 max-w-7xl space-y-6 px-4 pb-24 sm:px-6 lg:px-8', className)}>{children}</main>;
}

/* ------------------------------------------------------------------ controls */

/** Segmented control / tabs with a sliding pill. `options` = [{ value, label, icon? }]. */
export function Segmented({ options, value, onChange, id = 'seg', className, size = 'md', ariaLabel }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cx('inline-flex flex-wrap gap-1 rounded-full bg-parchment/80 p-1 ring-1 ring-line', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cx('relative rounded-full font-bold transition-colors', size === 'sm' ? 'min-h-8 px-3 text-[0.78rem]' : 'min-h-10 px-4 text-[0.86rem]', on ? 'text-white' : 'text-slate hover:text-pine')}
          >
            {on && <motion.span layoutId={`${id}-pill`} className="absolute inset-0 rounded-full bg-forest" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
            <span className="relative inline-flex items-center gap-1.5">
              {o.icon && <Icon name={o.icon} className="size-4" />}
              {o.label}
              {o.count !== undefined && <span className={cx('num rounded-full px-1.5 text-[0.7rem]', on ? 'bg-white/20' : 'bg-white')}>{o.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Labelled form field wrapper. */
export function Field({ label, hint, children, className }) {
  return (
    <label className={cx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate">{hint}</span>}
    </label>
  );
}

/* ------------------------------------------------------------------ states */

export function Spinner({ className = 'size-6' }) {
  return <AipanMandala className={cx('animate-spin [animation-duration:2.4s]', className)} detail="simple" />;
}

export function Notice({ tone = 'info', icon, title, children, className, action }) {
  const icons = { info: 'info', good: 'check', warn: 'alert', bad: 'alert' };
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cx('flex flex-wrap items-start gap-3 rounded-2xl px-4 py-3 text-sm', TONES[tone], className)}>
      <Icon name={icon ?? icons[tone] ?? 'info'} className="mt-0.5 size-4.5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, hint, icon = 'mountain', action, className }) {
  return (
    <div className={cx('flex flex-col items-center gap-3 rounded-3xl border border-dashed border-pine/15 bg-white/60 px-6 py-10 text-center', className)}>
      <span className="relative grid size-16 place-items-center">
        <AipanMandala className="absolute inset-0 size-16 opacity-90" detail="simple" />
        <Icon name={icon} className="relative size-6 text-rice" />
      </span>
      <p className="font-serif text-xl text-pine">{title}</p>
      {hint && <p className="max-w-md text-sm text-slate">{hint}</p>}
      {action}
    </div>
  );
}

/** Rating as a slim bar + value. */
export function Stars({ rating }) {
  if (!rating) return <span className="text-sm text-slate">No rating</span>;
  const pct = Math.max(0, Math.min(100, (rating.value / rating.scaleMax) * 100));
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" title={`${rating.value} out of ${rating.scaleMax}`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-parchment"><span className="block h-full rounded-full bg-amber" style={{ width: `${pct}%` }} /></span>
      <span className="num font-bold">{rating.value}<span className="font-medium text-slate">/{rating.scaleMax}</span></span>
    </span>
  );
}

/** Thin progress bar. */
export function Progress({ value, className, tone = 'forest' }) {
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-parchment', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', tone === 'geru' ? 'bg-geru' : 'bg-forest')} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/** Simple responsive table shell (horizontal scroll on small screens). */
export function Table({ children, className }) {
  return (
    <div className={cx('scrollbar-thin -mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6', className)}>
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm [&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-3 [&_td]:align-middle [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-[0.7rem] [&_th]:font-extrabold [&_th]:tracking-[0.12em] [&_th]:text-slate [&_th]:uppercase [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-mist/50">
        {children}
      </table>
    </div>
  );
}
