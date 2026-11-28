// Run with:  npm test
// These tests never call the real AI or the real internet - fetch is faked.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleApi, cleanTeenResult } from '../server/handlers.js';
import { normalizeSiteInput, isSafeUrl, htmlToText, findPolicyLinks, looksLikeLegalText } from '../server/terms.js';
import { quoteIsInDocument, normalizeForMatch } from '../server/util.js';

const SITE = 'https://clauseguard-test.pages.dev';
const LEGAL_TEXT =
  'These Terms of Service explain your rights. You must be at least 13 years old to use the service. ' +
  'We may share your personal information with advertising partners to show you personalised ads. ' +
  'You grant us a worldwide licence to use, copy and share the content you post. ' +
  'You can delete your account at any time from Settings. Disputes will be resolved by binding arbitration. '.repeat(1) +
  'We collect data about your device, your account and how you use the service under applicable law. '.repeat(20);

// ---------- fake KV + fake assets + fake fetch
function fakeKV({ failWrites = false } = {}) {
  const store = new Map();
  return {
    store,
    async get(key, type) {
      const v = store.get(key);
      if (v === undefined) return null;
      return type === 'json' ? JSON.parse(v) : v;
    },
    async put(key, value) {
      if (failWrites) throw new Error('KV write limit');
      store.set(key, value);
    },
  };
}

const popular = JSON.parse(await readFile(new URL('../data/popular-sites.json', import.meta.url), 'utf8'));
const savedInstagram = await readFile(new URL('../data/saved-sites/instagram.com.json', import.meta.url), 'utf8');
const assets = async (path) => {
  if (path === '/data/popular-sites.json') return new Response(JSON.stringify(popular));
  if (path === '/data/saved-sites/instagram.com.json') return new Response(savedInstagram);
  return new Response('not found', { status: 404 });
};

let geminiReply = null;
let geminiCalls = 0;
const realFetch = globalThis.fetch;
beforeEach(() => {
  geminiCalls = 0;
  geminiReply = null;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://generativelanguage.googleapis.com/')) {
      geminiCalls += 1;
      assert.equal(init.headers['x-goog-api-key'], 'test-key', 'key must be sent as a header');
      assert.ok(!u.includes('test-key'), 'key must never be in the URL');
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(geminiReply) }] } }] }));
    }
    return new Response('blocked in tests', { status: 404 }); // every website "fails"
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function post(path, body, { origin = SITE, ip = '1.2.3.4' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip };
  if (origin) headers.Origin = origin;
  return new Request(`${SITE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

const GOOD_AI_REPLY = {
  verdict: 'amber',
  verdict_reason: 'Shares data with advertisers.',
  summary: 'Mostly normal, but ads use your data.',
  min_age: '13',
  min_age_quote: 'You must be at least 13 years old to use the service.',
  points: [
    { topic: 'data_shared', title: 'Ads partners', explanation: 'They share info with advertisers.', level: 'warning', quote: 'We may share your personal information with advertising partners' },
    { topic: 'photos_content', title: 'Your posts', explanation: 'They can reuse what you post.', level: 'caution', quote: 'You grant us a worldwide licence to use, copy and share the content you post.' },
    { topic: 'location', title: 'Made up', explanation: 'This quote is invented.', level: 'warning', quote: 'We track your GPS location every second of the day.' },
  ],
  tips: ['Turn off personalised ads in settings.'],
};

// ---------- site input safety
test('site names are normalised and unsafe addresses refused', () => {
  assert.equal(normalizeSiteInput('Instagram', popular).host, 'instagram.com');
  assert.equal(normalizeSiteInput('www.discord.com/terms').host, 'discord.com');
  assert.equal(normalizeSiteInput('https://www.whatsapp.com/legal').isJustHomepage, false);
  assert.equal(normalizeSiteInput('duolingo').host, 'duolingo.com');
  for (const bad of ['127.0.0.1', 'http://192.168.1.1/', 'file:///C:/secret.txt', 'http://localhost:8080', 'ftp://example.org', 'http://user:pw@example.org', 'http://[::1]/', 'intranet.local', 'http://example.org:8443/']) {
    assert.throws(() => normalizeSiteInput(bad), /normal public website|look like/, bad);
  }
  assert.equal(isSafeUrl('https://help.instagram.com/581066165581870/'), true);
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
});

test('HTML is turned into readable text without scripts or menus', () => {
  const html = '<html><head><title>x</title><script>evil()</script></head><body><nav>Menu Home About</nav><h1>Terms</h1><p>First &amp; important rule.</p><style>.a{}</style><p>Second&nbsp;rule here.</p><footer>Footer links</footer></body></html>';
  const text = htmlToText(html);
  assert.ok(text.includes('First & important rule.'));
  assert.ok(text.includes('Second rule here.'));
  assert.ok(!text.includes('evil'));
  assert.ok(!text.includes('Menu Home'));
  assert.ok(!text.includes('Footer links'));
  assert.equal(looksLikeLegalText('short'), false);
  assert.equal(looksLikeLegalText(LEGAL_TEXT), true);
});

test('policy links are found on a homepage', () => {
  const html = '<a href="/about">About</a><a href="/legal/terms-of-service">Terms of Service</a><a href="https://example.org/privacy-policy">Privacy Policy</a><a href="javascript:void(0)">Terms</a>';
  const links = findPolicyLinks(html, 'https://example.org/');
  assert.equal(links.terms, 'https://example.org/legal/terms-of-service');
  assert.equal(links.privacy, 'https://example.org/privacy-policy');
});

test('quotes must really appear in the document', () => {
  const doc = normalizeForMatch('We may share your “personal information” with partners.');
  assert.equal(quoteIsInDocument('we may share your "personal information"', doc), true);
  assert.equal(quoteIsInDocument('We sell your data to anyone', doc), false);
  assert.equal(quoteIsInDocument('We may', doc), false, 'too short to count as proof');
});

test('AI points without real proof are removed', () => {
  const result = cleanTeenResult(GOOD_AI_REPLY, LEGAL_TEXT);
  assert.equal(result.points.length, 2);
  assert.equal(result.points_without_proof_removed, 1);
  assert.equal(result.min_age, '13');
  assert.equal(cleanTeenResult({ verdict: 'purple', points: 'nope' }, LEGAL_TEXT).verdict, 'amber');
  // the vibe score always agrees with the verdict
  assert.equal(cleanTeenResult({ verdict: 'red', vibe_score: 95 }, LEGAL_TEXT).vibe_score, 34);
  assert.equal(cleanTeenResult({ verdict: 'green', vibe_score: 'lots' }, LEGAL_TEXT).vibe_score, 85);
  assert.equal(cleanTeenResult({ verdict: 'amber', tldr: 'Kinda sus but fine 👀' }, LEGAL_TEXT).tldr, 'Kinda sus but fine 👀');
});

// ---------- API protections
test('health check works and never shows the key', async () => {
  const res = await handleApi(new Request(`${SITE}/api/health`), { GEMINI_API_KEY: 'test-key' }, assets);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ai_configured, true);
  assert.ok(!JSON.stringify(body).includes('test-key'));
});

test('requests from other websites (or tools without an Origin) are refused', async () => {
  const env = { GEMINI_API_KEY: 'test-key' };
  for (const origin of [null, 'https://evil.example.com']) {
    const res = await handleApi(post('/api/teen-check', { text: LEGAL_TEXT }, { origin }), env, assets);
    assert.equal(res.status, 403);
  }
  assert.equal(geminiCalls, 0);
});

test('missing AI key gives a clear message', async () => {
  const res = await handleApi(post('/api/teen-check', { text: LEGAL_TEXT }), {}, assets);
  assert.equal(res.status, 503);
  assert.match((await res.json()).detail, /not set up/);
});

test('teen check on pasted text returns verified points', async () => {
  geminiReply = GOOD_AI_REPLY;
  const res = await handleApi(post('/api/teen-check', { text: LEGAL_TEXT, lang: 'hi' }), { GEMINI_API_KEY: 'test-key' }, assets);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.result.verdict, 'amber');
  assert.equal(body.result.points.length, 2);
  assert.equal(body.source.type, 'pasted');
  assert.equal(body.lang, 'hi');
  assert.ok(body.india_note.includes('under 18'));
});

test('a site that blocks reading falls back to the saved copy, then gets cached', async () => {
  const kv = fakeKV();
  geminiReply = { verdict: 'red', verdict_reason: 'x', summary: 'y', points: [], tips: [] };
  const env = { GEMINI_API_KEY: 'test-key', CG_KV: kv };
  const res = await handleApi(post('/api/teen-check', { site: 'instagram' }), env, assets);
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.source.type, 'saved');
  assert.equal(body.site, 'instagram.com');

  const again = await handleApi(post('/api/teen-check', { site: 'instagram.com' }), env, assets);
  assert.equal((await again.json()).from_cache, true);
  assert.equal(geminiCalls, 1, 'second check must come from the cache, not the AI');
});

test('a site that cannot be read asks the visitor to paste the terms', async () => {
  const res = await handleApi(post('/api/teen-check', { site: 'unknown-example-site.com' }), { GEMINI_API_KEY: 'test-key' }, assets);
  const body = await res.json();
  assert.equal(res.status, 422);
  assert.equal(body.needs_paste, true);
  assert.equal(geminiCalls, 0);
});

test('daily limit per visitor stops extra AI calls', async () => {
  geminiReply = GOOD_AI_REPLY;
  const env = { GEMINI_API_KEY: 'test-key', CG_KV: fakeKV(), DAILY_LIMIT_PER_VISITOR: '2' };
  const statuses = [];
  for (let i = 0; i < 3; i++) {
    const res = await handleApi(post('/api/teen-check', { text: LEGAL_TEXT }), env, assets);
    statuses.push(res.status);
  }
  assert.deepEqual(statuses, [200, 200, 429]);
  // a different visitor still gets in
  const other = await handleApi(post('/api/teen-check', { text: LEGAL_TEXT }, { ip: '5.6.7.8' }), env, assets);
  assert.equal(other.status, 200);
  // no raw IP addresses are stored
  assert.ok(![...env.CG_KV.store.keys()].some((k) => k.includes('1.2.3.4')));
});

test('if the limit counter breaks, the AI pauses instead of running unlimited', async () => {
  const env = { GEMINI_API_KEY: 'test-key', CG_KV: fakeKV({ failWrites: true }) };
  const res = await handleApi(post('/api/teen-check', { text: LEGAL_TEXT }), env, assets);
  assert.equal(res.status, 429);
  assert.equal(geminiCalls, 0);
});

test('teen chat only keeps quotes that are really in the terms', async () => {
  geminiReply = { reply: 'Yes, they share data with advertisers.', quotes: ['We may share your personal information with advertising partners', 'Totally invented sentence that is not there'] };
  const res = await handleApi(post('/api/chat', { mode: 'teen', message: 'Do they sell my data?', documentText: LEGAL_TEXT, lang: 'auto' }), { GEMINI_API_KEY: 'test-key' }, assets);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.quotes.length, 1);
});

test('questions about terms: 10 a day per person, with a counter', async () => {
  geminiReply = { reply: 'Yes.', quotes: [] };
  const env = { GEMINI_API_KEY: 'test-key', CG_KV: fakeKV() };
  const lefts = [];
  let last;
  for (let i = 0; i < 11; i++) {
    last = await handleApi(post('/api/chat', { mode: 'teen', message: 'Can they read my DMs?', documentText: LEGAL_TEXT }), env, assets);
    if (last.status === 200) lefts.push((await last.json()).questions_left);
  }
  assert.deepEqual(lefts, [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  assert.equal(last.status, 429);
  assert.match((await last.json()).detail, /10 questions/);
  // site checks are counted separately, so a check still works
  const check = await handleApi(post('/api/teen-check', { text: LEGAL_TEXT }), env, assets);
  assert.equal(check.status, 200);
});

test('Ask AI helper answers only from ClauseGuard facts, 10 a day', async () => {
  let sentPrompt = '';
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    sentPrompt = body.systemInstruction.parts[0].text + body.contents[0].parts[0].text;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ reply: 'ClauseGuard is a school project.' }) }] } }] }));
  };
  const env = { GEMINI_API_KEY: 'test-key', CG_KV: fakeKV() };
  const res = await handleApi(post('/api/chat', { mode: 'site', message: 'What is ClauseGuard?' }), env, assets);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.questions_left, 9);
  assert.match(sentPrompt, /Answer ONLY questions about the ClauseGuard website and project/);
  assert.match(sentPrompt, /tncscan\.pages\.dev/);
  for (let i = 0; i < 9; i++) await handleApi(post('/api/chat', { mode: 'site', message: 'Hi' }), env, assets);
  const blocked = await handleApi(post('/api/chat', { mode: 'site', message: 'One more?' }), env, assets);
  assert.equal(blocked.status, 429);
});

test('live counter: every finished check is counted, including saved results', async () => {
  geminiReply = { verdict: 'amber', points: [], tips: [] };
  const env = { GEMINI_API_KEY: 'test-key', CG_KV: fakeKV() };
  const stats = async () => (await handleApi(new Request(`${SITE}/api/stats`), env, assets)).json();
  const count = async () => (await stats()).terms_checked;
  assert.equal(await count(), 0);
  await handleApi(post('/api/teen-check', { text: LEGAL_TEXT }), env, assets);
  await handleApi(post('/api/teen-check', { site: 'instagram' }), env, assets);
  await handleApi(post('/api/teen-check', { site: 'instagram' }), env, assets); // from the 7-day cache
  await handleApi(post('/api/teen-check', { site: 'unknown-example-site.com' }), env, assets); // couldn't read: not counted
  assert.equal(await count(), 3);
  // different apps/sites: instagram once, however often it is checked; pasted text isn't a site
  assert.equal((await stats()).sites_checked, 1);
});

test('teen chat needs a checked document first', async () => {
  const res = await handleApi(post('/api/chat', { mode: 'teen', message: 'hi', documentText: '' }), { GEMINI_API_KEY: 'test-key' }, assets);
  assert.equal(res.status, 400);
});

test('original audit endpoint still works for the existing pages', async () => {
  geminiReply = { score: 40, risk_label: 'HIGH', title: 'Risky', summary: 's', clauses: [{ title: 't', quote: 'You can delete your account at any time from Settings.' }, { title: 'fake', quote: 'not in the text at all, made up' }], counter_reply: 'r' };
  const res = await handleApi(post('/api/audit', { text: LEGAL_TEXT, module: 'app' }), { GEMINI_API_KEY: 'test-key' }, assets);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.score, 40);
  assert.equal(body.clauses.length, 1);
});

test('human check is enforced on the teen page when switched on', async () => {
  const res = await handleApi(post('/api/teen-check', { text: LEGAL_TEXT }), { GEMINI_API_KEY: 'test-key', TURNSTILE_SECRET: 'x' }, assets);
  assert.equal(res.status, 403);
  assert.equal(geminiCalls, 0);
});
