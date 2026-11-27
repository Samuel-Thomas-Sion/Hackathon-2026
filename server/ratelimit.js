// Daily limits, so strangers cannot use up the free AI allowance.
//
// Uses a Cloudflare KV namespace bound as CG_KV (free plan).
//  - Each visitor gets DAILY_LIMIT_PER_VISITOR AI calls per day (default 20).
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

async function bump(kv, key, limit) {
  const current = Number((await kv.get(key)) || 0);
  if (current >= limit) return false;
  await kv.put(key, String(current + 1), { expirationTtl: DAY_SECONDS * 2 });
  return true;
}

export async function checkAndCountAiCall(request, env) {
  if (!rateLimitEnabled(env)) return;
  const kv = env.CG_KV;
  const perVisitor = Number(env.DAILY_LIMIT_PER_VISITOR || 20);
  const total = Number(env.DAILY_LIMIT_TOTAL || 300);
  const date = today();
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const visitor = (await sha256Hex(`${ip}|${date}|clauseguard`)).slice(0, 32);

  try {
    const totalKey = `rl:${date}:all`;
    const totalNow = Number((await kv.get(totalKey)) || 0);
    if (totalNow >= total) {
      throw new ApiError(429, 'ClauseGuard has reached its free AI limit for today. Please come back tomorrow.');
    }
    const ok = await bump(kv, `rl:${date}:v:${visitor}`, perVisitor);
    if (!ok) {
      throw new ApiError(429, `You have used today's ${perVisitor} free AI checks. Please come back tomorrow.`);
    }
    await kv.put(totalKey, String(totalNow + 1), { expirationTtl: DAY_SECONDS * 2 });
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
