// Public counter: how many terms & agreements people have checked with ClauseGuard.
// Stored in the same free KV namespace (CG_KV) as the daily limits.
// Only a number is stored - nothing about who checked what.

const KEY = 'stats:terms_checked';

export async function countCheck(env) {
  if (!env.CG_KV) return;
  try {
    const now = Number((await env.CG_KV.get(KEY)) || 0);
    await env.CG_KV.put(KEY, String(now + 1));
  } catch {
    /* the counter is a nice-to-have; never break a check because of it */
  }
}

export async function readChecks(env) {
  if (!env.CG_KV) return 0;
  try {
    return Number((await env.CG_KV.get(KEY)) || 0);
  } catch {
    return 0;
  }
}
