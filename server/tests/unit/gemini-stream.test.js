// Gemini streaming (chat) against a stubbed HTTP response - no network, no key needed.
import { describe, it, expect, vi, afterEach } from 'vitest';

process.env.GEMINI_API_KEY = 'test-key';
const { streamText, _resetGemini } = await import('../../src/services/analysis/gemini.js');
const { splitFollowUps } = await import('../../src/services/analysis/chat.js');

const sse = (chunks) => new Response(new ReadableStream({
  start(c) {
    for (const t of chunks) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\r\n\r\n`));
    c.close();
  },
}), { status: 200, headers: { 'content-type': 'text/event-stream' } });

afterEach(() => {
  vi.unstubAllGlobals();
  _resetGemini();
});

describe('Gemini chat streaming', () => {
  it('streams chunks in order and returns the full text', async () => {
    const fetchMock = vi.fn(async () => sse(['Breakfast is ', 'your weakest ', 'topic.']));
    vi.stubGlobal('fetch', fetchMock);
    const seen = [];
    const out = await streamText({ system: 's', contents: [{ role: 'user', parts: [{ text: 'q' }] }], onText: (t) => seen.push(t) });
    expect(seen).toEqual(['Breakfast is ', 'your weakest ', 'topic.']);
    expect(out.text).toBe('Breakfast is your weakest topic.');
    expect(fetchMock.mock.calls[0][0]).toMatch(/:streamGenerateContent\?alt=sse$/);
  });

  it('moves to the next model when one is unavailable', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (++n === 1 ? new Response(JSON.stringify({ error: { message: 'model not found' } }), { status: 404 }) : sse(['ok']))));
    const out = await streamText({ system: 's', contents: [] });
    expect(out.text).toBe('ok');
    expect(n).toBe(2);
  });

  it('splits the follow-up questions off the answer', () => {
    expect(splitFollowUps('Fix the geyser first.\nFOLLOW-UPS: How is breakfast? | What about staff? | Rank?')).toEqual({
      answer: 'Fix the geyser first.',
      followUps: ['How is breakfast?', 'What about staff?', 'Rank?'],
    });
    expect(splitFollowUps('No marker here.')).toEqual({ answer: 'No marker here.', followUps: [] });
  });
});
