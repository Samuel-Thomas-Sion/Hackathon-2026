from __future__ import annotations

import asyncio
import io
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Literal, Optional, Any
from contextvars import ContextVar

from dotenv import load_dotenv
from google import genai
from google.genai import types
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.knowledge_base import KnowledgeBase

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
ModelName = Literal[
    "gemini-3-flash",
    "groq-llama",
    "openrouter-qwen",
    "openrouter-deepseek",
    "groq-gpt-oss",
    "openrouter-kimi",
    "openrouter-zephyr",
]
ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
CLAUSEGUARD_API_KEY = os.getenv("CLAUSEGUARD_API_KEY", "").strip()
CLAUSEGUARD_API_BASE = os.getenv("CLAUSEGUARD_API_BASE", "").strip().rstrip("/")
AI_MODEL = os.getenv("GEMINI_MODEL", os.getenv("CLAUSEGUARD_MODEL", "gemini-3.5-flash-lite")).strip()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
AI_CONFIGURED = any((GEMINI_API_KEY, CLAUSEGUARD_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY))
AI_MODELS = {
    "gemini-3-flash": AI_MODEL,
    "groq-llama": os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip(),
    "openrouter-qwen": os.getenv("OPENROUTER_QWEN_MODEL", "qwen/qwen3-4b:free").strip(),
    "openrouter-deepseek": os.getenv("OPENROUTER_DEEPSEEK_MODEL", "deepseek/deepseek-r1-0528:free").strip(),
    "groq-gpt-oss": os.getenv("GROQ_GPT_OSS_MODEL", "openai/gpt-oss-120b").strip(),
    "openrouter-kimi": os.getenv("OPENROUTER_KIMI_MODEL", "moonshotai/kimi-k2:free").strip(),
    "openrouter-zephyr": os.getenv("OPENROUTER_ZEPHYR_MODEL", "huggingfaceh4/zephyr-7b-beta:free").strip(),
}
client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

app = FastAPI(title="ClauseGuard API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

knowledge_base = KnowledgeBase()

ACTIVE_THINKING_LEVEL: ContextVar[str] = ContextVar("active_thinking_level", default="low")
ACTIVE_MODEL: ContextVar[str] = ContextVar("active_model", default="gemini-3-flash")
AI_ERROR: ContextVar[str] = ContextVar("ai_error", default="")


def is_rate_limited(error: str) -> bool:
    lowered = error.lower()
    return any(marker in lowered for marker in ("429", "rate limit", "rate_limit", "resource_exhausted", "quota", "too many requests"))


class ScanRequest(BaseModel):
    module: Module = "pg"
    text: str = Field(min_length=1, max_length=50_000)
    thinking_level: Optional[Literal["low", "medium", "high", "ultra-high"]] = "low"
    model: ModelName = "gemini-3-flash"


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4_000)
    module: Optional[str] = "home"
    documentText: Optional[str] = ""
    auditSummary: Optional[Any] = None
    context_text: Optional[str] = ""
    audit_context: Optional[Any] = None
    thinking_level: Optional[Literal["low", "medium", "high", "ultra-high"]] = "low"
    model: ModelName = "gemini-3-flash"


class ChatResponse(BaseModel):
    reply: str


class AuditRequest(BaseModel):
    text: str = Field(min_length=1, max_length=50_000)
    module: Optional[str] = "general"
    thinking_level: Optional[Literal["low", "medium", "high", "ultra-high"]] = "low"
    model: ModelName = "gemini-3-flash"


class KnowledgeDocumentRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    content: str = Field(min_length=1, max_length=2_000_000)
    source: str = ""
    module: str = "general"
    metadata: Any = Field(default_factory=dict)


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4_000)
    module: Optional[str] = None
    limit: int = Field(default=5, ge=1, le=20)


def _openai_compatible_call(base_url: str, api_key: str, model: str, messages: list[dict]) -> dict | None:
    payload = json.dumps({
        "model": model,
        "messages": messages,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/chat/completions",
        data=payload,
        headers=headers,
        method="POST",
    )

    max_attempts = 3
    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                data = json.loads(response.read().decode("utf-8"))
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            content = content.strip()
            if content.startswith("```"):
                content = content.split("```", 2)[1]
                if content.startswith("json"):
                    content = content[4:].lstrip()
            return json.loads(content) if content else None
        except urllib.error.HTTPError as exc:
            last_error = exc
            # Retry only transient upstream failures; do not retry 4xx client errors.
            if exc.code == 429 or exc.code >= 500:
                if attempt < max_attempts:
                    time.sleep(0.4 * attempt)
                    continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last_error = exc
            if attempt < max_attempts:
                time.sleep(0.4 * attempt)
                continue
            raise
    if last_error:
        raise last_error
    return None


async def call_ai(messages: list[dict]) -> dict | None:
    selected = ACTIVE_MODEL.get()
    system_instruction = ""
    chat_messages = []
    for message in messages:
        role = message.get("role")
        content = str(message.get("content", ""))
        if role == "system":
            system_instruction = content
        else:
            chat_messages.append({"role": role or "user", "content": content})

    try:
        if selected == "gemini-3-flash":
            if CLAUSEGUARD_API_BASE and CLAUSEGUARD_API_KEY:
                return await asyncio.to_thread(
                    _openai_compatible_call,
                    CLAUSEGUARD_API_BASE,
                    CLAUSEGUARD_API_KEY,
                    AI_MODELS[selected],
                    ([{"role": "system", "content": system_instruction}] if system_instruction else []) + chat_messages,
                )

            if client is None:
                return None
            thinking_level = ACTIVE_THINKING_LEVEL.get().lower()
            gemini_level = {
                "low": types.ThinkingLevel.LOW,
                "medium": types.ThinkingLevel.HIGH,
                "high": types.ThinkingLevel.HIGH,
                "ultra-high": types.ThinkingLevel.HIGH,
            }.get(thinking_level, types.ThinkingLevel.LOW)
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=AI_MODELS[selected],
                contents="\n\n".join(str(item["content"]) for item in chat_messages),
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    temperature=0.1,
                    thinking_config=types.ThinkingConfig(thinking_level=gemini_level),
                ),
            )
            text = getattr(response, "text", "") or ""
            return json.loads(text)

        if selected in ("groq-llama", "groq-gpt-oss"):
            if not GROQ_API_KEY:
                return None
            return await asyncio.to_thread(
                _openai_compatible_call,
                "https://api.groq.com/openai/v1",
                GROQ_API_KEY,
                AI_MODELS[selected],
                ([{"role": "system", "content": system_instruction}] if system_instruction else []) + chat_messages,
            )

        if selected in ("openrouter-qwen", "openrouter-deepseek", "openrouter-kimi", "openrouter-zephyr"):
            if not OPENROUTER_API_KEY:
                return None
            return await asyncio.to_thread(
                _openai_compatible_call,
                "https://openrouter.ai/api/v1",
                OPENROUTER_API_KEY,
                AI_MODELS[selected],
                ([{"role": "system", "content": system_instruction}] if system_instruction else []) + chat_messages,
            )

    except Exception as exc:
        AI_ERROR.set(str(exc))
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
        if clause_number and clause_number.lower() not in ("message", "verified passage"):
            if not clause_reference_exists(source_text, clause_number):
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
    snapshot = str(data.get("snapshot", "")).strip()
    if not snapshot:
        snapshot = str(data.get("summary", "")).strip() or "The contract was reviewed, but a plain-language snapshot could not be generated."
    data["snapshot"] = snapshot[:1500]
    data["statutes"] = [str(item) for item in data["statutes"]][:12]
    data["fairClauses"] = [str(item) for item in data["fairClauses"]][:12]
    data["redFlags"] = clean_flags[:20]

    if not clean_flags:
        data["riskLabel"] = "NO VERIFIED RED FLAGS"
        data["headline"] = "No unsupported or unverifiable findings detected"
        data["summary"] = "The analysis found no red flag whose source wording could be verified in the uploaded document."

    return data


async def ai_audit(text: str, module: str, thinking_level: str = "low", model: str = "gemini-3-flash") -> dict | None:
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
score, riskLabel, headline, summary, snapshot, statutes, redFlags, fairClauses, reply

Rules:
- ABSOLUTE: Analyse the text use the knowledge base as a supporting text to help analyse the text given by user. Never use prior contracts or generic module examples.
- ABSOLUTE: Every red flag needs an exact or close verbatim quote that appears in the supplied text.
- ABSOLUTE: Every red flag needs clauseNumber, which must correspond to a real clause or heading in the supplied text.
- Never invent academic-certificate, bond, resignation, UGC, or unrelated findings.
- If no genuine concern is found, return an empty redFlags array.
- When the document has enough substantive clauses, return at least 4 redFlags and preferably 4-8 distinct findings.
- Split separate obligations, fees, exclusions, renewals, termination, privacy, liability, or dispute terms into separate entries.
- score is 0-100 safety/trust, where lower means more risky.
- redFlags is an array of objects with title, severity, clauseNumber, quote, explanation, citation.
- ABSOLUTE: The `snapshot` must be one clear plain-language paragraph for a non-lawyer. Explain what the contract generally means, the main obligations, and the biggest risks.
- ABSOLUTE: Do not reproduce clause, contract, law, or statute wording verbatim in `snapshot`. Refer to clauses by their number or title, and explain the concern in simple words.
- Example style: "Clause 3 gives one person sole authority to settle disputes, and this may be risky because courts do not allow that kind of one-sided control."

Module: {module}
Contract text:
{text[:50000]}"""
    model_token = ACTIVE_MODEL.set(model)
    thinking_token = ACTIVE_THINKING_LEVEL.set(thinking_level)
    try:
        result = await call_ai([
            {"role": "system", "content": "You produce accurate, cautious JSON contract-audit reports for Indian users."},
            {"role": "user", "content": prompt},
        ])
    finally:
        ACTIVE_THINKING_LEVEL.reset(thinking_token)
        ACTIVE_MODEL.reset(model_token)
    if is_rate_limited(AI_ERROR.get()):
        raise HTTPException(status_code=429, detail="Too many messages. Try again later.")

    return validate_ai_report(result, text) if isinstance(result, dict) else None


@app.post("/api/audit")
async def audit_document(req: AuditRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Input text cannot be empty.")
    ai_report = await ai_audit(req.text, req.module or "general", req.thinking_level or "low", req.model)
    if ai_report is None:
        raise HTTPException(status_code=503, detail="Live AI analysis is unavailable.")
    return {
        "score": ai_report["score"],
        "risk_label": ai_report["riskLabel"],
        "title": ai_report["headline"],
        "summary": ai_report["summary"],
        "snapshot": ai_report["snapshot"],
        "clauses": [{"quote": flag["quote"], "title": flag["title"], "severity": flag["severity"], "explanation": flag["explanation"]} for flag in ai_report["redFlags"]],
        "counter_reply": ai_report["reply"],
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    AI_ERROR.set("")
    retrieved = knowledge_base.search(req.message, module=req.module, limit=5)
    knowledge_context = "\n\n".join(f"[{item['title']}] {item['text']}" for item in retrieved) or "No matching knowledge-base material found."
    prompt = f"""Answer as LegalAID, a cautious contract and legal-information assistant.\nUse the supplied document and active audit as primary context. Explain clauses plainly and offer draft text when asked. State that this is informational, not formal legal advice.\nDocument: {(req.context_text or req.documentText or '')[:10000]}\nActive audit: {req.audit_context if req.audit_context is not None else req.auditSummary}\nKnowledge: {knowledge_context}\nQuestion: {req.message}"""
    model_token = ACTIVE_MODEL.set(req.model)
    thinking_token = ACTIVE_THINKING_LEVEL.set(req.thinking_level or "low")
    try:
        result = await call_ai([
            {"role": "system", "content": "Return concise practical JSON with one key named reply."},
            {"role": "user", "content": prompt},
        ])
    finally:
        ACTIVE_THINKING_LEVEL.reset(thinking_token)
        ACTIVE_MODEL.reset(model_token)
    if is_rate_limited(AI_ERROR.get()):
        raise HTTPException(status_code=429, detail="Too many messages. Try again later.")
    if isinstance(result, dict) and str(result.get("reply", "")).strip():
        return ChatResponse(reply=str(result["reply"]))

    q = req.message.lower()
    if any(word in q for word in ("scam", "digital arrest", "report", "1930", "upi")):
        reply = "Never join a video call for a 'Digital Arrest' or transfer clearance money via UPI. Indian police and courts do not operate this way. Block the sender, preserve screenshots, call 1930, or report at cybercrime.gov.in."
    elif any(word in q for word in ("deposit", "pg", "landlord", "rent")):
        reply = "Under Indian Contract Act s.74 and Consumer Protection Act 2019 s.2(46), a landlord cannot forfeit 100% of a deposit merely on exit. Deductions should require unpaid bills or documented damage."
    elif any(word in q for word in ("marksheet", "certificate", "bond", "internship")):
        reply = "UGC rules prohibit institutions or employers from retaining original academic certificates. Request written verification of any bond, and challenge penalties that exceed documented training costs under Contract Act ss.27 and 74."
    elif req.auditSummary or req.audit_context:
        context = req.audit_context if req.audit_context is not None else req.auditSummary
        reply = f"Your active audit found: {context}. Ask for a written revision and preserve all agreements and payment records in writing."
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
            extracted_pages = []
            for page_number, page in enumerate(reader.pages, start=1):
                page_text = page.extract_text() or ""
                page_text = " ".join(page_text.replace("\r", "\n").split())
                if page_text:
                    extracted_pages.append(f"[Page {page_number}]\n{page_text}")
            text = "\n\n".join(extracted_pages)
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
    candidate = normalize_grounded_text(quote).lower()
    return len(candidate) >= 12 and candidate in source


def clause_reference_exists(source_text: str, clause_number: str) -> bool:
    if not clause_number:
        return False
    source = normalize_grounded_text(source_text).lower()
    candidate = normalize_grounded_text(clause_number).lower()
    return candidate not in ("unknown", "n/a", "none", "not specified") and candidate in source


def text_is_unreliable_placeholder(text: str) -> bool:
    normalized = normalize_grounded_text(text).lower()
    markers = ("[extracted document text from", "please paste", "placeholder", "sample contract")
    return len(normalized) < 40 or any(marker in normalized for marker in markers)


@app.delete("/api/knowledge/documents/{document_id}")
def delete_knowledge_document(document_id: str):
    if not knowledge_base.delete_document(document_id):
        raise HTTPException(status_code=404, detail="Knowledge document not found")
    return {"deleted": True, "document_id": document_id}


@app.get("/api/knowledge/stats")
def knowledge_stats():
    return knowledge_base.stats()


@app.post("/api/knowledge/documents")
def add_knowledge_document(req: KnowledgeDocumentRequest):
    try:
        document = knowledge_base.add_document(
            title=req.title,
            content=req.content,
            source=req.source,
            module=req.module,
            metadata=json.dumps(req.metadata, ensure_ascii=False),
        )
        return document
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/knowledge/documents")
def list_knowledge_documents(module: Optional[str] = None, limit: int = 100):
    return knowledge_base.list_documents(module=module, limit=limit)


@app.post("/api/knowledge/search")
def search_knowledge(req: KnowledgeSearchRequest):
    return {
        "query": req.query,
        "results": knowledge_base.search(req.query, module=req.module, limit=req.limit),
    }


@app.get("/")
@app.get("/index.html")
def serve_homepage():
    return FileResponse(ROOT / "indexOP.html")


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "clauseguard-api"}


app.mount("/", StaticFiles(directory=str(ROOT), html=True), name="frontend")


