// Check the Gemini key and find a model that answers:  npm run ai:check
// 1. lists the models this key can use, 2. sends one tiny request to each candidate,
// 3. runs one Hinglish review through the app's real analysis.
import { config } from '../src/shared/config/env.js';
import { listModels } from '../src/services/analysis/gemini.js';
import { analyseReviews } from '../src/services/analysis/extractor.js';

if (!config.ai.geminiKey) {
  console.error('✗ GEMINI_API_KEY is not set in server/.env — the app will use the offline rules instead.');
  process.exit(1);
}

let models;
try {
  models = await listModels({ refresh: true });
} catch (err) {
  console.error(`✗ The key was rejected when listing models: ${err.message}`);
  process.exit(1);
}
console.log(`✓ Key accepted. ${models.length} text models available.`);

const candidates = [...new Set([config.ai.model, ...config.ai.fallbackModels, ...models.slice(0, 10)])];
console.log(`Testing ${candidates.length} models (up to 30 s each)…`);
const rows = [];
for (const model of candidates) {
  const t = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': config.ai.geminiKey },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }] }),
    signal: AbortSignal.timeout(30000),
  }).catch((err) => ({ status: err.name === 'TimeoutError' ? 'timeout' : 0, json: async () => ({ error: { message: err.message } }) }));
  const json = await res.json().catch(() => ({}));
  const row = { model, status: res.status === 200 ? 'works' : res.status, seconds: Math.round((Date.now() - t) / 100) / 10, note: res.status === 200 ? '' : (json.error?.message ?? '').slice(0, 70) };
  rows.push(row);
  console.log(`  ${row.status === 'works' ? '✓' : '✗'} ${model} — ${row.status} (${row.seconds}s) ${row.note}`);
  if (row.status === 'works' && rows.filter((r) => r.status === 'works').length >= 2) break; // enough to choose from
}
console.table(rows);
const working = rows.find((r) => r.status === 'works');
if (!working) {
  console.error('✗ No model answered right now (Google reports high demand). The app keeps working with the offline rules and retries the AI automatically every 20 minutes. Try again later.');
  process.exit(1);
}
if (working.model !== config.ai.model) {
  console.log(`→ ${config.ai.model} is busy. Put this in server/.env to use a model that answers now:\n  GEMINI_MODEL=${working.model}`);
}

const sample = [{ reviewId: 'check', platform: 'google_maps', rating5: 3, text: 'Khana bahut accha tha lekin subah garam pani nahi aaya. Parking ki dikkat hai, staff helpful tha.' }];
const { results, note } = await analyseReviews(sample);
const r = results.get('check');
if (r.method !== 'gemini') {
  console.error(`✗ The analysis request failed (${note ?? 'unknown error'}).`);
  process.exit(1);
}
console.log(`✓ Analysis works (model ${r.model}). Sample review:`);
console.log(JSON.stringify({ language: r.language, overall: r.overall, aspects: r.aspects, issues: r.issues }, null, 2));
