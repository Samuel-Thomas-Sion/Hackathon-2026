# 🛡️ ClauseGuard

ClauseGuard is a student-hackathon prototype that helps people review rental agreements, suspicious WhatsApp messages, app terms, and internship or job bonds. It uses a FastAPI backend and Google Gemini to translate selected text into a plain-language safety report with a risk score, relevant clauses, and a suggested counter-reply.

This is an educational awareness tool, not legal advice and not a production legal-analysis system. Results can be inaccurate or incomplete, and human review remains necessary.

## 1. Project overview

**Problem:** Signing up, paying a deposit, accepting an app subscription, or responding to an urgent message often takes seconds, while understanding every condition can take much longer. Important clauses may contain one-sided penalties, automatic renewals, deposit-forfeiture rules, privacy permissions, or scam tactics.

**Solution:** ClauseGuard sends the user's pasted text or uploaded document to a live backend for analysis. It then presents:

- A 0–100 safety score
- An overall risk level
- A plain-language explanation
- Exact passages identified as concerns
- Clause-specific explanations
- A suggested pushback or counter-reply
- A contextual follow-up chat

The application is designed for four common scenarios:

- **PG and rental leases**
- **WhatsApp and cyber-scam messages**
- **App terms and privacy policies**
- **Internship or job bonds**

ClauseGuard does not replace reading the agreement. It gives users a reason to pause and shows them where to begin.

## 2. Live demo

1. Open the landing page.
2. Choose the scanner.
3. Select a scenario or paste document text.
4. Run the live audit.
5. Review the risk score and highlighted clauses.
6. Use the plain-language snapshot and counter-reply draft.
7. Ask a follow-up question in the document-aware chat.

A raw PG lease, scam message, app terms example, or internship bond is also available from the scanner for a quick demonstration.

## 3. Architecture

```text
User
  |
  | Paste text or upload a file
  v
Browser frontend
  |
  | POST /api/audit or /api/chat
  v
FastAPI backend
  |
  | Gemini API request
  v
Google Gemini
  |
  | Structured JSON response
  v
Backend validation
  |
  v
Scanner UI
  - Safety score
  - Risk label
  - Plain-language summary
  - Flagged clauses
  - Counter-reply
  - Follow-up chat
```

The frontend is a responsive HTML/JavaScript interface served by FastAPI. The backend calls Google Gemini and validates AI results before sending them to the browser.

For extracted document text, the backend also performs grounding checks so a reported red flag is not accepted unless its quote and clause reference can be found in the supplied text.

## 4. Repository structure

```text
.
├── indexOP.html          # Landing page
├── scanner.html          # Audit and follow-up workspace
├── upfront.js            # Visual effects
├── backend/
│   ├── main.py           # FastAPI routes and AI integration
│   └── test_main.py      # Backend tests
├── requirements.txt      # Python dependencies
├── README.md             # Judge-facing project overview
└── README_BACKEND.md     # Additional backend notes
```

## 5. Technology

| Component | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript, Tailwind CSS |
| Backend | Python, FastAPI |
| Server | Uvicorn |
| AI | Google Gemini through `google-genai` |
| PDF extraction | PyPDF |
| Image OCR | Pillow and Tesseract |
| Testing | pytest |

## 6. Native setup

### Prerequisites

- Python 3.10 or newer
- A Google Gemini API key
- Tesseract OCR if image upload is needed

### Linux/macOS

```bash
cd Hackathon-2026
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3-flash-preview
```

Start the server:

```bash
python3 -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Windows PowerShell

```powershell
cd Hackathon-2026
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Create `.env`, add the same Gemini settings, and start Uvicorn:

```powershell
python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Demo URLs

- **Landing page:** http://127.0.0.1:8000/indexOP.html
- **Scanner:** http://127.0.0.1:8000/scanner.html
- **API documentation:** http://127.0.0.1:8000/docs
- **Health endpoint:** http://127.0.0.1:8000/api/health

The top-right gear menu in the scanner allows the backend URL and `/api/audit` and `/api/chat` routes to be adjusted.

## 7. API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Check backend and AI status |
| `GET` | `/health` | Check service status |
| `POST` | `/api/audit` | Analyze pasted text |
| `POST` | `/api/chat` | Answer a follow-up question with document context |
| `POST` | `/api/extract` | Extract text from TXT, PDF, PNG, JPG, or JPEG uploads |

Example audit request:

```bash
curl -X POST http://127.0.0.1:8000/api/audit \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Clause 7: Tenants lose 100 percent of the security deposit for leaving early.",
    "module": "pg"
  }'
```

The supported `module` values are `pg`, `whatsapp`, `app`, and `bond`.

## 8. Five-minute judge demo

### 0:00–0:45 — Problem

Explain that users often need to sign or pay quickly, while rental agreements, app terms, and suspicious messages contain details that are easy to overlook.

### 0:45–1:30 — Categories

Open the scanner and show the four use cases. Explain that each category changes the context sent to the AI, but the interaction remains consistent.

### 1:30–2:30 — Live rental audit

Load the PG lease sample and run the audit. Walk through:

- The overall risk score
- The plain-language explanation
- The exact deposit and lock-in clauses
- The suggested counter-reply

### 2:30–3:20 — Document grounding

Explain that the backend attempts to verify that quote and clause references appear in the submitted text before presenting them.

### 3:20–4:15 — Cross-context demo

Load the WhatsApp scam sample and show how the same interface identifies urgency tactics and requests for money or personal action.

### 4:15–5:00 — Responsible conclusion

Open the API documentation or health endpoint, then close with:

> ClauseGuard does not replace reading the agreement. It gives users a reason to pause and shows them where to begin.

## 9. Testing

Run the backend tests:

```bash
pytest -q
```

## 10. Troubleshooting

| Symptom | Check |
|---|---|
| Backend request failed | Confirm Uvicorn is running on port 8000 |
| Missing AI results | Confirm `GEMINI_API_KEY` is set and restart the server |
| Port 8000 is already in use | Stop the existing process or start Uvicorn on another port |
| CORS or connection error | Open the app from the backend URL and confirm CORS settings |
| PDF extraction fails | Install `pypdf` from `requirements.txt` |
| Image OCR fails | Install Pillow, `pytesseract`, and the Tesseract executable |
| Wrong API route | Open the scanner gear menu and verify `/api/audit` and `/api/chat` |

## 11. Limitations

- AI findings may contain mistakes or omit important context.
- Clauses are interpreted without a full jurisdiction-specific legal review.
- OCR quality depends on document image quality.
- PDF layouts can produce imperfect text extraction.
- The system depends on internet access and Gemini availability.
- Safety scores express the prototype's risk assessment, not legal certainty.
- False positives and false negatives are possible.

## 12. Responsible-AI disclaimer

ClauseGuard uses a live AI model and should not be treated as legal advice. Its purpose is to improve awareness and make text easier to understand. Users should verify important terms, preserve documents and payment records, and consult a qualified professional when needed.

## 13. Future improvements

- Expert-reviewed datasets and clause categories
- Jurisdiction-aware Indian consumer-law guidance
- Multi-language support
- Better PDF table and layout extraction
- Comparison between two versions of an agreement
- Downloadable audit reports
- Audit history with privacy controls
- Bias, robustness, and hallucination testing
- Optional on-device or locally hosted inference

## License

Add a license before public release.
