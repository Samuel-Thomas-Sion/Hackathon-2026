// Public counters, stored in the same free KV namespace (CG_KV) as the daily limits.
// Only numbers and site names (like "instagram.com") are stored - nothing about who
// checked what.
//  - sites_checked: how many DIFFERENT apps/sites have been checked (shown on the site:
//    "The fine prints of N apps & sites have been aura checked by us")
//  - terms_checked: every finished check, including repeats and pasted terms

const TOTAL_KEY = 'stats:terms_checked';
const SITES_KEY = 'stats:sites_checked';

async function bump(env, key) {
  const now = Number((await env.CG_KV.get(key)) || 0);
  await env.CG_KV.put(key, String(now + 1));
}

export async function countCheck(env, host = null) {
  if (!env.CG_KV) return;
  try {
    await bump(env, TOTAL_KEY);
    if (host) {
      const seenKey = `stats:seen:${host}`;
      if (!(await env.CG_KV.get(seenKey))) {
        await env.CG_KV.put(seenKey, '1');
        await bump(env, SITES_KEY);
      }
    }
  } catch {
    /* the counter is a nice-to-have; never break a check because of it */
  }
}

export async function readStats(env) {
  if (!env.CG_KV) return { terms_checked: 0, sites_checked: 0 };
  try {
    const [total, sites] = await Promise.all([env.CG_KV.get(TOTAL_KEY), env.CG_KV.get(SITES_KEY)]);
    return { terms_checked: Number(total || 0), sites_checked: Number(sites || 0) };
  } catch {
    return { terms_checked: 0, sites_checked: 0 };
  }
}
