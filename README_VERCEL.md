# Deploy the backend on Vercel

## 1. Install and log in

```bash
npm install -g vercel
vercel login
```

## 2. Deploy

From the project root:

```bash
cd /workspaces/Hackathon-2026
vercel
```

Choose the current repository and accept the defaults. Create a production deployment with:

```bash
vercel --prod
```

## 3. Add environment variables

In the Vercel dashboard, open the project and add:

- `GEMINI_API_KEY`: your Gemini API key
- `GEMINI_MODEL`: `gemini-3.5-flash-lite`

Or set them with the CLI:

```bash
vercel env add GEMINI_API_KEY
vercel env add GEMINI_MODEL
```

Redeploy after adding environment variables:

```bash
vercel --prod
```

## 4. Configure the frontend

Set `clauseguard-config.js` to the Vercel deployment URL:

```javascript
window.CLAUSEGUARD_CONFIG = {
  API_BASE: 'https://YOUR-PROJECT.vercel.app'
};
```

Verify:

```text
https://YOUR-PROJECT.vercel.app/api/health
```

Do not put the Gemini API key in `clauseguard-config.js` or commit it to GitHub.
