# ClauseGuard backend

## Run

```bash
python3 -m pip install -r requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Open http://localhost:8000.

## AI configuration

Copy `.env.example` to `.env` and set `CLAUSEGUARD_API_KEY`. The key is loaded only by the backend and never exposed to the frontend. The configured endpoint must be OpenAI-compatible.

```env
CLAUSEGUARD_API_KEY=your_key_here
CLAUSEGUARD_MODEL=gpt-4o-mini
CLAUSEGUARD_API_BASE=https://api.openai.com/v1
```

Restart Uvicorn after changing `.env`. If the key is missing or a provider call fails, `/api/scan` and `/api/chat` use the built-in local fallback.

## Gemini AI configuration

1. Open Google AI Studio: https://aistudio.google.com/app/apikey
2. Create an API key.
3. Copy `.env.example` to `.env`.
4. Set `CLAUSEGUARD_API_KEY` to the generated key.

```env
CLAUSEGUARD_API_KEY=your_gemini_key_here
CLAUSEGUARD_MODEL=gemini-2.5-flash
CLAUSEGUARD_API_BASE=https://generativelanguage.googleapis.com/v1beta/openai
```

Do not share the key in chat or commit `.env` to Git. Restart Uvicorn after saving the key.

## API

- `GET /api/health` — health check
- `POST /api/scan` — analyze pasted text
- `POST /api/chat` — answer a context-aware question
- `POST /api/extract` — extract text from TXT, PDF, PNG, JPG, or JPEG

## Tests

```bash
pytest -q
```

PDF text extraction requires `pypdf`. Image extraction requires Pillow, Tesseract OCR, and the Tesseract binary (`tesseract`).
