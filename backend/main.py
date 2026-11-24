from __future__ import annotations

import io
import os
from pathlib import Path
from typing import Literal
import json

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

try:
    from PIL import Image
    import pytesseract
except ImportError:
    Image = None
    pytesseract = None

Module = Literal["pg", "whatsapp", "app", "bond", "home"]
ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
AI_API_KEY = os.getenv("CLAUSEGUARD_API_KEY", "").strip()
AI_MODEL = os.getenv("CLAUSEGUARD_MODEL", "gemini-2.5-flash").strip()
AI_BASE_URL = os.getenv("CLAUSEGUARD_API_BASE", "https://generativelanguage.googleapis.com/v1beta/openai/").rstrip("/")
AI_TIMEOUT = float(os.getenv("CLAUSEGUARD_AI_TIMEOUT", "30"))

app = FastAPI(title="ClauseGuard API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScanRequest(BaseModel):
    module: Module = "pg"
    text: str = Field(min_length=1, max_length=50_000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4_000)
    module: Module = "home"
    documentText: str = ""
    auditSummary: str = ""


class ChatResponse(BaseModel):
    reply: str


async def call_ai(messages: list[dict]) -> dict | None:
    if not AI_API_KEY:
        return None

    try:
        async with httpx.AsyncClient(timeout=AI_TIMEOUT) as client:
            response = await client.post(
                f"{AI_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {AI_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": AI_MODEL,
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                    "messages": messages,
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            return json.loads(content)
    except Exception:
        return None


def validate_ai_report(data: dict, source_text: str) -> dict:
    required = ("score", "riskLabel", "headline", "summary", "statutes", "redFlags", "fairClauses", "reply")
    if not isinstance(data, dict) or any(key not in data for key in required):
        raise ValueError("Incomplete AI audit response")

    clean_flags = []
    for flag in data.get("redFlags", []):
        if not isinstance(flag, dict):
            continue
        quote = normalize_grounded_text(str(flag.get("quote", "")))
        clause_number = normalize_grounded_text(str(flag.get("clauseNumber", "")))
        if not quotation_exists(source_text, quote):
            continue
        if clause_number and not clause_reference_exists(source_text, clause_number):
            continue
        clean_flags.append({
            "title": str(flag.get("title", "Potentially unfavourable term")),
            "severity": str(flag.get("severity", "MEDIUM")).upper(),
            "quote": quote,
            "clauseNumber": clause_number or "Verified passage",
            "explanation": str(flag.get("explanation", "")),
            "citation": str(flag.get("citation", "Requires case-specific verification")),
        })

    data["score"] = max(0, min(100, int(data["score"])))
    data["statutes"] = [str(item) for item in data["statutes"]][:12]
    data["fairClauses"] = [str(item) for item in data["fairClauses"]][:12]
    data["redFlags"] = clean_flags[:20]

    if not clean_flags:
        data["riskLabel"] = "NO VERIFIED RED FLAGS"
        data["headline"] = "No unsupported or unverifiable findings detected"
        data["summary"] = "The analysis found no red flag whose exact source wording could be verified in the uploaded document."

    return data


async def ai_audit(text: str, module: str) -> dict | None:
    module_names = {
        "pg": "Rental and PG lease",
        "whatsapp": "WhatsApp or cyber-scam message",
        "app": "App terms and dark patterns",
        "bond": "Student or internship bond",
    }
    prompt = f"""You are ClauseGuard's Indian consumer-law contract auditor.
Analyze the supplied {module_names.get(module, 'contract')} text.
Do not claim a law or section is authoritative unless you are reasonably certain.
This is informational, not formal legal advice.

Return ONLY valid JSON with exactly these keys:
score, riskLabel, headline, summary, statutes, redFlags, fairClauses, reply

Rules:
- ABSOLUTE: Analyse only the supplied text. Never use prior contracts or generic module examples.
- ABSOLUTE: Every red flag needs an exact verbatim quote that appears in the supplied text.
- ABSOLUTE: Every red flag needs clauseNumber, which must correspond to a real clause or heading in the supplied text.
- Never invent academic-certificate, bond, resignation, UGC, or unrelated findings.
- If no genuine concern is found, return an empty redFlags array.
- score is 0-100 safety/trust, where lower means more risky.
- redFlags is an array of objects with title, severity, clauseNumber, quote, explanation, citation.

Module: {module}
Contract text:
{text[:50000]}"""
    result = await call_ai([
        {"role": "system", "content": "You produce accurate, cautious JSON contract-audit reports for Indian users."},
        {"role": "user", "content": prompt},
    ])
    if not result:
        return None
    try:
        return validate_ai_report(result, text)
    except (ValueError, TypeError, KeyError):
        return None


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "clauseguard", "aiConfigured": bool(AI_API_KEY), "aiModel": AI_MODEL}


@app.post("/api/scan")
async def scan(req: ScanRequest):
    if text_is_unreliable_placeholder(req.text):
        raise HTTPException(
            status_code=422,
            detail="No supported document text was supplied. Upload a readable document or paste contract text.",
        )

    ai_report = await ai_audit(req.text, req.module)
    if ai_report is None:
        raise HTTPException(
            status_code=503,
            detail="Live AI analysis is unavailable. Verify the backend API key/provider and try again.",
        )
    return ai_report


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    prompt = f"""Answer as ClauseGuard, a cautious Indian consumer-law and scam-safety assistant.
Do not invent statutes. State that this is informational, not formal legal advice.

Module: {req.module}
Document text: {req.documentText[:10000]}
Active audit: {req.auditSummary}
User question: {req.message}"""
    result = await call_ai([
        {"role": "system", "content": "Return a concise, practical JSON object with a single key named reply."},
        {"role": "user", "content": prompt},
    ])
    if isinstance(result, dict) and str(result.get("reply", "")).strip():
        return ChatResponse(reply=str(result["reply"]))

    q = req.message.lower()
    if any(word in q for word in ("scam", "digital arrest", "report", "1930", "upi")):
        reply = "Never join a video call for a 'Digital Arrest' or transfer clearance money via UPI. Indian police and courts do not operate this way. Block the sender, preserve screenshots, call 1930, or report at cybercrime.gov.in."
    elif any(word in q for word in ("deposit", "pg", "landlord", "rent")):
        reply = "Under Indian Contract Act s.74 and Consumer Protection Act 2019 s.2(46), a landlord cannot forfeit 100% of a deposit merely on exit. Deductions should require unpaid bills or documented damage."
    elif any(word in q for word in ("marksheet", "certificate", "bond", "internship")):
        reply = "UGC rules prohibit institutions or employers from retaining original academic certificates. Request written verification of any bond, and challenge penalties that exceed documented training costs under Contract Act ss.27 and 74."
    elif req.auditSummary:
        reply = f"Your active audit found: {req.auditSummary}. Ask for a written revision and preserve all agreements and payment records in writing."
    else:
        reply = "Paste a clause or upload a document in the audit workspace. I can explain the likely Indian-law issue and help draft a pushback reply."

    return ChatResponse(reply=reply)


@app.post("/api/extract")
async def extract_document(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "A filename is required")

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File exceeds the 10 MB limit")

    name = file.filename.lower()
    text = ""

    if name.endswith(".txt"):
        text = content.decode("utf-8", errors="replace")
    elif name.endswith(".pdf"):
        if PdfReader is None:
            raise HTTPException(501, "PDF support is not installed")
        try:
            reader = PdfReader(io.BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as exc:
            raise HTTPException(400, f"Could not read PDF: {exc}") from exc
    elif name.endswith((".png", ".jpg", ".jpeg")):
        if Image is None or pytesseract is None:
            raise HTTPException(501, "Image OCR support is not installed")
        try:
            image = Image.open(io.BytesIO(content)).convert("RGB")
            text = pytesseract.image_to_string(image)
        except Exception as exc:
            raise HTTPException(400, f"Could not OCR image: {exc}") from exc
    else:
        raise HTTPException(415, "Supported formats: PDF, PNG, JPG, JPEG, TXT")

    text = text.strip()
    if not text:
        raise HTTPException(422, "No readable text was found in the document")
    return {"filename": file.filename, "text": text[:50_000], "chars": len(text)}


def normalize_grounded_text(text: str) -> str:
    return " ".join(text.replace("\u00a0", " ").split()).strip()


def quotation_exists(source_text: str, quote: str) -> bool:
    source = normalize_grounded_text(source_text).lower()
    quote = normalize_grounded_text(quote).lower()
    return len(quote) >= 12 and quote in source


def clause_reference_exists(source_text: str, clause_number: str) -> bool:
    if not clause_number:
        return False
    source = normalize_grounded_text(source_text).lower()
    candidate = normalize_grounded_text(clause_number).lower()
    if candidate in ("unknown", "n/a", "none", "not specified"):
        return False
    return candidate in source


def text_is_unreliable_placeholder(text: str) -> bool:
    lower = normalize_grounded_text(text).lower()
    markers = (
        "[extracted document text from",
        "please paste",
        "placeholder",
        "sample contract",
    )
    return len(lower) < 40 or any(marker in lower for marker in markers)


# Live scan failures are returned explicitly from /api/scan; no demo report is substituted.

# API routes are registered above the static mount.
app.mount("/", StaticFiles(directory=str(ROOT), html=True), name="frontend")
