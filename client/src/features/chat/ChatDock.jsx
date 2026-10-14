import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { api } from '../../services/httpClient.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { Spinner } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';
import { AipanMandala } from '../../ui/aipan.jsx';
import { useConversation } from './chatStore.js';

// The chat code loads the first time the panel opens.
const ChatPanel = lazy(() => import('./ChatPanel.jsx'));

/** Floating "Ask Front Desk" button on every hotel page; opens the assistant (Hotel Pro). */
export default function ChatDock({ bizId }) {
  const auth = useAuth();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const paid = auth.has('pro');
  const hotel = useQuery({ queryKey: ['business', bizId], queryFn: () => api.getBusiness(bizId), staleTime: 60_000, enabled: Boolean(bizId) });
  const { pending } = useConversation(bizId);
  const name = hotel.data?.business?.name ?? 'your hotel';

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (auth.status !== 'signed-in') return null;
  const unlock = `/pricing?plan=pro&next=${encodeURIComponent(`/business/${bizId}/report`)}`;

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            type="button"
            onClick={() => setOpen(true)}
            initial={reduce ? false : { scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="fixed right-4 bottom-4 z-[70] inline-flex min-h-14 items-center gap-2 rounded-full bg-geru py-2 pr-5 pl-2 font-bold text-rice shadow-lift ring-4 ring-white/70 hover:bg-geru-600 sm:right-6 sm:bottom-6"
            aria-label="Ask Front Desk about your reviews"
          >
            <span className="relative grid size-10 place-items-center rounded-full bg-amber text-pine">
              <Icon name="bell" className="size-5" />
              {pending && <span className="absolute -top-0.5 -right-0.5 size-3 animate-ping rounded-full bg-white" />}
            </span>
            <span className="hidden sm:inline">Ask Front Desk</span>
            {!paid && <Icon name="lock" className="size-4 text-amber" />}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.section
            role="dialog"
            aria-label="Ask Front Desk"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-[75] flex flex-col overflow-hidden bg-white shadow-lift sm:inset-auto sm:right-6 sm:bottom-6 sm:h-[min(40rem,calc(100vh-7rem))] sm:w-[25rem] sm:rounded-[1.75rem] sm:ring-1 sm:ring-line"
          >
            <header className="relative flex items-center gap-3 overflow-hidden bg-pine px-4 py-3 text-mist">
              <AipanMandala className="pointer-events-none absolute -top-10 -right-6 size-28 opacity-15" bg={null} color="#fffdf7" />
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-amber text-pine"><Icon name="bell" className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-serif text-lg leading-tight text-white">Ask Front Desk</p>
                <p className="truncate text-xs text-mist/80">{name} · answers from your reviews</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="relative grid size-10 place-items-center rounded-full text-white hover:bg-white/10">
                <Icon name="close" className="size-5" /><span className="sr-only">Close</span>
              </button>
            </header>
            <div className="min-h-0 flex-1">
              {paid ? (
                <Suspense fallback={<div className="grid h-full place-items-center"><Spinner className="size-8" /></div>}>
                  <ChatPanel bizId={bizId} hotelName={name} compact autoFocus />
                </Suspense>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 bg-ivory/60 p-6 text-center">
                  <span className="grid size-14 place-items-center rounded-full bg-geru text-rice"><Icon name="lock" className="size-6" /></span>
                  <p className="font-serif text-2xl text-pine">Your AI review assistant</p>
                  <p className="text-sm text-slate">Ask “Why is the hotel next door rated higher?”, “How do I fix breakfast complaints?” or “What did guests say about hot water this month?” - answered from {name}&rsquo;s own reviews, in English, हिंदी or Hinglish.</p>
                  <ul className="space-y-1 text-left text-sm text-ink">
                    {['Answers in seconds, word by word', 'Shows the guest reviews behind every answer', 'Knows your competitors by name'].map((t) => <li key={t} className="flex items-center gap-2"><Icon name="check" className="size-4 text-good" /> {t}</li>)}
                  </ul>
                  <Link to={unlock} onClick={() => setOpen(false)} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-geru px-5 font-bold text-rice hover:bg-geru-600"><Icon name="key" className="size-4" /> Unlock with Hotel Pro</Link>
                </div>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
