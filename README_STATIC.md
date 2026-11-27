# Static deployment (GitHub Pages)

This version runs entirely from static HTML and JavaScript. It does not require a Python server or hosted backend.

## Deploy

1. Push `indexOP.html`, `scanner.html`, `clauseguard-static.js`, and `backend/knowledge_contract_law.json` to GitHub.
2. Enable GitHub Pages for the repository.
3. Open the site and enter a Gemini API key when prompted.

The key is kept only in `sessionStorage` for that browser tab/session. It is not saved in the source files.

## Files

- `indexOP.html` — landing page
- `scanner.html` — audit workspace
- `clauseguard-static.js` — Gemini, chat, knowledge search, and TXT/PDF extraction
- `backend/knowledge_contract_law.json` — static knowledge base
- `presentation.html` — presentation

## Security warning

Any key entered or configured in browser JavaScript is visible to users. Restrict the Gemini key in Google AI Studio and do not use a billing-critical production key on a public static site.
