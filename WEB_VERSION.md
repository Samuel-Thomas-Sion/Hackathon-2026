# ClauseGuard — Web Version

*Version 1 · 28 Nov 2026*

Created by **Rishit Gupta, Sion Thomas, Medhas Nalam and Parth Goel** of Gaudium School, Hyderabad.

ClauseGuard has two versions:

| | Laptop version | Web version (this repository) |
|---|---|---|
| Code | `IceyVibes/clauseguard` | `clauseguard-web` |
| Runs | On our laptop, for the live demo | On Cloudflare, anyone can open it |
| Checks terms with | Our own trained model (MiniLM + classifier) | Google Gemini (free tier) |

## What's new in the web version

**Teen Check (`teen.html`)** — type any website (or tap Instagram, YouTube, Discord…) and get:

- a 🟢 / 🟡 / 🔴 verdict for teenagers, with the reason
- the minimum age, and the India under-18 rule (DPDP Act, 2023)
- plain-language points (data, photos, location, contact, ads, money, deleting your account…)
- **proof**: every point quotes the terms word-for-word. The server checks each quote against the real text and throws away any that don't match.
- tips on what you can do
- answers in English, Hindi, Kannada, Tamil, Telugu or Malayalam
- "Ask about these terms": questions in your own words, answered only from the terms

**Home page v2 (`indexOP-v2.html`)** is the team's home page made teen-first: Teen Check is in the hero and the result shows in the same frosted-glass style. On the website it opens at **`/teencheck`**.

- v1 (`indexOP.html`) is the team's original page and is the website's main address (`/`). Only the top-bar Ask AI button was removed.
- v2 also opens at **`/teencheck`** (shared links look like `/teencheck?site=discord`). `teen.html` (`/teen`) is the same feature as a plain stand-alone page.
- Both use the same `teen.js`, so a fix in one place fixes both.

## How it works

```
Browser (teen.html)
   │  POST /api/teen-check  { site: "discord" }
   ▼
Cloudflare Pages Function  (functions/api/[[path]].js → server/handlers.js)
   1. only accepts requests from our own website
   2. counts the visitor's daily limit (CG_KV)
   3. reads the site's Terms + Privacy pages   (server/terms.js)
        known links → homepage links → common addresses → saved copy → "please paste"
   4. asks Gemini using our TEEN RULES          (server/teen-rules.js)
   5. removes any point whose quote isn't really in the terms
   6. remembers the result for 7 days (no AI used for repeat checks)
   ▼
Browser shows verdict, points, quotes, tips; chat uses /api/chat
```

The Gemini key is stored only as an encrypted Cloudflare secret. It is never in the code, never in GitHub and never sent to the browser.

## Files the team can edit

| File | What it controls |
|---|---|
| `server/teen-rules.js` | **The rules for 🟢 / 🟡 / 🔴**, written in plain English |
| `data/popular-sites.json` | The quick-pick buttons and known Terms/Privacy links |
| `server/project-info.js` | The facts the “Ask ClauseGuard AI” helper may use: it answers only about the website and project |
| `data/glossary.json` | Legal words (like “arbitration”) shown with a 😎 teen version and a 📖 official meaning when you hover or tap them |
| `data/saved-sites/*.json` | Saved copies for sites that block reading (from the extension project) |
| `teen.js` → `CHAT_CHIPS` | The tap-to-ask questions |
| `teen.html` | Page wording and layout |

After editing: `npm test`, then push to GitHub and Cloudflare updates the site by itself.

## Safety built in

- Only our own website can call the API (other sites and scripts get "403").
- Daily limits per visitor: 20 site checks or audits, 10 questions about terms, and 10 questions to Ask AI; 300 AI calls for the whole site (change with `DAILY_LIMIT_PER_VISITOR`, `QUESTION_LIMIT_PER_VISITOR`, `DAILY_LIMIT_TOTAL`). Visitors are counted by a one-way hash, so no IP addresses are stored. If the counter breaks, the AI pauses rather than running without limits.
- The terms reader only opens normal public websites: no IP addresses, no `localhost`, no local files, with size and time limits.
- The AI only answers about the terms (no homework, no chatting).
- All text from websites and the AI is shown with `textContent`, never inserted as code.
- Optional "are you human?" check (Cloudflare Turnstile).

## Run the checks on your computer

```
npm install
npm test                          # 17 automatic checks, no AI or internet needed
node tools/try-site.mjs discord instagram duolingo   # see which sites can be read
```

## Put it on Cloudflare (one time, about 15 minutes)

You need a Cloudflare account, this repository on GitHub, and a **free-tier** Gemini key from aistudio.google.com (never click "Set up billing").

1. **Create the limits store.** Cloudflare dashboard → **Storage & databases → KV** → **Create** → name it `clauseguard-limits`.
2. **Create the site.** **Workers & Pages → Create → Pages → Connect to Git** → allow access to GitHub → pick `clauseguard-web`.
   - Project name: e.g. `tnccheck` (this becomes `tnccheck.pages.dev`)
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - **Save and Deploy**
3. **Add the key.** In the new project: **Settings → Variables and Secrets → Add**
   - Type: **Secret**, Name: `GEMINI_API_KEY`, Value: copy it straight from AI Studio → **Save**
4. **Connect the limits.** **Settings → Bindings → Add → KV namespace**
   - Variable name: `CG_KV`, KV namespace: `clauseguard-limits` → **Save**
5. **Redeploy** so steps 3–4 take effect: **Deployments** → latest → **⋯ → Retry deployment**.
6. **Check it.** Open `https://<project-name>.pages.dev/api/health`. You should see `"ai_configured": true` and `"daily_limits": "on"`. Then open `https://<project-name>.pages.dev/teencheck` and try Discord.

### Optional: "are you human?" check (Turnstile)

1. Cloudflare dashboard → **Turnstile → Add widget**, add your `*.pages.dev` hostname, mode **Managed**.
2. Put the **site key** (public) in `clauseguard-config.js` → `TURNSTILE_SITE_KEY`, then push.
3. Add the **secret key** in Pages **Settings → Variables and Secrets** as Secret `TURNSTILE_SECRET`, then redeploy.

## Known limits (honest list for the presentation)

- Some big apps (Facebook, Instagram, Duolingo, Canva, Roblox) block automatic reading. Facebook and Instagram use saved copies; for others ClauseGuard asks you to paste the text.
- Very long policies are trimmed (about 30,000 characters per page) before the AI reads them.
- Gemini's free tier has daily limits, and Google may use free-tier requests to improve its products, so visitors are told not to type personal details.
- Cloudflare's free plan limits how much computing one request may use. Very large pages could occasionally fail; pasting the text always works.
- AI explanations can be wrong. That's why every point shows the exact quote to check.
- This is a student project, not legal advice.

## Password-protected presentation (`/slides`)

The presentation lives at `https://<project-name>.pages.dev/slides`, behind a password.

- The slides are **encrypted with the password** (AES-256-GCM, key from PBKDF2 with 310,000 rounds) into `data/locked-deck.json`. That file is public on GitHub, but it's unreadable without the password. The password is never saved anywhere.
- The readable slide pictures and notes are kept **outside** this repository, in `../deck-source/` (slide01.png … and notes.json).
- To set or change the password, run `npm run lock-deck`, type the password twice, then commit and push `data/locked-deck.json`.
- To update the slides after editing the .pptx: export each slide as a 1920×1080 PNG into `../deck-source/` (PowerPoint: File › Export › PNG), then run `npm run lock-deck` again.
- Use a password of 10+ characters. Because the locked file is public, a short password could be guessed.
