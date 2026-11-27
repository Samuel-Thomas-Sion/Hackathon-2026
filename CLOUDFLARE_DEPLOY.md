# Deploy ClauseGuard on Cloudflare

ClauseGuard runs on Cloudflare as **two separate targets**:

1. **Cloudflare Pages** — serves the static frontend (`indexOP.html`, `scanner.html`, `clauseguard-*.js`, `upfront.js`, `backend/knowledge_contract_law.json`).
2. **Cloudflare Worker** — serves the JSON API (`/api/health`, `/api/audit`, `/api/chat`) and keeps the AI provider key in a **Worker secret** (never in the repo).

```
Browser ──► Cloudflare Pages (static UI)
                 │  CLAUSEGUARD_CONFIG.API_BASE
                 ▼
           Cloudflare Worker (API + Gemini secret)
```

---

## What is deployable vs. not

| Feature | Frontend call | Cloudflare status |
|---|---|---|
| `GET /api/health` | – | ✅ Worker |
| `POST /api/audit` (AI audit) | `indexOP.html`, `scanner.html` | ✅ Worker (Gemini) |
| `POST /api/chat` (LegalAID) | `indexOP.html`, `scanner.html` | ✅ Worker (Gemini) |
| TXT / MD / **PDF** extraction | client-side (`clauseguard-api.js`, pdf.js) | ✅ Browser (no server needed) |
| `POST /api/extract` (pypdf / OCR) | not called by frontend | ⚠️ Worker returns **501** (Python-only; see below) |
| `/api/knowledge/*` (SQLite FTS5) | not called by frontend | ⚠️ Worker returns **501** (Python-only; see below) |
| Image OCR (pytesseract) | none | ❌ Not available on Workers |

**No deployed route fails silently.** The Worker returns an explicit `501` with a
migration note for the two Python-only route groups, and the frontend never calls
them (it extracts text in the browser).

### Python-only features and their Cloudflare path

- **Server-side PDF/OCR extraction** (`backend/main.py` uses `pypdf`, `Pillow`, `pytesseract`).
  Workers cannot run these native libraries. **Already replaced in practice**: the
  frontend extracts TXT/MD/PDF locally with pdf.js in `clauseguard-api.js`. The Worker
  `/api/extract` route exists only to return a clear `501`.
- **Knowledge base** (`backend/knowledge_base.py` uses SQLite + FTS5). Workers cannot
  run SQLite/FTS5. **Cloudflare-compatible alternatives**: migrate to **Cloudflare D1**
  (SQLite at the edge) or **Vectorize** for semantic retrieval, then implement
  `/api/knowledge/*` in the Worker against that binding. Until then the route returns
  `501`, and the static frontend ships its own `backend/knowledge_contract_law.json`.

---

## Prerequisites

- A Cloudflare account.
- Node.js 18+ (for Wrangler).
- A Gemini API key (Google AI Studio). **Do not paste it into any file in this repo.**

```bash
npm install          # installs wrangler (devDependency)
npx wrangler login   # browser auth
```

---

## 1. Deploy the Worker (API)

```bash
# from the repo root
npx wrangler deploy
```

This publishes `worker/src/index.js` and prints a URL like
`https://clauseguard-api.<your-subdomain>.workers.dev`.

### Set the secret (required)

```bash
npx wrangler secret put GEMINI_API_KEY
```

Paste the key only at the prompt. It is stored as an encrypted Worker secret and is
never written to disk or committed. Verify it exists:

```bash
npx wrangler secret list
```

### (Recommended) Lock CORS to your Pages origin

After the Pages site is created (step 2), edit `wrangler.toml`:

```toml
ALLOWED_ORIGIN = "https://clauseguard.pages.dev"
```

Then redeploy the Worker:

```bash
npx wrangler deploy
```

---

## 2. Deploy the frontend (Cloudflare Pages)

```bash
# from the repo root — serves the static files in place
npx wrangler pages deploy . --project-name=clauseguard
```

Cloudflare prints the Pages URL, e.g. `https://clauseguard.pages.dev`.

### Point the frontend at the Worker

Edit `clauseguard-config.js` and set `API_BASE` to the Worker URL from step 1:

```javascript
window.CLAUSEGUARD_CONFIG = {
  API_BASE: 'https://clauseguard-api.<your-subdomain>.workers.dev',
  GEMINI_MODEL: 'gemini-3.5-flash-lite'
};
```

Redeploy Pages so the change ships:

```bash
npx wrangler pages deploy . --project-name=clauseguard
```

> The same `API_BASE` is used by both `indexOP.html` and `scanner.html`
> (scanner reads it at call time). An empty `API_BASE` means "same origin"
> (local FastAPI / Vercel / Pages Functions).

---

## 3. Required Cloudflare dashboard setup (one-time)

1. **Workers → Overview** — confirm the `clauseguard-api` Worker is listed.
2. **Workers → clauseguard-api → Settings → Variables** — confirm `GEMINI_API_KEY`
   is present as a **Secret** (value hidden) and `GEMINI_MODEL` / `ALLOWED_ORIGIN`
   are present as plain variables.
3. **Workers & Pages → clauseguard (Pages)** — confirm the project exists and the
   latest deployment serves the site.
4. (Optional) **Workers → clauseguard-api → Settings → Domains & Routes** — attach a
   custom domain if you don't want the `workers.dev` URL.

---

## 4. Verify the deployment

```bash
# API health
curl https://clauseguard-api.<your-subdomain>.workers.dev/api/health
# -> {"status":"ok","service":"clauseguard-api"}

# Audit (real AI call)
curl -X POST https://clauseguard-api.<your-subdomain>.workers.dev/api/audit \
  -H 'Content-Type: application/json' \
  -d '{"text":"Clause 2: This agreement renews automatically every twelve months unless written notice is given.","module":"pg"}'

# Chat
curl -X POST https://clauseguard-api.<your-subdomain>.workers.dev/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"How do I report a digital arrest scam?","module":"whatsapp"}'

# Python-only route returns an explicit 501 (expected)
curl -o /dev/null -w '%{http_code}\n' -X POST \
  https://clauseguard-api.<your-subdomain>.workers.dev/api/extract
# -> 501
```

Then open the Pages URL in a browser, run an audit in `scanner.html`, and confirm the
chat drawer replies. The browser console should show no failed `/api/*` requests.

---

## Local development (preserved)

### Frontend + API against local FastAPI (Python)

```bash
pip install -r requirements.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
# open http://localhost:8000/  (API_BASE stays '' -> same origin)
```

### Frontend against the Worker locally

```bash
cp .dev.vars.example .dev.vars   # add your GEMINI_API_KEY locally (do not commit)
npx wrangler dev                 # serves worker/src/index.js on :8787
```

Point `clauseguard-config.js` `API_BASE` at `http://localhost:8787` while testing, then
set it back to the deployed Worker URL for production.

### Type/static checks

```bash
node --check worker/src/index.js   # syntax-check the Worker
```

---

## Secrets policy

- AI keys live **only** in Worker secrets (`wrangler secret put`) or `.dev.vars`
  for local dev (git-ignored). They are never committed.
- `.env`, `.dev.vars`, `.wrangler/`, and `node_modules/` are git-ignored.
- Do not add keys to `clauseguard-config.js` or any `*.html`/`*.js` shipped to Pages.