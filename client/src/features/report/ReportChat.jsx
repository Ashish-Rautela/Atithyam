import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../services/httpClient.js';
import { Spinner, cx } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';
import { AipanMandala } from '../../ui/aipan.jsx';

export const STARTERS = [
  'What do guests complain about most?',
  'Why is a competitor rated higher than me?',
  'How can I improve my breakfast reviews?',
  'Where am I ahead of the hotels near me?',
];

/** "Ask Front Desk": questions about this hotel's reviews, answered from its own data (Hotel Pro). */
export default function ReportChat({ bizId, hotelName }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const listRef = useRef(null);
  const ask = useMutation({
    mutationFn: ({ question, history }) => api.askReviews(bizId, question, history),
    onSuccess: (data) => setMessages((m) => [...m, { role: 'assistant', text: data.answer, followUps: data.followUps, sources: data.sources }]),
    onError: (err) => setMessages((m) => [...m, { role: 'assistant', text: err.message, error: true }]),
  });

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, ask.isPending]);

  const send = (question) => {
    const q = question.trim();
    if (q.length < 2 || ask.isPending) return;
    const history = messages.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text.slice(0, 2000) }));
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setText('');
    ask.mutate({ question: q, history });
  };

  return (
    <div className="overflow-hidden rounded-[2rem] bg-white shadow-card ring-1 ring-line">
      <div className="relative flex items-center gap-3 overflow-hidden bg-pine px-5 py-4 text-mist">
        <AipanMandala className="pointer-events-none absolute -top-10 -right-10 size-36 opacity-15" bg={null} color="#fffdf7" />
        <span className="grid size-11 place-items-center rounded-2xl bg-amber text-pine"><Icon name="bell" className="size-5" /></span>
        <div>
          <p className="font-serif text-xl text-white">Ask Front Desk</p>
          <p className="text-sm text-mist/80">Answers from {hotelName}&rsquo;s reviews and the hotels near you - never made up.</p>
        </div>
      </div>

      <div ref={listRef} className="scrollbar-thin max-h-[28rem] min-h-[12rem] space-y-3 overflow-y-auto bg-ivory/60 p-4 sm:p-5" aria-live="polite">
        {messages.length === 0 && (
          <div>
            <p className="text-sm font-semibold text-slate">Try asking:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="min-h-10 rounded-full bg-white px-4 text-left text-sm font-semibold text-pine ring-1 ring-line transition hover:ring-forest/40">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[85%] rounded-3xl px-4 py-3 text-[0.95rem] leading-relaxed whitespace-pre-line', m.role === 'user' ? 'rounded-br-md bg-forest text-white' : m.error ? 'rounded-bl-md bg-bad-bg text-bad' : 'rounded-bl-md bg-white text-ink ring-1 ring-line')}>
              {m.text}
              {m.sources?.length > 0 && (
                <details className="mt-2 text-xs text-slate">
                  <summary className="cursor-pointer font-bold text-forest">Guest reviews behind this ({m.sources.length})</summary>
                  <ul className="mt-1.5 space-y-1">
                    {m.sources.map((s, k) => <li key={k} className="border-l-2 border-amber pl-2 italic">“{s.quote}” <span className="not-italic text-slate/80">· {s.topic}</span></li>)}
                  </ul>
                </details>
              )}
              {m.followUps?.length > 0 && i === messages.length - 1 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.followUps.map((f) => (
                    <button key={f} type="button" onClick={() => send(f)} className="rounded-full bg-mist px-3 py-1.5 text-xs font-bold text-forest hover:bg-forest hover:text-white">{f}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {ask.isPending && (
          <div className="flex items-center gap-2 text-sm font-semibold text-slate"><Spinner className="size-5" /> Reading your reviews…</div>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex gap-2 border-t border-line p-3">
        <label htmlFor="chat-q" className="sr-only">Your question</label>
        <input id="chat-q" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Ask about breakfast, rooms, staff, prices… (English, हिंदी or Hinglish)" className="field min-h-12 flex-1 rounded-full" autoComplete="off" />
        <button type="submit" disabled={ask.isPending || text.trim().length < 2} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-geru px-5 font-bold text-rice hover:bg-geru-600 disabled:opacity-50">
          <Icon name="arrowRight" className="size-4.5" /><span className="hidden sm:inline">Ask</span>
        </button>
      </form>
    </div>
  );
}
