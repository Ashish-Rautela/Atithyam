import { config } from '../../shared/config/env.js';
import { logger } from '../../shared/logging/logger.js';

/**
 * Minimal Gemini REST client (generativelanguage.googleapis.com v1beta) with:
 *  - JSON-schema constrained output (responseMimeType + responseSchema)
 *  - a requests-per-minute limiter shared by the whole process
 *  - retries with backoff on 429 / 5xx, and model fallback when a model name is unavailable
 * Throws GeminiUnavailable when there is no key or the quota is exhausted, so callers can fall back.
 */
export class GeminiUnavailable extends Error {}

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
let recent = []; // timestamps of recent requests
let exhaustedUntil = 0;
let workingModel = null;

export const geminiEnabled = () => Boolean(config.ai.geminiKey) && Date.now() > exhaustedUntil;

async function rateLimit() {
  for (;;) {
    const now = Date.now();
    recent = recent.filter((t) => now - t < 60_000);
    if (recent.length < Math.max(1, config.ai.rpm)) {
      recent.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, 60_000 - (now - recent[0]) + 50));
  }
}

async function callModel(model, body) {
  await rateLimit();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.ai.timeoutMs);
  try {
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': config.ai.geminiKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

let discovered = null;
let discoveredAt = 0;
/**
 * Text models this key can use (ListModels), fast "flash" models first. Used when every configured
 * model is overloaded — newer or less busy models are often available. Cached for an hour.
 */
export async function listModels({ refresh = false } = {}) {
  if (discovered && !refresh && Date.now() - discoveredAt < 3600e3) return discovered;
  const res = await fetch(`${ENDPOINT}?pageSize=200`, { headers: { 'x-goog-api-key': config.ai.geminiKey } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message ?? `ListModels HTTP ${res.status}`);
  const names = (json.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /gemini/.test(n) && !/(image|tts|audio|live|embedding|vision|computer|robotics|native)/.test(n));
  const rank = (n) => (/flash-lite/.test(n) ? 1 : /flash/.test(n) ? 0 : 2) * 100 - (Number(n.match(/(\d+(?:\.\d+)?)/)?.[1]) || 0);
  discovered = names.sort((a, b) => rank(a) - rank(b));
  discoveredAt = Date.now();
  return discovered;
}

/**
 * Generate JSON matching `schema`. Returns { data, model }.
 * `system` is the instruction; `prompt` the user content.
 */
export async function generateJson({ system, prompt, schema, temperature = 0.1, maxOutputTokens = 8192 }) {
  if (!geminiEnabled()) throw new GeminiUnavailable(config.ai.geminiKey ? 'Gemini quota exhausted for now.' : 'GEMINI_API_KEY is not set.');
  const models = [...new Set([workingModel ?? config.ai.model, config.ai.model, ...config.ai.fallbackModels].filter(Boolean))];
  const configured = models.length;
  let lastError = null;
  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    const extra = mi >= configured; // discovered model: one quick attempt each
    if (mi === configured - 1) {
      // Before the last configured model, line up other models this key can use, in case all fail.
      try {
        for (const m of (await listModels()).slice(0, 8)) if (!models.includes(m)) models.push(m);
      } catch (err) {
        logger.warn({ err: err.message }, 'Could not list Gemini models');
      }
    }
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema: schema,
        // Classification does not need deep reasoning; low thinking keeps it fast.
        // Gemini 3.x takes a thinking level (low/medium/high); 2.5 took a token budget.
        ...(/gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: 'low' } } : /2\.5-flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    };
    let simplified = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      let res;
      try {
        res = await callModel(model, body);
      } catch (err) {
        lastError = new Error(`Gemini request failed: ${err.message}`);
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      const { status, json } = res;
      if (status === 200) {
        const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
        try {
          workingModel = model;
          return { data: JSON.parse(text), model };
        } catch {
          lastError = new Error(`Gemini returned non-JSON output (finish reason ${json.candidates?.[0]?.finishReason ?? 'unknown'}).`);
          break; // try the next model
        }
      }
      const message = json.error?.message ?? `HTTP ${status}`;
      if (status === 404 || (status === 400 && /model|not found|not supported/i.test(message))) {
        lastError = new Error(`Model ${model} unavailable: ${message}`);
        break; // next model
      }
      // A model may reject an optional setting (thinking level, temperature): retry once without them.
      if (status === 400 && !simplified && /thinking|temperature|generation_?config/i.test(message)) {
        simplified = true;
        delete body.generationConfig.thinkingConfig;
        delete body.generationConfig.temperature;
        attempt--;
        continue;
      }
      if (status === 400 || status === 401 || status === 403) {
        throw new GeminiUnavailable(`Gemini rejected the request (${status}): ${message}`);
      }
      if (status === 429) {
        // Daily quota → stop using Gemini for an hour; per-minute → wait and retry.
        if (/per day|daily|quota/i.test(message) && attempt >= 1) {
          exhaustedUntil = Date.now() + 60 * 60 * 1000;
          throw new GeminiUnavailable(`Gemini quota exhausted: ${message}`);
        }
        await new Promise((r) => setTimeout(r, 15_000 * (attempt + 1)));
        lastError = new Error(message);
        continue;
      }
      // 5xx — 503 "high demand": one short retry, then move on to the next model (another model is
      // usually free); the model that last worked is tried first on the next call.
      lastError = new Error(message);
      if (workingModel === model) workingModel = null;
      if (attempt >= (extra ? 0 : 1)) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  logger.warn({ err: lastError?.message, models }, 'Gemini failed on every model');
  throw Object.assign(lastError ?? new Error('Gemini failed'), { transient: true });
}

// ------------------------------------------------------------------ streaming text (chat)
let chatRecent = [];
async function chatRateLimit() {
  const now = Date.now();
  chatRecent = chatRecent.filter((t) => now - t < 60_000);
  if (chatRecent.length >= Math.max(1, config.ai.chatRpm)) {
    throw new GeminiUnavailable('The assistant is busy right now - try again in a minute.');
  }
  chatRecent.push(now);
}

/**
 * Streams a text answer. `contents` is the Gemini conversation ([{role:'user'|'model', parts:[{text}]}]).
 * Calls onText(chunk) as text arrives; resolves { text, model }. Falls back across models only
 * before the first chunk has been sent (a half-written answer is never restarted elsewhere).
 */
export async function streamText({ system, contents, temperature = 0.4, maxOutputTokens = 1024, onText, signal }) {
  if (!geminiEnabled()) throw new GeminiUnavailable(config.ai.geminiKey ? 'Gemini quota exhausted for now.' : 'GEMINI_API_KEY is not set.');
  await chatRateLimit();
  const first = config.ai.chatModel ?? workingModel ?? config.ai.model;
  const models = [...new Set([first, config.ai.model, ...config.ai.fallbackModels].filter(Boolean))];
  let lastError = null;
  for (const model of models) {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens,
        // Chat answers come from given facts: little reasoning needed, so answers start sooner.
        ...(/gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: 'low' } } : /2\.5-flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    };
    let res;
    try {
      res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': config.ai.geminiKey },
        body: JSON.stringify(body),
        signal: signal ?? AbortSignal.timeout(config.ai.timeoutMs),
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
      continue;
    }
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const message = json.error?.message ?? `HTTP ${res.status}`;
      lastError = new Error(message);
      if (res.status === 401 || res.status === 403) throw new GeminiUnavailable(`Gemini rejected the request (${res.status}): ${message}`);
      if (res.status === 429 && /per day|daily/i.test(message)) {
        exhaustedUntil = Date.now() + 60 * 60 * 1000;
        throw new GeminiUnavailable(`Gemini quota exhausted: ${message}`);
      }
      continue; // 404 model / 400 setting / 429 per-minute / 5xx: try the next model
    }
    // Server-sent events: lines "data: {json}" separated by blank lines.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
      let cut;
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          try {
            const json = JSON.parse(line.slice(5).trim());
            const chunk = json.candidates?.[0]?.content?.parts?.map((p) => (p.thought ? '' : p.text ?? '')).join('') ?? '';
            if (chunk) {
              text += chunk;
              onText?.(chunk);
            }
          } catch {
            // keep-alive or partial line: ignore
          }
        }
      }
    }
    if (text) {
      workingModel = model;
      return { text, model };
    }
    lastError = new Error('Empty answer');
  }
  logger.warn({ err: lastError?.message }, 'Gemini chat failed on every model');
  throw Object.assign(lastError ?? new Error('Gemini failed'), { transient: true });
}

/** For tests. */
export function _resetGemini() {
  chatRecent = [];
  recent = [];
  exhaustedUntil = 0;
  workingModel = null;
}
