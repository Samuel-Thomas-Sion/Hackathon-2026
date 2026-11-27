// Finds and reads a website's Terms of Service and Privacy Policy.
//
// Safety rules (so the engine can't be misused to reach private places):
//  - only http/https web addresses with a real public-looking domain name
//  - no IP addresses, no "localhost", no internal names
//  - every page is size-limited and time-limited
//  - we never return raw HTML, only cleaned-up readable text
import { ApiError } from './util.js';

const FETCH_TIMEOUT_MS = 8000;
const TOTAL_BUDGET_MS = 25000; // give up after this, so visitors never wait forever
const MAX_HTML_BYTES = 1_000_000;
const MAX_TEXT_PER_PAGE = 30000;
const MIN_GOOD_TEXT = 1500;
// An honest name: some sites (e.g. WhatsApp) refuse fake "browser" names but accept this.
const USER_AGENT = 'Mozilla/5.0 (compatible; ClauseGuardBot/1.0; school project)';

const BLOCKED_SUFFIXES = ['.local', '.internal', '.lan', '.home', '.arpa', '.localhost', '.test', '.example', '.invalid', '.corp'];

export function isSafeHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host || host.length > 253) return false;
  if (host === 'localhost') return false;
  if (host.includes(':') || host.includes('[')) return false; // IPv6 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false; // IPv4 literal
  if (/^\d+$/.test(host)) return false;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return false;
  if (!/\.[a-z]{2,}$/.test(host)) return false;
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return false;
  return true;
}

export function isSafeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (url.username || url.password) return false;
    if (url.port && url.port !== '80' && url.port !== '443') return false;
    return isSafeHostname(url.hostname);
  } catch {
    return false;
  }
}

// Turns "Instagram", "instagram.com", "www.instagram.com/accounts" or a full
// link into { host: "instagram.com", url: "https://instagram.com/..." }.
export function normalizeSiteInput(input, popularSites = {}) {
  let raw = String(input || '').trim();
  if (!raw) throw new ApiError(400, 'Type a website name or link.');
  if (raw.length > 500) throw new ApiError(400, 'That link is too long.');

  // A plain name like "instagram" -> look it up in the popular list.
  if (!/[./:]/.test(raw)) {
    const name = raw.toLowerCase().replace(/\s+/g, '');
    const match = Object.entries(popularSites).find(
      ([domain, info]) => domain.split('.')[0] === name || String(info.name || '').toLowerCase().replace(/\s+/g, '') === name
    );
    raw = match ? match[0] : `${name}.com`;
  }

  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(400, "That doesn't look like a website address.");
  }
  if (!isSafeUrl(url.href)) {
    throw new ApiError(400, 'Please enter a normal public website, like instagram.com.');
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const isJustHomepage = url.pathname === '/' || url.pathname === '';
  return { host, url: url.href, isJustHomepage };
}

const ENTITY_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', hellip: '...', copy: '(c)', reg: '(R)', trade: '(TM)' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (!Number.isFinite(n) || n < 9 || n > 0x10ffff) return ' ';
      try {
        return String.fromCodePoint(n);
      } catch {
        return ' ';
      }
    }
    const value = ENTITY_MAP[code.toLowerCase()];
    return value === undefined ? whole : value;
  });
}

// Very simple HTML -> readable text. Good enough for legal pages.
export function htmlToText(html) {
  let h = String(html || '');
  h = h.replace(/<!--[\s\S]*?-->/g, ' ');
  h = h.replace(/<(script|style|noscript|svg|template|head|iframe|canvas|select|button|form)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  h = h.replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  h = h.replace(/<br\s*\/?>/gi, '\n');
  h = h.replace(/<\/(p|li|h[1-6]|div|tr|section|article|blockquote|dd|dt|table|ul|ol)\s*>/gi, '\n');
  h = h.replace(/<(p|li|h[1-6]|tr|blockquote)\b[^>]*>/gi, '\n');
  h = h.replace(/<[^>]+>/g, ' ');
  h = decodeEntities(h);
  const lines = h
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v ]+/g, ' ').trim())
    .filter((line) => line.length >= 3);
  // drop exact duplicate lines (menus repeated etc.)
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out.join('\n');
}

export function looksLikeLegalText(text) {
  if (!text || text.length < MIN_GOOD_TEXT) return false;
  const t = text.toLowerCase();
  const signals = ['terms', 'privacy', 'agree', 'personal', 'information', 'data', 'account', 'service', 'law', 'rights'];
  return signals.filter((s) => t.includes(s)).length >= 4;
}

async function fetchHtml(url, deadline = Date.now() + FETCH_TIMEOUT_MS) {
  if (!isSafeUrl(url)) return null;
  const timeLeft = Math.min(FETCH_TIMEOUT_MS, deadline - Date.now());
  if (timeLeft < 500) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeLeft);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
    });
    if (!res.ok) return null;
    if (!isSafeUrl(res.url || url)) return null; // redirected somewhere unsafe
    const type = (res.headers.get('Content-Type') || '').toLowerCase();
    if (type && !type.includes('html') && !type.includes('text/plain')) return null;

    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_HTML_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(Math.min(total, MAX_HTML_BYTES));
    let offset = 0;
    for (const c of chunks) {
      const slice = c.subarray(0, Math.max(0, bytes.length - offset));
      bytes.set(slice, offset);
      offset += slice.length;
    }
    return { html: new TextDecoder('utf-8', { fatal: false }).decode(bytes), finalUrl: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Looks for links on a page whose words suggest Terms or Privacy.
export function findPolicyLinks(html, baseUrl) {
  const links = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && links.length < 2000) {
    const href = decodeEntities(m[1]).trim();
    const text = htmlToText(m[2]).replace(/\s+/g, ' ').toLowerCase().slice(0, 120);
    let abs;
    try {
      abs = new URL(href, baseUrl).href;
    } catch {
      continue;
    }
    if (!isSafeUrl(abs)) continue;
    links.push({ url: abs, text, path: new URL(abs).pathname.toLowerCase() });
  }
  const score = (link, kind) => {
    const t = link.text;
    const p = link.path;
    let s = 0;
    if (kind === 'terms') {
      if (/terms of (service|use)|terms (and|&) conditions|user agreement|terms/.test(t)) s += 5;
      if (/conditions of use|legal/.test(t)) s += 2;
      if (/terms|tos|conditions|user-agreement|legal/.test(p)) s += 3;
      if (/privacy|cookie/.test(t + p)) s -= 4;
    } else {
      if (/privacy (policy|notice|statement)|privacy/.test(t)) s += 5;
      if (/privacy/.test(p)) s += 3;
      if (/cookie|choices|settings|ad choices/.test(t)) s -= 2;
    }
    return s;
  };
  const best = (kind) => {
    const ranked = links.map((l) => ({ ...l, s: score(l, kind) })).filter((l) => l.s >= 5).sort((a, b) => b.s - a.s);
    return ranked[0]?.url || null;
  };
  return { terms: best('terms'), privacy: best('privacy') };
}

async function readPolicyPage(url, deadline) {
  const page = await fetchHtml(url, deadline);
  if (!page) return null;
  const text = htmlToText(page.html).slice(0, MAX_TEXT_PER_PAGE);
  return looksLikeLegalText(text) ? { url: page.finalUrl, text } : null;
}

// Main entry: returns { host, pages: [{ kind, url, text }] } or pages: [] if
// nothing readable was found.
export async function fetchSiteTerms(input, popularSites = {}) {
  const site = normalizeSiteInput(input, popularSites);
  const known = popularSites[site.host] || null;
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const pages = [];
  const has = (kind) => pages.some((p) => p.kind === kind);

  const tryAdd = async (kind, url) => {
    if (!url || has(kind)) return;
    const page = await readPolicyPage(url, deadline);
    if (page && !has(kind)) pages.push({ kind, ...page });
  };
  // Try several addresses at once; keep the first one that works, in list order.
  const tryFirst = async (kind, urls) => {
    if (has(kind)) return;
    const results = await Promise.all(urls.map((u) => readPolicyPage(u, deadline)));
    const found = results.find(Boolean);
    if (found && !has(kind)) pages.push({ kind, ...found });
  };

  // 1) Someone pasted a direct link to a policy page.
  if (!site.isJustHomepage) {
    const page = await readPolicyPage(site.url, deadline);
    if (page) pages.push({ kind: /privacy/i.test(site.url) ? 'privacy' : 'terms', ...page });
  }

  // 2) Known links from data/popular-sites.json
  if (known) {
    await Promise.all([tryAdd('terms', known.terms), tryAdd('privacy', known.privacy)]);
  }

  // 3) Look on the homepage for Terms / Privacy links.
  if (pages.length < 2) {
    const home = (await fetchHtml(`https://${site.host}/`, deadline)) || (await fetchHtml(`https://www.${site.host}/`, deadline));
    if (home) {
      const links = findPolicyLinks(home.html, home.finalUrl);
      await Promise.all([tryAdd('terms', links.terms), tryAdd('privacy', links.privacy)]);
    }
  }

  // 4) Common addresses as a last try (only if the site answered at all).
  await Promise.all([
    tryFirst('terms', ['/terms', '/terms-of-service', '/legal/terms'].map((p) => `https://${site.host}${p}`)),
    tryFirst('privacy', ['/privacy', '/privacy-policy', '/legal/privacy'].map((p) => `https://${site.host}${p}`)),
  ]);

  pages.sort((a, b) => (a.kind === 'terms' ? 0 : 1) - (b.kind === 'terms' ? 0 : 1));
  return { host: site.host, name: known?.name || site.host, pages };
}

export function combinePages(pages) {
  return pages.map((p) => `=== ${p.kind === 'privacy' ? 'PRIVACY POLICY' : 'TERMS'} (${p.url}) ===\n${p.text}`).join('\n\n');
}
