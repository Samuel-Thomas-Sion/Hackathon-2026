# 🛡️ ClauseGuard

### Don't just accept. Understand what you're agreeing to.

ClauseGuard is an AI-powered legal awareness platform designed to help people identify potentially risky, misleading, or unfair terms before they sign an agreement, accept a service, or respond to a suspicious message.

From rental agreements and internship bonds to app policies and WhatsApp scams, ClauseGuard turns complicated text into actionable, plain-language insights.

**Read less legal jargon. Recognise more red flags. Make informed decisions.**

---

## 🚀 Explore ClauseGuard

| Resource | Description |
|---|---|
| **Main Application** | AI-powered agreement and message analysis |
| **Browser Extension** | Scan website terms and privacy policies |
| **Backend API** | FastAPI-powered analysis and document processing |
| **API Documentation** | Interactive API documentation at `/docs` |

### 🌐 Browser Extension

Want to explore ClauseGuard beyond the main web application?

Check out our dedicated Chrome and Microsoft Edge browser extension repository.

**[🧩 Explore the ClauseGuard Browser Extension →](https://github.com/IceyVibes/clauseguard)**

The extension is maintained in a separate repository and provides:

- Browser-based Terms and Conditions analysis.
- Identification of potentially concerning clauses.
- A locally running machine-learning classification system.
- A dashboard for reviewing website policies.
- Support for Chrome and Microsoft Edge.

Visit the repository for its source code, installation instructions, architecture, and technical documentation.

---

## 1. The Problem

Digital agreements have become part of everyday life.

Users routinely encounter:
- Rental agreements and PG contracts.
- Internship and employment bonds.
- Application Terms and Conditions.
- Privacy policies and data-sharing permissions.
- Suspicious messages requesting payments or personal information.

However, understanding these documents is not always straightforward.

Important provisions can be buried in lengthy documents, written in complicated legal language, or presented under circumstances that encourage users to act quickly.

A single overlooked provision could mean losing a security deposit, accepting an unreasonable financial penalty, agreeing to automatic renewals, or surrendering important contractual rights.

## 2. The Solution

ClauseGuard provides an accessible first layer of review.

Users can paste text or upload a document and receive an AI-generated analysis that highlights potentially problematic provisions.

### Core capabilities

| Feature | Description |
|---|---|
| Safety Score | A 0–100 assessment of potential contractual risk |
| Risk Classification | An overall indication of the document's risk level |
| Plain-language Analysis | Explanations of complicated provisions |
| Red Flag Detection | Identification of potentially unfair or suspicious terms |
| Clause References | Relevant passages and their associated explanations |
| Counter-Reply Generator | Suggested responses for negotiating or questioning terms |
| Contextual AI Chat | Follow-up questions based on the submitted document |
| Document Extraction | Text extraction from supported uploaded files |

### Supported scenarios

**🏠 PG and Rental Agreements**

Identify potentially problematic security deposit conditions, lock-in periods, termination provisions, maintenance obligations, and financial penalties.

**📱 WhatsApp and Cyber Scams**

Examine suspicious messages for urgency tactics, impersonation, unusual payment requests, and other potential warning signs.

**📄 Application Terms and Privacy Policies**

Understand automatic renewals, data collection permissions, cancellation restrictions, and other important provisions.

**💼 Internship and Employment Bonds**

Review training-cost recovery provisions, exit penalties, restrictive conditions, and potentially unreasonable contractual obligations.

---

## 3. How It Works

The main application follows a straightforward analysis pipeline:

1. **Submit:** Paste text or upload a supported document.
2. **Select:** Choose the relevant analysis category.
3. **Analyse:** The backend processes the submitted content using Google Gemini.
4. **Validate:** The backend checks and validates the generated response.
5. **Review:** Examine the risk score, flagged provisions, and explanations.
6. **Respond:** Use the suggested counter-reply or ask contextual follow-up questions.

### Architecture

```text
                  USER
                    |
                    v
          HTML / JavaScript Frontend
                    |
          Text Submission / Upload
                    |
                    v
             FastAPI Backend
                    |
          +---------+---------+
          |                   |
          v                   v
     Gemini API         Document Extraction
          |                   |
          +---------+---------+
                    |
                    v
           Response Validation
                    |
                    v
              SCANNER UI
                    |
          +---------+---------+
          |         |         |
          v         v         v
        Score    Red Flags  Explanation
          |         |         |
          +---------+---------+
                    |
                    v
          Counter-Reply / AI Chat
```

The main application and browser extension are maintained as separate projects with different analysis architectures.

---

## 4. Technology Stack

| Component | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Styling | Tailwind CSS |
| Backend | Python, FastAPI |
| Server | Uvicorn |
| AI Integration | Google Gemini |
| AI SDK | `google-genai` |
| PDF Processing | PyPDF |
| Image Processing | Pillow, Tesseract OCR |
| Testing | pytest |

---

## 5. Repository Structure

```text
.
├── indexOP.html
├── scanner.html
├── upfront.js
│
├── backend/
│   ├── main.py
│   └── test_main.py
│
├── requirements.txt
├── README.md
└── README_BACKEND.md
```

The main repository contains the web application and its backend. The browser extension is maintained separately.

**Extension repository:** https://github.com/IceyVibes/clauseguard

---

## 6. Installation and Setup

### Prerequisites

- Python 3.10 or newer.
- Google Gemini API key.
- Tesseract OCR (required for image-based document extraction).

### Step 1 — Clone the repository

```bash
git clone <MAIN-REPOSITORY-URL>
cd <PROJECT-DIRECTORY>
```

### Step 2 — Create a virtual environment

**Windows PowerShell**

```powershell
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
```

**Linux / macOS**

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### Step 3 — Install dependencies

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### Step 4 — Configure environment variables

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3-flash-preview
```

Replace the placeholder with your own API key.

**Never commit API keys or other secrets to GitHub.**

### Step 5 — Start the backend

```bash
python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Step 6 — Open the application

| Resource | Local URL |
|---|---|
| Landing Page | http://127.0.0.1:8000/indexOP.html |
| Scanner | http://127.0.0.1:8000/scanner.html |
| API Documentation | http://127.0.0.1:8000/docs |
| Health Check | http://127.0.0.1:8000/api/health |

---

## 7. API Reference

The backend exposes the following endpoints:

| Method | Endpoint | Function |
|---|---|---|
| GET | `/api/health` | Backend and AI health status |
| GET | `/health` | Service health check |
| POST | `/api/audit` | Analyse submitted text |
| POST | `/api/chat` | Document-aware follow-up chat |
| POST | `/api/extract` | Extract text from uploaded files |
| GET | `/api/knowledge/stats` | Knowledge-base statistics |
| POST | `/api/knowledge/documents` | Add and index documents |
| GET | `/api/knowledge/documents` | List stored documents |
| POST | `/api/knowledge/search` | Search indexed passages |
| DELETE | `/api/knowledge/documents/{document_id}` | Delete a document and its indexed chunks |

### Example API Request

```bash
curl -X POST http://127.0.0.1:8000/api/audit \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Clause 7: Tenants lose 100 percent of their security deposit for leaving early.",
    "module": "pg"
  }'
```

Supported analysis modules:

- `pg`
- `whatsapp`
- `app`
- `bond`

For the complete request and response schemas, visit `/docs` after starting the backend.

---

## 8. Running Tests

Run the backend test suite:

```bash
pytest -q
```

---

## 9. Demonstration

A typical demonstration can follow this sequence:

1. Open the ClauseGuard landing page.
2. Navigate to the scanner.
3. Select a scenario, such as a PG agreement.
4. Load a sample agreement or submit custom text.
5. Run the audit.
6. Examine the safety score and flagged clauses.
7. Review the explanations and suggested counter-reply.
8. Ask a follow-up question using the contextual chat.

For a cross-project demonstration, the browser extension can also be explored through its dedicated repository.

---

## 10. Limitations

ClauseGuard is an experimental educational prototype.

Its current limitations include:

- AI-generated explanations can be inaccurate or incomplete.
- Risk scores are indicative rather than legally authoritative.
- Legal interpretations may not account for every jurisdiction or applicable regulation.
- OCR accuracy depends on the quality of uploaded images.
- PDF extraction may not perfectly preserve document formatting.
- AI analysis depends on internet connectivity and Gemini service availability.
- False positives and false negatives are possible.

A flagged provision is not automatically illegal, and an unflagged provision is not necessarily safe.

---

## 11. Future Development

Potential areas of further development include:

- Jurisdiction-aware legal analysis, particularly Indian contract and consumer law.
- Expert-reviewed datasets and more reliable clause classification.
- Multilingual document analysis.
- Improved document comparison and version tracking.
- Downloadable audit reports.
- Privacy-conscious analysis history.
- More extensive testing for bias, robustness, and hallucinations.
- Expanded browser-extension coverage.
- Greater transparency in AI-generated risk assessments.

---

## 12. Responsible Use

ClauseGuard is an educational legal-awareness tool, not a substitute for a qualified lawyer or professional legal review.

Its purpose is to make complicated documents easier to understand, highlight provisions deserving closer attention, and encourage informed decision-making.

Users should independently verify important contractual provisions and seek professional advice before making significant legal or financial decisions.

---

## License

A formal open-source licence should be added before the project is distributed under an explicit reuse permission.

---

**ClauseGuard — Understand the terms before you accept them.**
