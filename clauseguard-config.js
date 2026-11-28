// Shared frontend configuration.
//
// API_BASE: where /api/* lives.
//   - Empty string -> same website (Cloudflare Pages Functions). This is the web version's setting.
//   - A Worker URL -> a separately deployed Cloudflare Worker, e.g.
//                     https://clauseguard-api.<your-subdomain>.workers.dev
//
// TURNSTILE_SITE_KEY: optional Cloudflare Turnstile "are you human?" check for the
// teen page. Leave empty to switch it off. (The site key is public; the matching
// SECRET key goes only into Cloudflare as TURNSTILE_SECRET.)
//
// Secrets (AI provider keys) are NEVER set here. They live only in Cloudflare
// secrets. See WEB_VERSION.md.
window.CLAUSEGUARD_CONFIG = {
  API_BASE: '',
  TURNSTILE_SITE_KEY: '',
  GEMINI_MODEL: 'gemini-3.5-flash-lite'
};
