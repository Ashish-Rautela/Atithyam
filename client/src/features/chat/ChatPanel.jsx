import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cx } from '../../ui/kit.jsx';
import { AspectIcon, Icon } from '../../ui/icons.jsx';
import { AipanMandala } from '../../ui/aipan.jsx';
import { ASPECTS } from '../../utils/format.js';
import { ask, reset, stop, useConversation, watch } from './chatStore.js';
import { STARTERS } from './starters.js';

export { STARTERS };

const MAX = 500;
const STARTER_ICON = ['alert', 'trendUp', 'users', 'star'];
const STARTER_HINT = ['Top complaints, with quotes', 'Fixes ranked by impact', 'Compare with a neighbour', 'Your strongest topics'];
const ASPECT_BY_LABEL = Object.fromEntries(ASPECTS.map((a) => [a.label.toLowerCase(), a.key]));
const SOURCE = { google_maps: 'Google', booking: 'Booking.com', agoda: 'Agoda', makemytrip: 'MakeMyTrip', tripadvisor: 'Tripadvisor' };
const time = (at) => (at ? new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');

/** **bold** and *italic* inside a line, as React elements (no HTML injection). */
function inline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i} className="font-bold text-pine">{p.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

/** Paragraphs, "- " bullets and "1. " numbered lists. */
export function Answer({ text }) {
  const blocks = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
    const num = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const last = blocks.at(-1);
    if (bullet) {
      if (last?.type === 'ul') last.items.push(bullet[1]);
      else blocks.push({ type: 'ul', items: [bullet[1]] });
    } else if (num) {
      if (last?.type === 'ol') last.items.push(num[2]);
      else blocks.push({ type: 'ol', items: [num[2]] });
    } else if (line.trim()) {
      blocks.push({ type: 'p', text: line });
    }
  }
  return (
    <div className="space-y-2.5">
      {blocks.map((b, i) => (b.type === 'p'
        ? <p key={i}>{inline(b.text)}</p>
        : b.type === 'ul'
          ? (
            <ul key={i} className="space-y-1.5">
              {b.items.map((t, k) => (
                <li key={k} className="flex gap-2"><span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-amber" aria-hidden="true" /><span>{inline(t)}</span></li>
              ))}
            </ul>
          )
          : (
            <ol key={i} className="space-y-1.5">
              {b.items.map((t, k) => (
                <li key={k} className="flex gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-geru/10 text-[0.7rem] font-bold text-geru" aria-hidden="true">{k + 1}</span>
                  <span>{inline(t)}</span>
                </li>
              ))}
            </ol>
          )))}
    </div>
  );
}

/** The assistant's face: a small Aipan chowki on amber. */
export function Avatar({ className = 'size-8' }) {
  return (
    <span className={cx('grid shrink-0 place-items-center rounded-full bg-amber ring-2 ring-white', className)} aria-hidden="true">
      <AipanMandala className="size-[78%]" detail="simple" bg="#16302b" color="#f4c25b" />
    </span>
  );
}

function Typing() {
  return (
    <span className="flex items-center gap-1.5 py-1" role="status">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-2 animate-bounce rounded-full bg-forest/60" style={{ animationDelay: `${i * 140}ms`, animationDuration: '900ms' }} />
      ))}
      <span className="ml-1.5 text-sm text-slate">Reading your reviews…</span>
    </span>
  );
}

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text.replace(/\*\*/g, ''));
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // clipboard blocked: nothing to do
        }
      }}
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold text-slate hover:bg-mist hover:text-forest"
      title="Copy answer"
    >
      <Icon name={done ? 'check' : 'layers'} className="size-3.5" />{done ? 'Copied' : 'Copy'}
    </button>
  );
}

function TopicChip({ label }) {
  const key = ASPECT_BY_LABEL[String(label).toLowerCase()];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-mist px-2 py-0.5 text-[0.72rem] font-bold text-forest">
      {key ? <AspectIcon aspect={key} className="size-3" /> : <Icon name="hotel" className="size-3" />}
      {label}
    </span>
  );
}

function Sources({ sources }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-full text-xs font-bold text-forest hover:text-pine">
        <Icon name="quote" className="size-3.5 text-amber" />
        Guest reviews behind this ({sources.length})
        <Icon name="arrowDown" className={cx('size-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {sources.map((s, k) => (
            <li key={k} className="rounded-xl bg-ivory px-3 py-2 text-xs text-ink ring-1 ring-line">
              <p className="italic leading-relaxed">“{s.quote}”</p>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.68rem] font-bold text-slate">
                <span>{s.topic}</span>
                {s.platform && <span className="rounded-full bg-white px-1.5 py-px ring-1 ring-line">{SOURCE[s.platform] ?? s.platform}</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Welcome({ hotelName, userName, onPick, compact }) {
  const first = userName?.trim().split(/\s+/)[0];
  return (
    <div className="flex flex-col items-center pt-2 text-center">
      <Avatar className="size-14" />
      <p className="mt-3 font-serif text-2xl text-pine">Namaste{first ? `, ${first}` : ''}</p>
      <p className="mt-1 max-w-sm text-sm text-slate">
        I&rsquo;ve read every review of <strong className="text-pine">{hotelName}</strong> and the hotels around it. Ask me anything - in English, हिंदी or Hinglish.
      </p>
      <div className={cx('mt-5 grid w-full gap-2', compact ? 'grid-cols-1 min-[400px]:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2')}>
        {STARTERS.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="group flex items-start gap-3 rounded-2xl bg-white p-3 text-left ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-card hover:ring-forest/30"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-mist text-forest transition group-hover:bg-forest group-hover:text-white"><Icon name={STARTER_ICON[i] ?? 'star'} className="size-4.5" /></span>
            <span className="min-w-0">
              <span className="block text-sm leading-snug font-bold text-pine">{s}</span>
              {!compact && <span className="mt-0.5 block text-xs text-slate">{STARTER_HINT[i]}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Message({ m, isLast, onFollowUp, reduce }) {
  const motionProps = reduce ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: 'easeOut' } };
  if (m.role === 'user') {
    return (
      <motion.div {...motionProps} className="flex flex-col items-end" data-role="user">
        <p className="max-w-[85%] rounded-[1.4rem] rounded-br-md bg-gradient-to-br from-forest to-pine px-4 py-2.5 text-[0.95rem] whitespace-pre-wrap text-white shadow-sm">{m.text}</p>
        {m.at && <span className="mt-1 mr-1 text-[0.68rem] text-slate/80">{time(m.at)}</span>}
      </motion.div>
    );
  }
  const done = !m.streaming && !m.error && m.text;
  return (
    <motion.div {...motionProps} className="flex items-end gap-2" data-role="assistant">
      <Avatar className="size-8 self-start" />
      <div className="min-w-0 max-w-[90%] flex-1">
        <p className="mb-1 ml-1 flex items-center gap-1.5 text-[0.7rem] font-bold text-slate">
          Front Desk{m.at && <span className="font-normal text-slate/80">· {time(m.at)}</span>}
          {m.cached && <span className="rounded-full bg-good-bg px-1.5 py-px text-good">instant</span>}
        </p>
        <div className={cx('rounded-[1.4rem] rounded-tl-md px-4 py-3 text-[0.95rem] leading-relaxed shadow-sm', m.error ? 'bg-bad-bg text-bad ring-1 ring-bad/20' : 'bg-white text-ink ring-1 ring-line')}>
          {m.error && <Icon name="alert" className="mr-1.5 inline size-4 align-[-3px]" />}
          {m.text ? <Answer text={m.text} /> : <Typing />}
          {m.streaming && m.text && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-forest align-middle" aria-hidden="true" />}
          {done && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
              {m.topics?.slice(0, 4).map((t) => <TopicChip key={t} label={t} />)}
              <span className="ml-auto"><CopyButton text={m.text} /></span>
            </div>
          )}
          {!m.streaming && m.sources?.length > 0 && <Sources sources={m.sources} />}
        </div>
        {isLast && done && m.followUps?.length > 0 && (
          <div className="mt-2.5 space-y-1.5">
            <p className="ml-1 text-[0.7rem] font-bold tracking-wide text-slate uppercase">Ask next</p>
            <div className="flex flex-wrap gap-1.5">
              {m.followUps.map((f) => (
                <button key={f} type="button" onClick={() => onFollowUp(f)} className="group inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-left text-xs font-bold text-forest ring-1 ring-forest/25 transition hover:bg-forest hover:text-white">
                  {f}<Icon name="arrowRight" className="size-3 transition group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * The conversation UI. `compact` = inside the floating panel; otherwise the larger inline card.
 */
export default function ChatPanel({ bizId, hotelName, userName, compact = false, autoFocus = false }) {
  const { messages, pending } = useConversation(bizId);
  const reduce = useReducedMotion();
  const [text, setText] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const last = messages.at(-1);

  useEffect(() => watch(bizId), [bizId]);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);
  // Keep the newest text in view while it streams.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce || last?.streaming ? 'auto' : 'smooth' });
  }, [messages.length, last?.text, last?.streaming, reduce]);
  // The box grows with the question, up to about five lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const send = (q) => {
    if (q.trim().length < 2 || pending) return;
    setText('');
    ask(bizId, q);
    inputRef.current?.focus();
  };
  const id = `chat-${bizId}-${compact ? 'dock' : 'inline'}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={listRef}
        className={cx('scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto bg-ivory p-4', !compact && 'max-h-[34rem] min-h-[22rem] sm:p-6')}
        style={{ backgroundImage: 'radial-gradient(rgba(22,48,43,0.06) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
        aria-live="polite"
        aria-busy={pending}
      >
        {messages.length === 0 && <Welcome hotelName={hotelName} userName={userName} onPick={send} compact={compact} />}
        <AnimatePresence initial={false}>
          {messages.map((m) => <Message key={m.id} m={m} isLast={m === last} onFollowUp={send} reduce={reduce} />)}
        </AnimatePresence>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="border-t border-line bg-white px-3 pt-3 pb-2">
        <div className="flex items-end gap-2 rounded-[1.4rem] bg-ivory p-1.5 ring-1 ring-line transition focus-within:ring-2 focus-within:ring-forest/40">
          {!compact && messages.length > 0 && !pending && (
            <button type="button" onClick={() => reset(bizId)} className="grid size-10 shrink-0 place-items-center rounded-full text-slate hover:bg-white hover:text-pine" title="New conversation">
              <Icon name="refresh" className="size-4.5" /><span className="sr-only">New conversation</span>
            </button>
          )}
          <label htmlFor={id} className="sr-only">Your question</label>
          <textarea
            ref={inputRef}
            id={id}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(text);
              }
            }}
            maxLength={MAX}
            placeholder={compact ? 'Ask about your reviews…' : 'Ask about breakfast, rooms, staff, prices, or a competitor…'}
            className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-[0.95rem] text-ink outline-none placeholder:text-slate/70"
            autoComplete="off"
          />
          {pending ? (
            <button type="button" onClick={() => stop(bizId)} className="grid size-10 shrink-0 place-items-center rounded-full bg-pine text-white hover:bg-forest" title="Stop">
              <span className="size-3 rounded-sm bg-white" aria-hidden="true" /><span className="sr-only">Stop</span>
            </button>
          ) : (
            <button type="submit" disabled={text.trim().length < 2} className="grid size-10 shrink-0 place-items-center rounded-full bg-geru text-rice shadow-sm transition hover:bg-geru-600 disabled:bg-line disabled:text-slate disabled:shadow-none" title="Ask">
              <Icon name="arrowRight" className="size-4.5 -rotate-90" /><span className="sr-only">Ask</span>
            </button>
          )}
        </div>
        <p className="mt-1.5 flex items-center justify-between gap-2 px-2 text-[0.68rem] text-slate">
          <span className="inline-flex items-center gap-1"><Icon name="info" className="size-3" /> {compact ? 'Answers come only from your reviews.' : 'Answers use only your reviews - check the quotes.'}</span>
          <span className={cx('tabular-nums', text.length > MAX - 50 && 'font-bold text-geru')}>{text.length ? `${text.length}/${MAX}` : <span className={compact ? 'hidden' : 'hidden sm:inline'}>Shift + Enter for a new line</span>}</span>
        </p>
      </form>
    </div>
  );
}
