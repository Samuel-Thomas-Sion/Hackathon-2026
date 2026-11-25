from __future__ import annotations

import os
import sqlite3
import uuid
from pathlib import Path
from typing import Iterator

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = ROOT / "data" / "knowledge_base.sqlite"


class KnowledgeBase:
    def __init__(self, db_path: str | Path | None = None):
        configured = os.getenv("CLAUSEGUARD_KB_DB")
        self.db_path = Path(db_path or configured or DEFAULT_DB)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT '',
                    module TEXT NOT NULL DEFAULT 'general',
                    content TEXT NOT NULL,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS chunks (
                    id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    title TEXT NOT NULL DEFAULT '',
                    text TEXT NOT NULL,
                    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);

                CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
                    title, text, chunk_id UNINDEXED,
                    tokenize='unicode61'
                );
            """)

    @staticmethod
    def chunk_text(text: str, chunk_size: int = 1200, overlap: int = 150) -> Iterator[str]:
        normalized = " ".join(text.replace("\r", "\n").split())
        if not normalized:
            return
        start = 0
        while start < len(normalized):
            end = min(start + chunk_size, len(normalized))
            if end < len(normalized):
                split = normalized.rfind(" ", start + 400, end)
                if split != -1:
                    end = split
            chunk = normalized[start:end].strip()
            if chunk:
                yield chunk
            if end >= len(normalized):
                break
            start = max(0, end - overlap)

    def add_document(self, title: str, content: str, source: str = "", module: str = "general", metadata: str = "{}") -> dict:
        title = title.strip()
        content = " ".join(content.split())
        if not title or not content:
            raise ValueError("title and content are required")

        document_id = str(uuid.uuid4())
        chunks = list(self.chunk_text(content))
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO documents(id,title,source,module,content,metadata) VALUES(?,?,?,?,?,?)",
                (document_id, title, source.strip(), module.strip().lower() or "general", content, metadata),
            )
            for index, chunk in enumerate(chunks):
                chunk_id = str(uuid.uuid4())
                connection.execute(
                    "INSERT INTO chunks(id,document_id,chunk_index,title,text) VALUES(?,?,?,?,?)",
                    (chunk_id, document_id, index, title, chunk),
                )
                connection.execute(
                    "INSERT INTO chunks_fts(title,text,chunk_id) VALUES(?,?,?)",
                    (title, chunk, chunk_id),
                )
        return self.get_document(document_id)

    def get_document(self, document_id: str) -> dict | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM documents WHERE id=?", (document_id,)).fetchone()
            if row is None:
                return None
            count = connection.execute("SELECT COUNT(*) AS n FROM chunks WHERE document_id=?", (document_id,)).fetchone()["n"]
            return {**dict(row), "chunk_count": count}

    def list_documents(self, module: str | None = None, limit: int = 100) -> list[dict]:
        limit = max(1, min(limit, 500))
        with self._connect() as connection:
            if module:
                rows = connection.execute(
                    "SELECT d.*, (SELECT COUNT(*) FROM chunks c WHERE c.document_id=d.id) AS chunk_count "
                    "FROM documents d WHERE d.module=? ORDER BY d.created_at DESC LIMIT ?",
                    (module.lower(), limit),
                ).fetchall()
            else:
                rows = connection.execute(
                    "SELECT d.*, (SELECT COUNT(*) FROM chunks c WHERE c.document_id=d.id) AS chunk_count "
                    "FROM documents d ORDER BY d.created_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()
        return [dict(row) for row in rows]

    @staticmethod
    def _fts_query(query: str) -> str:
        terms = []
        for term in " ".join(query.split()).replace('"', '').replace("'", '').split():
            cleaned = ''.join(char for char in term if char.isalnum() or char in "_-")
            if cleaned:
                terms.append(cleaned)
        return " OR ".join(terms[:20])

    def search(self, query: str, module: str | None = None, limit: int = 5) -> list[dict]:
        query = query.strip()
        if not query:
            return []
        limit = max(1, min(limit, 20))
        fts_query = self._fts_query(query)
        if not fts_query:
            return []

        sql = """
            SELECT c.id AS chunk_id, c.text, c.title,
                   d.id AS document_id, d.source, d.module, d.metadata,
                   bm25(chunks_fts) AS rank
            FROM chunks_fts
            JOIN chunks c ON c.id = chunks_fts.chunk_id
            JOIN documents d ON d.id = c.document_id
            WHERE chunks_fts MATCH ?
        """
        parameters: list[object] = [fts_query]
        if module:
            sql += " AND d.module IN (?, 'general')"
            parameters.append(module.lower())
        sql += " ORDER BY rank ASC LIMIT ?"
        parameters.append(limit)

        with self._connect() as connection:
            rows = connection.execute(sql, parameters).fetchall()
        return [dict(row) for row in rows]

    def delete_document(self, document_id: str) -> bool:
        with self._connect() as connection:
            chunk_ids = [row["chunk_id"] for row in connection.execute(
                "SELECT id AS chunk_id FROM chunks WHERE document_id=?", (document_id,)
            ).fetchall()]
            for chunk_id in chunk_ids:
                connection.execute("DELETE FROM chunks_fts WHERE chunk_id=?", (chunk_id,))
            cursor = connection.execute("DELETE FROM documents WHERE id=?", (document_id,))
            return cursor.rowcount > 0

    def stats(self) -> dict:
        with self._connect() as connection:
            documents = connection.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
            chunks = connection.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        return {"document_count": documents, "chunk_count": chunks, "database": str(self.db_path)}
