// Small shared helpers for the ClauseGuard web API (Cloudflare Pages Functions).
// Nothing in here ever reads or logs the AI key.

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

// Only requests sent by our own website are accepted.
// Browsers always attach an Origin header to POST requests made with fetch().
// Extra origins (for example a custom domain) can be listed, comma-separated,
// in the ALLOWED_ORIGINS environment variable.
export function isAllowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const ownHost = new URL(request.url).host;
  if (originHost === ownHost) return true;
  const extra = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return extra.includes(origin);
}

export async function readJsonBody(request, maxBytes = 120000) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > maxBytes) throw new ApiError(413, 'Request is too large.');
  const raw = await request.text();
  if (raw.length > maxBytes) throw new ApiError(413, 'Request is too large.');
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON.');
  }
}

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Used to check that a quote really appears in the document:
// ignore case, curly vs straight quotes, dashes and extra spaces.
export function normalizeForMatch(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function quoteIsInDocument(quote, normalizedDocument) {
  const q = normalizeForMatch(quote).replace(/^["'\s]+|["'\s.]+$/g, '');
  return q.length >= 12 && normalizedDocument.includes(q);
}

export const LANGUAGES = {
  en: 'English',
  hi: 'Hindi (हिन्दी)',
  kn: 'Kannada (ಕನ್ನಡ)',
  ta: 'Tamil (தமிழ்)',
  te: 'Telugu (తెలుగు)',
  ml: 'Malayalam (മലയാളം)',
};

export function pickLanguage(code) {
  return Object.prototype.hasOwnProperty.call(LANGUAGES, code) ? code : 'en';
}
