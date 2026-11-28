// Daily limits, so strangers cannot use up the free AI allowance.
//
// Uses a Cloudflare KV namespace bound as CG_KV (free plan).
//  - Each visitor gets DAILY_LIMIT_PER_VISITOR site checks / audits per day (default 20).
//  - Each visitor gets QUESTION_LIMIT_PER_VISITOR questions per day (default 10)
//    for "Ask about these terms", and the same again for the "Ask AI" helper.
//  - The whole site gets DAILY_LIMIT_TOTAL AI calls per day (default 300).
// Visitors are counted by a one-way hash of their IP address + the date, so no
// IP address is ever stored.
//
// If CG_KV is not connected, limits are OFF (health check shows it) - connect it
// before sharing the site.
import { ApiError, sha256Hex } from './util.js';

const DAY_SECONDS = 86400;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function rateLimitEnabled(env) {
  return Boolean(env.CG_KV);
}

// Buckets: 'general' (site checks, audits), 'terms' (questions about a site's
// terms), 'site' (the Ask AI helper). Returns how many are left today, or null
// when limits are off.
const BUCKET_TEXT = {
  general: (n) => `You have used today's ${n} free checks. Please come back tomorrow.`,
  terms: (n) => `You've asked your ${n} questions about terms for today. Come back tomorrow! 👋`,
  site: (n) => `You've asked your ${n} questions for today. Come back tomorrow! 👋`,
};

export function bucketLimit(env, bucket) {
  if (bucket === 'general') return Number(env.DAILY_LIMIT_PER_VISITOR || 20);
  return Number(env.QUESTION_LIMIT_PER_VISITOR || 10);
}

export async function checkAndCountAiCall(request, env, bucket = 'general') {
  if (!rateLimitEnabled(env)) return null;
  const kv = env.CG_KV;
  const perVisitor = bucketLimit(env, bucket);
  const total = Number(env.DAILY_LIMIT_TOTAL || 300);
  const date = today();
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const visitor = (await sha256Hex(`${ip}|${date}|clauseguard`)).slice(0, 32);
  const visitorKey = bucket === 'general' ? `rl:${date}:v:${visitor}` : `rl:${date}:${bucket}:${visitor}`;

  try {
    const totalKey = `rl:${date}:all`;
    const totalNow = Number((await kv.get(totalKey)) || 0);
    if (totalNow >= total) {
      throw new ApiError(429, 'ClauseGuard has reached its free AI limit for today. Please come back tomorrow.');
    }
    const used = Number((await kv.get(visitorKey)) || 0);
    if (used >= perVisitor) throw new ApiError(429, (BUCKET_TEXT[bucket] || BUCKET_TEXT.general)(perVisitor));
    await kv.put(visitorKey, String(used + 1), { expirationTtl: DAY_SECONDS * 2 });
    await kv.put(totalKey, String(totalNow + 1), { expirationTtl: DAY_SECONDS * 2 });
    return perVisitor - used - 1;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // KV itself failed (for example its free daily write allowance ran out).
    // Fail closed: better to pause the AI than to run without limits.
    throw new ApiError(429, 'ClauseGuard is busy right now. Please try again later.');
  }
}

// Optional Cloudflare Turnstile ("are you human?") check.
// Turned on only when the TURNSTILE_SECRET secret is set.
export function turnstileEnabled(env) {
  return Boolean(env.TURNSTILE_SECRET);
}

export async function verifyTurnstile(request, env, token) {
  if (!turnstileEnabled(env)) return;
  if (!token) throw new ApiError(403, 'Please complete the human check and try again.');
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', String(token).slice(0, 2048));
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);
  let outcome = null;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    outcome = await res.json();
  } catch {
    throw new ApiError(503, 'The human check could not be verified. Please try again.');
  }
  if (!outcome?.success) throw new ApiError(403, 'The human check failed. Please reload the page and try again.');
}
