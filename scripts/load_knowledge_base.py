from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.knowledge_base import KnowledgeBase

DATA_FILE = ROOT / "backend" / "knowledge_contract_law.json"


def main() -> None:
    with DATA_FILE.open("r", encoding="utf-8") as handle:
        documents = json.load(handle)

    kb = KnowledgeBase()
    added = 0
    skipped = 0

    for document in documents:
        title = document["title"]
        existing = kb.list_documents(limit=500)
        matching = [
            item for item in existing
            if item["title"] == title and item["source"] == document.get("source", "")
        ]
        for item in matching:
            kb.delete_document(item["id"])

        kb.add_document(
            title=title,
            content=document["content"],
            source=document.get("source", ""),
            module=document.get("module", "general"),
            metadata=json.dumps(document.get("metadata", {}), ensure_ascii=False),
        )
        added += 1

    print(json.dumps({"added": added, "skipped_existing": skipped, "stats": kb.stats()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
