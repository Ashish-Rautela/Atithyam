import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { api } from '../../services/httpClient.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Spinner, cx } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';
import { AipanMandala } from '../../ui/aipan.jsx';
import { reset, useConversation } from './chatStore.js';

// The chat code loads the first time the panel opens.
const ChatPanel = lazy(() => import('./ChatPanel.jsx'));

/** Blurred sample conversation shown behind the lock for free plans (made-up text, not their data). */
function SamplePreview() {
  return (
    <div className="pointer-events-none absolute inset-0 space-y-4 p-4 blur-[3px] select-none" aria-hidden="true">
      <p className="ml-auto w-3/5 rounded-[1.4rem] rounded-br-md bg-forest px-4 py-2.5 text-sm text-white">Why is the hotel next door rated higher?</p>
      <div className="w-4/5 space-y-2 rounded-[1.4rem] rounded-tl-md bg-white p-4 text-sm ring-1 ring-line">
        <p className="h-3 w-full rounded bg-mist" /><p className="h-3 w-11/12 rounded bg-mist" /><p className="h-3 w-3/4 rounded bg-mist" />
        <p className="h-3 w-5/6 rounded bg-amber/30" /><p className="h-3 w-2/3 rounded bg-mist" />
      </div>
      <p className="ml-auto w-1/2 rounded-[1.4rem] rounded-br-md bg-forest px-4 py-2.5 text-sm text-white">How do I fix breakfast?</p>
      <div className="w-3/4 space-y-2 rounded-[1.4rem] rounded-tl-md bg-white p-4 ring-1 ring-line">
        <p className="h-3 w-full rounded bg-mist" /><p className="h-3 w-4/5 rounded bg-mist" /><p className="h-3 w-2/3 rounded bg-geru/20" />
      </div>
    </div>
  );
}

/** Floating "Ask Front Desk" button on every hotel page; opens the assistant (Hotel Pro). */
export default function ChatDock({ bizId }) {
  const auth = useAuth();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const paid = auth.has('pro');
  const hotel = useQuery({ queryKey: ['business', bizId], queryFn: () => api.getBusiness(bizId), staleTime: 60_000, enabled: Boolean(bizId) });
  const { pending, unread, messages } = useConversation(bizId);
  const name = hotel.data?.business?.name ?? 'your hotel';
  const reviews = hotel.data?.business?.googleReviewCount;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (auth.status !== 'signed-in') return null;
  const report = `/business/${bizId}/report`;
  const unlock = `/pricing?plan=pro&next=${encodeURIComponent(report)}`;

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            type="button"
            onClick={() => setOpen(true)}
            initial={reduce ? false : { scale: 0.8, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            whileHover={reduce ? undefined : { y: -2 }}
            className="group fixed right-4 bottom-4 z-[70] inline-flex min-h-14 items-center gap-2.5 rounded-full bg-pine py-2 pr-5 pl-2 text-left text-white shadow-lift ring-4 ring-white/80 sm:right-6 sm:bottom-6"
            aria-label="Ask Front Desk about your reviews"
          >
            <span className="relative grid size-11 place-items-center rounded-full bg-amber">
              {!reduce && paid && messages.length === 0 && <span className="absolute inset-0 animate-ping rounded-full bg-amber/50 [animation-duration:2.4s]" aria-hidden="true" />}
              <AipanMandala className="relative size-8" detail="simple" bg="#16302b" color="#f4c25b" />
              {(unread > 0 || pending) && (
                <span className={cx('absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full px-1 text-[0.65rem] font-bold ring-2 ring-pine', pending ? 'size-3.5 min-w-0 animate-pulse bg-white' : 'h-5 bg-geru text-rice')}>
                  {!pending && unread}
                </span>
              )}
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block font-serif text-[1.05rem]">Ask Front Desk</span>
              <span className="block text-[0.7rem] text-mist/80">{pending ? 'Writing your answer…' : unread ? 'New answer ready' : 'AI on your reviews'}</span>
            </span>
            {!paid && <Icon name="lock" className="size-4 text-amber" />}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-[74] bg-pine/20 backdrop-blur-[2px] sm:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.section
              role="dialog"
              aria-label="Ask Front Desk"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              style={{ transformOrigin: 'bottom right' }}
              className={cx(
                'fixed inset-0 z-[75] flex flex-col overflow-hidden bg-white shadow-lift sm:inset-auto sm:right-6 sm:bottom-6 sm:rounded-[1.75rem] sm:ring-1 sm:ring-line',
                wide ? 'sm:h-[min(48rem,calc(100vh-3rem))] sm:w-[min(44rem,calc(100vw-3rem))]' : 'sm:h-[min(42rem,calc(100vh-5rem))] sm:w-[27rem]',
              )}
            >
              <header className="relative overflow-hidden bg-gradient-to-br from-pine to-forest px-4 pt-3.5 pb-3 text-mist">
                <AipanMandala className="pointer-events-none absolute -top-12 -right-8 size-36 opacity-15" bg={null} color="#fffdf7" />
                <div className="relative flex items-center gap-3">
                  <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-amber ring-2 ring-white/30">
                    <AipanMandala className="size-8" detail="simple" bg="#16302b" color="#f4c25b" />
                    <span className="absolute right-0 bottom-0 size-3 rounded-full bg-good ring-2 ring-pine" title="Online" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-lg leading-tight text-white">Front Desk</p>
                    <p className="truncate text-xs text-mist/85">
                      {pending ? <span className="text-amber">typing…</span> : <>Online · {name}{reviews ? ` · ${reviews} Google reviews` : ''}</>}
                    </p>
                  </div>
                  {paid && messages.length > 0 && !pending && (
                    <button type="button" onClick={() => reset(bizId)} className="grid size-9 place-items-center rounded-full text-white/90 hover:bg-white/10" title="New conversation">
                      <Icon name="refresh" className="size-4.5" /><span className="sr-only">New conversation</span>
                    </button>
                  )}
                  {paid && <button type="button" onClick={() => setWide((w) => !w)} className="hidden size-9 place-items-center rounded-full text-white/90 hover:bg-white/10 sm:grid" title={wide ? 'Smaller' : 'Larger'}>
                    <Icon name={wide ? 'arrowDown' : 'external'} className="size-4.5" /><span className="sr-only">{wide ? 'Make smaller' : 'Make larger'}</span>
                  </button>}
                  <button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full text-white hover:bg-white/10">
                    <Icon name="close" className="size-5" /><span className="sr-only">Close</span>
                  </button>
                </div>
                <div className="relative mt-2.5 flex items-center gap-2 text-[0.7rem]">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5"><Icon name="language" className="size-3" /> English · हिंदी · Hinglish</span>
                  <Link to={report} onClick={() => setOpen(false)} className="ml-auto inline-flex items-center gap-1 font-bold text-amber hover:text-white">Full report <Icon name="arrowRight" className="size-3" /></Link>
                </div>
              </header>
              <div className="min-h-0 flex-1">
                {paid ? (
                  <Suspense fallback={<div className="grid h-full place-items-center bg-ivory"><Spinner className="size-8" /></div>}>
                    <ChatPanel bizId={bizId} hotelName={name} userName={auth.user?.name} compact autoFocus />
                  </Suspense>
                ) : (
                  <div className="relative h-full overflow-hidden bg-ivory">
                    <SamplePreview />
                    <div className="absolute inset-0 bg-gradient-to-b from-ivory/40 via-ivory/85 to-ivory" />
                    <div className="relative flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                      <span className="grid size-14 place-items-center rounded-full bg-geru text-rice shadow-lift"><Icon name="lock" className="size-6" /></span>
                      <p className="font-serif text-2xl text-pine">Your AI review assistant</p>
                      <p className="max-w-xs text-sm text-slate">Ask anything about {name}&rsquo;s reviews and the hotels near you - answered from real guest words, never made up.</p>
                      <ul className="space-y-1.5 text-left text-sm text-ink">
                        {['Answers in seconds, word by word', 'Shows the guest reviews behind every answer', 'Knows your competitors by name'].map((t) => (
                          <li key={t} className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full bg-good-bg"><Icon name="check" className="size-3.5 text-good" /></span> {t}</li>
                        ))}
                      </ul>
                      <Link to={unlock} onClick={() => setOpen(false)} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-geru px-5 font-bold text-rice shadow-sm hover:bg-geru-600"><Icon name="key" className="size-4" /> Unlock with Hotel Pro</Link>
                    </div>
                  </div>
                )}
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
