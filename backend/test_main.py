from fastapi.testclient import TestClient

from backend.main import app, validate_ai_report
from backend.knowledge_base import KnowledgeBase

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_scan_pg(monkeypatch):
    async def fake_call_ai(messages):
        return {
            "score": 70,
            "riskLabel": "LOW VERIFIED RISK",
            "headline": "Renewal terms require review",
            "summary": "The supplied text contains an automatic renewal clause.",
            "snapshot": "The agreement renews for another year unless you give notice. This could make it harder to leave on the date you expect.",
            "statutes": ["Consumer Protection Act 2019"],
            "redFlags": [{
                "title": "Automatic renewal",
                "severity": "MEDIUM",
                "clauseNumber": "Clause 2",
                "quote": "automatic renewal every twelve months",
                "explanation": "Renewal terms should be clear.",
                "citation": "Consumer Protection Act 2019",
            }],
            "fairClauses": [],
            "reply": "Request clear renewal consent.",
        }

    monkeypatch.setattr("backend.main.call_ai", fake_call_ai)
    response = client.post("/api/scan", json={"module": "pg", "text": "Clause 2 provides for automatic renewal every twelve months unless written notice is served."})
    assert response.status_code == 200
    assert len(response.json()["redFlags"]) == 1
    assert "renew" in response.json()["snapshot"]


def test_scan_scam(monkeypatch):
    async def fake_call_ai(messages):
        return {
            "score": 8,
            "riskLabel": "CRITICAL CYBER SCAM",
            "headline": "Cyber scam indicators",
            "summary": "The supplied message contains coercive payment instructions.",
            "statutes": ["IT Act s.66D"],
            "redFlags": [{
                "title": "Payment demand",
                "severity": "CRITICAL",
                "clauseNumber": "Message",
                "quote": "Transfer money by UPI within 30 minutes.",
                "explanation": "Urgent payment demands may indicate fraud.",
                "citation": "IT Act s.66D",
            }],
            "fairClauses": [],
            "reply": "Do not transfer money. Report the incident.",
        }

    monkeypatch.setattr("backend.main.call_ai", fake_call_ai)
    response = client.post("/api/scan", json={"module": "whatsapp", "text": "Digital arrest. Transfer money by UPI within 30 minutes."})
    assert response.status_code == 200
    assert response.json()["redFlags"][0]["quote"] in "Digital arrest. Transfer money by UPI within 30 minutes."


def test_chat():
    response = client.post("/api/chat", json={"message": "How do I report a digital arrest scam?", "module": "whatsapp"})
    assert response.status_code == 200
    assert "1930" in response.json()["reply"]


def test_extract_txt():
    response = client.post("/api/extract", files={"file": ("clause.txt", b"Tenant deposit", "text/plain")})
    assert response.status_code == 200
    assert response.json()["text"] == "Tenant deposit"


def test_placeholder_is_not_contract_evidence():
    response = client.post("/api/scan", json={"module": "bond", "text": "[Extracted Document Text from contract.pdf]"})
    assert response.status_code == 422


def test_validator_discards_fabricated_marksheet_quote():
    source = "Clause 2: The Agreement renews automatically. Clause 11: Nexora may amend terms."
    ai_data = {
        "score": 20,
        "riskLabel": "HIGH",
        "headline": "Issues",
        "summary": "Problems",
        "statutes": ["UGC Mandatory Guidelines"],
        "redFlags": [{
            "title": "Certificate Retention",
            "severity": "CRITICAL",
            "clauseNumber": "Clause 1",
            "quote": "Original certificates retained for a fixed period.",
            "explanation": "Fabricated",
            "citation": "UGC",
        }],
        "fairClauses": [],
        "reply": "Review",
    }
    result = validate_ai_report(ai_data, source)
    assert result["redFlags"] == []


def test_validator_accepts_only_exact_source_quote():
    source = "Clause 2: The Agreement shall renew automatically for another twelve months."
    ai_data = {
        "score": 30,
        "riskLabel": "HIGH",
        "headline": "Renewal",
        "summary": "Automatic renewal",
        "statutes": ["Consumer Protection Act 2019"],
        "redFlags": [{
            "title": "Automatic renewal",
            "severity": "HIGH",
            "clauseNumber": "Clause 2",
            "quote": "The Agreement shall renew automatically for another twelve months.",
            "explanation": "Automatic renewal may require clear consent.",
            "citation": "Consumer Protection Act 2019",
        }],
        "fairClauses": [],
        "reply": "Request renewal consent",
    }
    result = validate_ai_report(ai_data, source)
    assert len(result["redFlags"]) == 1
    assert result["redFlags"][0]["quote"] in source


def test_knowledge_base_add_search_delete(tmp_path):
    kb = KnowledgeBase(tmp_path / "kb.sqlite")
    document = kb.add_document(
        title="Deposit guidance",
        content="Security deposits should be adjusted for documented damage and unpaid bills.",
        source="internal-guidance",
        module="pg",
    )

    assert kb.stats()["document_count"] == 1
    results = kb.search("security deposit unpaid bills", module="pg")
    assert results
    assert results[0]["document_id"] == document["id"]
    assert kb.delete_document(document["id"])
    assert kb.stats()["document_count"] == 0
