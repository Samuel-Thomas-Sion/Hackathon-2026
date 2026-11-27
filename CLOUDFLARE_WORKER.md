# Cloudflare Worker deployment (legacy note)

The full, current Cloudflare deployment guide (Pages frontend + Worker API,
secrets, verification, and local dev) lives in **[CLOUDFLARE_DEPLOY.md](./CLOUDFLARE_DEPLOY.md)**.

Quick reference:

```bash
npm install
npx wrangler login
npx wrangler secret put GEMINI_API_KEY   # key stays a Worker secret, never committed
npx wrangler deploy                       # deploys the API Worker
npx wrangler pages deploy . --project-name=clauseguard   # deploys the static frontend
```

Then set `CLAUSEGUARD_CONFIG.API_BASE` in `clauseguard-config.js` to the Worker URL
and redeploy Pages. See `CLOUDFLARE_DEPLOY.md` for CORS lockdown and verification.