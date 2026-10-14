import { Fragment, useEffect, useRef, useState } from 'react';
import { Spinner, cx } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';
import { ask, reset, stop, useConversation } from './chatStore.js';
import { STARTERS } from './starters.js';

export { STARTERS };

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
    <div className="space-y-2">
      {blocks.map((b, i) => (b.type === 'p'
        ? <p key={i}>{inline(b.text)}</p>
        : b.type === 'ul'
          ? <ul key={i} className="list-disc space-y-1 pl-5 marker:text-amber">{b.items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ul>
          : <ol key={i} className="list-decimal space-y-1 pl-5 marker:font-bold marker:text-geru">{b.items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ol>))}
    </div>
  );
}

const SOURCE = { google_maps: 'Google', booking: 'Booking.com', agoda: 'Agoda', makemytrip: 'MakeMyTrip', tripadvisor: 'Tripadvisor' };

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
      className="rounded-full px-2 py-1 text-xs font-bold text-slate hover:bg-mist hover:text-forest"
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

/**
 * The conversation UI. `compact` = inside the floating panel; otherwise the larger inline card.
 */
export default function ChatPanel({ bizId, hotelName, compact = false, autoFocus = false }) {
  const { messages, pending } = useConversation(bizId);
  const [text, setText] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const last = messages.at(-1);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);
  // Keep the newest text in view while it streams.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, last?.text]);

  const send = (q) => {
    if (!q.trim() || pending) return;
    setText('');
    ask(bizId, q);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={listRef} className={cx('scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto bg-ivory/60 p-4', !compact && 'max-h-[30rem] min-h-[14rem] sm:p-5')} aria-live="polite" aria-busy={pending}>
        {messages.length === 0 && (
          <div>
            <p className="text-sm text-slate">Ask anything about <strong className="text-pine">{hotelName}</strong>&rsquo;s reviews, your topics, or a competitor by name. Answers use only your data.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="min-h-10 rounded-full bg-white px-4 text-left text-sm font-semibold text-pine ring-1 ring-line transition hover:ring-forest/40">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'user' ? (
              <p className="max-w-[85%] rounded-3xl rounded-br-md bg-forest px-4 py-2.5 text-[0.95rem] text-white">{m.text}</p>
            ) : (
              <div className={cx('max-w-[92%] rounded-3xl rounded-bl-md px-4 py-3 text-[0.95rem] leading-relaxed', m.error ? 'bg-bad-bg text-bad' : 'bg-white text-ink ring-1 ring-line')}>
                {m.text ? <Answer text={m.text} /> : <span className="flex items-center gap-2 text-slate"><Spinner className="size-5" /> Reading your reviews…</span>}
                {m.streaming && m.text && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-forest align-middle" aria-hidden="true" />}
                {!m.streaming && !m.error && m.text && (
                  <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-line pt-2">
                    {m.topics?.length > 0 && <span className="mr-auto text-xs font-semibold text-slate">About: {m.topics.join(', ')}{m.cached ? ' · instant' : ''}</span>}
                    <CopyButton text={m.text} />
                  </div>
                )}
                {!m.streaming && m.sources?.length > 0 && (
                  <details className="mt-1 text-xs text-slate">
                    <summary className="cursor-pointer font-bold text-forest">Guest reviews behind this ({m.sources.length})</summary>
                    <ul className="mt-1.5 space-y-1">
                      {m.sources.map((s, k) => <li key={k} className="border-l-2 border-amber pl-2 italic">“{s.quote}” <span className="text-slate/80 not-italic">· {s.topic}{s.platform ? ` · ${SOURCE[s.platform] ?? s.platform}` : ''}</span></li>)}
                    </ul>
                  </details>
                )}
                {m === last && !m.streaming && m.followUps?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.followUps.map((f) => (
                      <button key={f} type="button" onClick={() => send(f)} className="rounded-full bg-mist px-3 py-1.5 text-left text-xs font-bold text-forest hover:bg-forest hover:text-white">{f}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex items-center gap-2 border-t border-line bg-white p-3">
        {messages.length > 0 && !pending && (
          <button type="button" onClick={() => reset(bizId)} className="grid size-11 shrink-0 place-items-center rounded-full text-slate ring-1 ring-line hover:text-pine" title="New conversation">
            <Icon name="refresh" className="size-4.5" /><span className="sr-only">New conversation</span>
          </button>
        )}
        <label htmlFor={`chat-${bizId}-${compact ? 'dock' : 'inline'}`} className="sr-only">Your question</label>
        <input
          ref={inputRef}
          id={`chat-${bizId}-${compact ? 'dock' : 'inline'}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder={compact ? 'Ask about your reviews…' : 'Ask about breakfast, rooms, staff, prices, or a competitor… (English, हिंदी, Hinglish)'}
          className="field min-h-11 flex-1 rounded-full py-2"
          autoComplete="off"
        />
        {pending ? (
          <button type="button" onClick={() => stop(bizId)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-pine px-4 font-bold text-white hover:bg-forest">
            <span className="size-3 rounded-sm bg-white" aria-hidden="true" /> Stop
          </button>
        ) : (
          <button type="submit" disabled={text.trim().length < 2} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-geru px-4 font-bold text-rice hover:bg-geru-600 disabled:opacity-50">
            <Icon name="arrowRight" className="size-4.5" /><span className="sr-only sm:not-sr-only">Ask</span>
          </button>
        )}
      </form>
    </div>
  );
}
