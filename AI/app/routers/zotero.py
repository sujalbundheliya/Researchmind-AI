import json
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import get_connection
from app.routers.citations import format_all

router = APIRouter()

_EXT_RE = re.compile(r"\.(pdf|docx?|txt|bib|ris)$", re.IGNORECASE)
_NONWORD_RE = re.compile(r"[^a-z0-9]+")


def _normalize_title(s: str) -> str:
    """Normalize a title/filename for matching: drop a trailing file extension,
    lowercase, and collapse punctuation/whitespace. Lets a .bib title
    ("Attention Is All You Need") match an ingested PDF ("Attention Is All You
    Need.pdf")."""
    s = _EXT_RE.sub("", (s or "").strip())
    return _NONWORD_RE.sub(" ", s.lower()).strip()


class ZoteroImportRequest(BaseModel):
    user_id: str
    filename: str
    content: str
    format: str  # 'ris' or 'bib'


def _parse_ris(content: str) -> list:
    try:
        import io

        import rispy

        entries = rispy.load(io.StringIO(content))
        result = []
        for entry in entries:
            title = (entry.get("title") or entry.get("primary_title") or "").strip()
            if not title:
                continue
            authors_raw = entry.get("authors") or entry.get("first_authors") or []
            authors = [a.strip() for a in authors_raw if a.strip()]
            year = str(entry.get("year") or entry.get("publication_year") or "")
            journal = (entry.get("journal_name") or entry.get("secondary_title") or "").strip()
            volume = str(entry.get("volume") or "")
            issue = str(entry.get("number") or "")
            start = str(entry.get("start_page") or "")
            end = str(entry.get("end_page") or "")
            pages = f"{start}–{end}" if start and end else start or end
            doi = str(entry.get("doi") or "")
            result.append(
                {
                    "title": title,
                    "authors": authors,
                    "year": year,
                    "journal": journal,
                    "volume": volume,
                    "issue": issue,
                    "pages": pages,
                    "doi": doi,
                }
            )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"RIS parse error: {e}") from e


def _parse_bib(content: str) -> list:
    try:
        import bibtexparser

        bib_db = bibtexparser.loads(content)
        result = []
        for entry in bib_db.entries:
            title = entry.get("title", "").replace("{", "").replace("}", "").strip()
            if not title:
                continue
            authors_raw = entry.get("author", "")
            authors = [a.strip() for a in authors_raw.split(" and ")] if authors_raw else []
            year = entry.get("year", "")
            journal = entry.get("journal", entry.get("booktitle", ""))
            volume = entry.get("volume", "")
            issue = entry.get("number", "")
            pages = entry.get("pages", "").replace("--", "–")
            doi = entry.get("doi", "")
            result.append(
                {
                    "title": title,
                    "authors": authors,
                    "year": year,
                    "journal": journal,
                    "volume": volume,
                    "issue": issue,
                    "pages": pages,
                    "doi": doi,
                }
            )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"BibTeX parse error: {e}") from e


@router.post("/import")
def import_zotero(request: ZoteroImportRequest):
    fmt = request.format.lower().lstrip(".")
    if fmt == "ris":
        entries = _parse_ris(request.content)
    elif fmt in ("bib", "bibtex"):
        entries = _parse_bib(request.content)
    else:
        raise HTTPException(status_code=400, detail="Only .ris and .bib files supported")

    imported = 0
    skipped_duplicates = 0
    pending_pdf_upload = 0
    linked_existing = 0
    failed = 0

    with get_connection() as conn:
        cur = conn.cursor()

        # Build a normalized-title index of the user's existing documents once, so
        # each entry can match a real ingested PDF (or an earlier stub) regardless
        # of the ".pdf" extension. When several documents share a normalized title,
        # prefer ready > other real statuses (processing/failed) > pending_pdf stubs,
        # so citations land on the document the user actually works with.
        def _status_rank(status: str) -> int:
            if status == "ready":
                return 0
            if status != "pending_pdf":
                return 1
            return 2

        cur.execute(
            "SELECT id, original_name, status FROM documents WHERE user_id = %s",
            (request.user_id,),
        )
        existing = {}
        for doc_id, name, status in cur.fetchall():
            key = _normalize_title(name)
            if not key:
                continue
            prev = existing.get(key)
            if prev is None or _status_rank(status) < _status_rank(prev[1]):
                existing[key] = (doc_id, status)

        for entry in entries:
            title = entry["title"]
            key = _normalize_title(title)
            try:
                match = existing.get(key)
                if match:
                    match_id, match_status = match
                    if match_status == "pending_pdf":
                        # Already imported as a metadata-only stub — nothing new.
                        skipped_duplicates += 1
                        continue
                    # A real document with this title already exists. Backfill the
                    # Zotero citation metadata onto it, but only if it has none yet
                    # (never overwrite PDF-derived citations).
                    cur.execute("SELECT 1 FROM citations WHERE document_id = %s", (match_id,))
                    if cur.fetchone():
                        skipped_duplicates += 1
                        continue
                    citations = format_all(entry)
                    cur.execute(
                        """INSERT INTO citations (document_id, apa, mla, chicago, ieee, harvard, raw_metadata)
                           VALUES (%s, %s, %s, %s, %s, %s, %s)
                           ON CONFLICT (document_id) DO NOTHING""",
                        (
                            match_id,
                            citations["apa"],
                            citations["mla"],
                            citations["chicago"],
                            citations["ieee"],
                            citations["harvard"],
                            json.dumps(entry),
                        ),
                    )
                    linked_existing += 1
                    continue

                # No existing document — create a metadata-only stub.
                cur.execute(
                    """INSERT INTO documents
                           (user_id, workspace_id, filename, original_name, file_size_bytes, file_path, status)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)
                       RETURNING id""",
                    (request.user_id, None, title, title, 0, "", "pending_pdf"),
                )
                doc_id = cur.fetchone()[0]

                # Upsert citation metadata
                citations = format_all(entry)
                cur.execute(
                    """INSERT INTO citations (document_id, apa, mla, chicago, ieee, harvard, raw_metadata)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (document_id) DO UPDATE
                       SET apa=%s, mla=%s, chicago=%s, ieee=%s, harvard=%s, raw_metadata=%s""",
                    (
                        doc_id,
                        citations["apa"],
                        citations["mla"],
                        citations["chicago"],
                        citations["ieee"],
                        citations["harvard"],
                        json.dumps(entry),
                        citations["apa"],
                        citations["mla"],
                        citations["chicago"],
                        citations["ieee"],
                        citations["harvard"],
                        json.dumps(entry),
                    ),
                )

                # Register the new stub so a repeated title within the same file dedups.
                existing[key] = (doc_id, "pending_pdf")
                imported += 1
                pending_pdf_upload += 1

            except Exception as e:
                print(f"Failed to import entry '{title}': {e}")
                failed += 1

    return {
        "imported": imported,
        "skipped_duplicates": skipped_duplicates,
        "pending_pdf_upload": pending_pdf_upload,
        "linked_existing": linked_existing,
        "failed": failed,
    }
