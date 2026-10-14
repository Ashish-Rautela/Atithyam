// One conversation per hotel, shared by every place the chat appears (report page and the floating
// button), kept for the browser tab session. Answers stream in over server-sent events.
import { useSyncExternalStore } from 'react';
import { AUTH_EVENT, PLAN_EVENT } from '../../services/httpClient.js';

const conversations = new Map(); // bizId -> { messages, pending }
const listeners = new Set();
const controllers = new Map(); // bizId -> AbortController
const EMPTY = { messages: [], pending: false, unread: 0 };
const keyOf = (bizId) => `rip-chat:${bizId}`;
let seq = 0;

function load(bizId) {
  if (conversations.has(bizId)) return conversations.get(bizId);
  let state = EMPTY;
  try {
    const raw = sessionStorage.getItem(keyOf(bizId));
    if (raw) state = { messages: JSON.parse(raw).map((m) => ({ ...m, streaming: false })), pending: false, unread: 0 };
  } catch {
    // storage blocked or corrupt: start fresh
  }
  conversations.set(bizId, state);
  return state;
}

function save(bizId, state) {
  conversations.set(bizId, state);
  if (!state.pending) {
    try {
      sessionStorage.setItem(keyOf(bizId), JSON.stringify(state.messages.slice(-30)));
    } catch {
      // quota or storage blocked: the conversation still works in memory
    }
  }
  listeners.forEach((l) => l());
}

function update(bizId, fn) {
  save(bizId, fn(load(bizId)));
}

const patchLast = (bizId, patch) => update(bizId, (s) => ({ ...s, messages: s.messages.map((m, i) => (i === s.messages.length - 1 ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)) }));

export function useConversation(bizId) {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => load(bizId),
    () => EMPTY,
  );
}

/** Parses "event: x\ndata: {...}\n\n" blocks from a fetch body. */
async function readEvents(body, onEvent) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
    let cut;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const type = block.match(/^event: (\w+)/m)?.[1];
      const data = block.match(/^data: (.*)$/m)?.[1];
      if (type && data) {
        try {
          onEvent(type, JSON.parse(data));
        } catch {
          // ignore a malformed event
        }
      }
    }
  }
}

export async function ask(bizId, question) {
  const q = question.trim();
  const state = load(bizId);
  if (q.length < 2 || state.pending) return;
  const history = state.messages.filter((m) => !m.error && m.text).slice(-8).map((m) => ({ role: m.role, text: m.text.slice(0, 2000) }));
  update(bizId, (s) => ({
    ...s,
    pending: true,
    messages: [...s.messages, { id: `${Date.now()}-${++seq}`, role: 'user', text: q, at: Date.now() }, { id: `${Date.now()}-${++seq}`, role: 'assistant', text: '', streaming: true, at: Date.now() }],
  }));
  const ctrl = new AbortController();
  controllers.set(bizId, ctrl);
  try {
    const res = await fetch(`/api/businesses/${bizId}/chat/stream`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' },
      body: JSON.stringify({ question: q, history }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const problem = await res.json().catch(() => ({}));
      if (res.status === 401) window.dispatchEvent(new CustomEvent(AUTH_EVENT));
      if (res.status === 402) window.dispatchEvent(new CustomEvent(PLAN_EVENT, { detail: { requiredPlan: problem.detail?.requiredPlan ?? 'pro', message: problem.title } }));
      throw new Error(res.status === 429 ? 'You have asked a lot of questions this hour - please try again a little later.' : problem.title || `Front Desk is unavailable (${res.status}).`);
    }
    await readEvents(res.body, (type, data) => {
      if (type === 'meta') patchLast(bizId, { topics: data.topics, sources: data.sources });
      else if (type === 'delta') patchLast(bizId, (m) => ({ text: m.text + data.text }));
      else if (type === 'done') patchLast(bizId, { text: data.answer, followUps: data.followUps, method: data.method, cached: data.cached, streaming: false });
      else if (type === 'error') patchLast(bizId, { text: data.message, error: true, streaming: false });
    });
    patchLast(bizId, { streaming: false });
  } catch (err) {
    if (err.name === 'AbortError') patchLast(bizId, (m) => ({ streaming: false, text: m.text ? `${m.text}\n\n*(stopped)*` : 'Stopped.', stopped: true }));
    else patchLast(bizId, { text: err.message || 'Front Desk could not answer right now.', error: true, streaming: false });
  } finally {
    controllers.delete(bizId);
    update(bizId, (s) => ({ ...s, pending: false, unread: watching.has(bizId) ? 0 : s.unread + 1 }));
  }
}

// Places that show the conversation register here, so an answer that lands while nobody is
// looking can light up the "new reply" badge on the floating button.
const watching = new Map(); // bizId -> count of open views
export function watch(bizId) {
  watching.set(bizId, (watching.get(bizId) ?? 0) + 1);
  const s = load(bizId);
  if (s.unread) save(bizId, { ...s, unread: 0 });
  return () => {
    const n = (watching.get(bizId) ?? 1) - 1;
    if (n <= 0) watching.delete(bizId);
    else watching.set(bizId, n);
  };
}

export function stop(bizId) {
  controllers.get(bizId)?.abort();
}

export function reset(bizId) {
  stop(bizId);
  try {
    sessionStorage.removeItem(keyOf(bizId));
  } catch {
    // ignore
  }
  save(bizId, EMPTY);
}
