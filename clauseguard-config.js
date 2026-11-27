// Shared frontend configuration.
//
// API_BASE points at the backend that serves /api/audit and /api/chat.
//   - Empty string  -> same origin (local FastAPI/uvicorn, Vercel, or Pages Functions).
//   - Worker URL     -> a deployed Cloudflare Worker, e.g.
//                       https://clauseguard-api.<your-subdomain>.workers.dev
//
// Secrets (AI provider keys) are NEVER set here. They live only in Cloudflare
// Worker secrets / environment bindings. See CLOUDFLARE_DEPLOY.md.
window.CLAUSEGUARD_CONFIG = {
  API_BASE: '',
  GEMINI_MODEL: 'gemini-3.5-flash-lite'
};