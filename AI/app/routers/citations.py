import json
import re

import httpx
import pdfplumber
from fastapi import APIRouter, HTTPException
from openai import OpenAI
from pydantic import BaseModel

from app.config import settings
from app.database import get_connection
from app.services.prompt_guard import GUARDRAIL, wrap_untrusted

router = APIRouter()

# ── DOI → Crossref (authoritative metadata, AI is only the fallback) ──
DOI_RE = re.compile(r'10\.\d{4,9}/[^\s"\'<>]+', re.IGNORECASE)


def _find_doi(text: str) -> str | None:
    m = DOI_RE.search(text)
    if not m:
        return None
    # Trim trailing punctuation that commonly clings to an inline DOI.
    return m.group(0).rstrip(".,;)]}>")


def _crossref_lookup(doi: str) -> dict | None:
    """Fetch ground-truth metadata from Crossref. Returns None on any failure."""
    try:
        resp = httpx.get(
            f"https://api.crossref.org/works/{doi}",
            headers={"User-Agent": "ResearchMindAI/1.0 (mailto:support@researchmind.ai)"},
            timeout=10.0,
        )
        if resp.status_code != 200:
            return None
        msg = resp.json().get("message", {})
    except Exception:
        return None

    def _author(a: dict) -> str:
        fam = (a.get("family") or "").strip()
        giv = (a.get("given") or "").strip()
        if fam and giv:
            return f"{fam}, {giv}"
        return fam or giv or (a.get("name") or "").strip()

    authors = [_author(a) for a in msg.get("author", []) if _author(a)]

    year = ""
    for key in ("issued", "published-print", "published-online", "created"):
        parts = (msg.get(key) or {}).get("date-parts") or []
        if parts and parts[0] and parts[0][0]:
            year = str(parts[0][0])
            break

    title_list = msg.get("title") or []
    container = msg.get("container-title") or []
    if not title_list:
        return None  # no usable title — let AI fallback try

    return {
        "title": title_list[0].strip(),
        "authors": authors,
        "year": year,
        "journal": (container[0].strip() if container else ""),
        "volume": str(msg.get("volume") or ""),
        "issue": str(msg.get("issue") or ""),
        "pages": str(msg.get("page") or ""),
        "doi": str(msg.get("DOI") or doi),
    }


# ── arXiv ID → arXiv API (authoritative for preprints, which carry no DOI) ──
ARXIV_ID_RE = re.compile(r"arXiv:\s*(\d{4}\.\d{4,5})(?:v\d+)?", re.IGNORECASE)


def _find_arxiv_id(text: str) -> str | None:
    m = ARXIV_ID_RE.search(text)
    return m.group(1) if m else None


def _arxiv_year(arxiv_id: str) -> str:
    """The first two digits of a modern arXiv ID are the submission year (YYMM)."""
    return str(2000 + int(arxiv_id[:2]))


def _arxiv_venue(arxiv_id: str) -> str:
    return f"arXiv preprint arXiv:{arxiv_id}"


def _arxiv_lookup(arxiv_id: str) -> dict | None:
    """Fetch ground-truth metadata from the arXiv export API. None on any failure."""
    try:
        resp = httpx.get(
            "https://export.arxiv.org/api/query",
            params={"id_list": arxiv_id},
            timeout=10.0,
        )
        if resp.status_code != 200:
            return None
        import xml.etree.ElementTree as ET

        ns = {"a": "http://www.w3.org/2005/Atom"}
        entry = ET.fromstring(resp.text).find("a:entry", ns)
        if entry is None:
            return None
        title = re.sub(r"\s+", " ", entry.findtext("a:title", "", ns) or "").strip()
        # The API answers unknown IDs with a stub entry titled "Error ...".
        if not title or title.lower().startswith("error"):
            return None
        authors = []
        for name_el in entry.findall("a:author/a:name", ns):
            name = (name_el.text or "").strip()
            if not name:
                continue
            first, _, last = name.rpartition(" ")
            authors.append(f"{last}, {first}" if first else last)
        published = entry.findtext("a:published", "", ns) or ""
        year = published[:4] if published[:4].isdigit() else _arxiv_year(arxiv_id)
        return {
            "title": title,
            "authors": authors,
            "year": year,
            "journal": _arxiv_venue(arxiv_id),
            "volume": "",
            "issue": "",
            "pages": "",
            "doi": "",
        }
    except Exception:
        return None


def get_client() -> OpenAI:
    return OpenAI(api_key=settings.llm_api_key, base_url=settings.llm_base_url)


# ── Citation formatters ────────────────────────────────────────────


def _initials(name: str) -> str:
    """Convert 'John Michael' → 'J. M.'"""
    return " ".join(f"{p[0]}." for p in name.strip().split() if p)


def _apa_author(author: str) -> str:
    parts = [p.strip() for p in author.split(",", 1)]
    if len(parts) == 2:
        return f"{parts[0]}, {_initials(parts[1])}"
    return author.strip()


def _mla_author(author: str) -> str:
    parts = [p.strip() for p in author.split(",", 1)]
    if len(parts) == 2:
        return f"{parts[0]}, {parts[1].strip()}"
    return author.strip()


def _meta_fields(m: dict):
    """Common field extraction. Empty-string year must render as 'n.d.', not '()'."""
    year = (m.get("year") or "").strip() or "n.d."
    title = (m.get("title") or "").strip() or "Unknown Title"
    return (
        m.get("authors") or [],
        year,
        title,
        (m.get("journal") or "").strip(),
        str(m.get("volume") or "").strip(),
        str(m.get("issue") or "").strip(),
        str(m.get("pages") or "").strip(),
    )


def fmt_apa(m: dict) -> str:
    authors, year, title, journal, volume, issue, pages = _meta_fields(m)
    doi = (m.get("doi") or "").strip()

    if not authors:
        a_str = "Unknown Author"
    elif len(authors) == 1:
        a_str = _apa_author(authors[0])
    elif len(authors) <= 20:
        # APA 7 lists every author up to 20, with '&' before the last.
        formatted = [_apa_author(a) for a in authors]
        a_str = ", ".join(formatted[:-1]) + ", & " + formatted[-1]
    else:
        # 21+ authors: first 19, ellipsis, final author.
        formatted = [_apa_author(a) for a in authors[:19]]
        a_str = ", ".join(formatted) + ", ... " + _apa_author(authors[-1])

    vol_str = f", {volume}" if volume else ""
    if issue:
        vol_str += f"({issue})"
    pages_str = f", {pages}" if pages else ""
    j_str = f" {journal}{vol_str}{pages_str}." if journal else ""
    doi_str = f" https://doi.org/{doi}" if doi else ""
    return f"{a_str} ({year}). {title}.{j_str}{doi_str}"


def fmt_mla(m: dict) -> str:
    authors, year, title, journal, volume, issue, pages = _meta_fields(m)

    if authors:
        first = _mla_author(authors[0])
        if len(authors) == 2:
            a_str = f"{first}, and {authors[1].strip()}"
        elif len(authors) > 2:
            a_str = f"{first}, et al"
        else:
            a_str = first
    else:
        a_str = "Unknown Author"

    vol_str = f", vol. {volume}" if volume else ""
    issue_str = f", no. {issue}" if issue else ""
    pages_str = f", pp. {pages}" if pages else ""
    j_str = f" {journal}{vol_str}{issue_str}, {year}{pages_str}." if journal else f" {year}."
    return f'{a_str}. "{title}."{j_str}'


def fmt_chicago(m: dict) -> str:
    authors, year, title, journal, volume, issue, pages = _meta_fields(m)

    if authors:
        first = _mla_author(authors[0])
        if len(authors) == 2:
            a_str = f"{first}, and {authors[1].strip()}"
        elif len(authors) > 2:
            a_str = f"{first}, et al"
        else:
            a_str = first
    else:
        a_str = "Unknown Author"

    vol_str = f" {volume}" if volume else ""
    issue_str = f", no. {issue}" if issue else ""
    pages_str = f": {pages}" if pages else ""
    j_str = f" {journal}{vol_str}{issue_str} ({year}){pages_str}." if journal else f" ({year})."
    return f'{a_str}. "{title}."{j_str}'


def fmt_ieee(m: dict) -> str:
    authors, year, title, journal, volume, issue, pages = _meta_fields(m)

    def _ieee_author(a: str) -> str:
        parts = [p.strip() for p in a.split(",", 1)]
        if len(parts) == 2:
            return f"{_initials(parts[1])} {parts[0]}"
        return a.strip()

    if not authors:
        a_str = "Unknown Author"
    elif len(authors) == 1:
        a_str = _ieee_author(authors[0])
    else:
        formatted = [_ieee_author(a) for a in authors]
        a_str = ", ".join(formatted[:-1]) + ", and " + formatted[-1]

    vol_str = f", vol. {volume}" if volume else ""
    issue_str = f", no. {issue}" if issue else ""
    pages_str = f", pp. {pages}" if pages else ""
    j_str = f" {journal}{vol_str}{issue_str}{pages_str}, {year}." if journal else f" {year}."
    return f'{a_str}, "{title},"{j_str}'


def fmt_harvard(m: dict) -> str:
    authors, year, title, journal, volume, issue, pages = _meta_fields(m)

    def _harvard_author(a: str) -> str:
        parts = [p.strip() for p in a.split(",", 1)]
        if len(parts) == 2:
            return f"{parts[0]}, {_initials(parts[1])}"
        return a.strip()

    if not authors:
        a_str = "Unknown Author"
    elif len(authors) == 2:
        a_str = f"{_harvard_author(authors[0])} and {_harvard_author(authors[1])}"
    elif len(authors) > 2:
        a_str = f"{_harvard_author(authors[0])} et al."
    else:
        a_str = _harvard_author(authors[0])

    vol_str = f", {volume}" if volume else ""
    if issue:
        vol_str += f"({issue})"
    pages_str = f", pp. {pages}" if pages else ""
    j_str = f", {journal}{vol_str}{pages_str}." if journal else "."
    return f"{a_str} ({year}) '{title}'{j_str}"


def format_all(meta: dict) -> dict:
    return {
        "apa": fmt_apa(meta),
        "mla": fmt_mla(meta),
        "chicago": fmt_chicago(meta),
        "ieee": fmt_ieee(meta),
        "harvard": fmt_harvard(meta),
    }


class ExtractMetadataRequest(BaseModel):
    document_id: str
    file_path: str
    user_id: str


@router.post("/extract-metadata")
def extract_metadata(request: ExtractMetadataRequest):
    # Extract first 2 pages text
    try:
        pages_text = []
        with pdfplumber.open(request.file_path) as pdf:
            for page in pdf.pages[:2]:
                text = page.extract_text() or ""
                if text.strip():
                    pages_text.append(text.strip())
            # The arXiv stamp is rotated margin text, which extract_text() drops.
            # Prepend the first page's non-upright chars so the ID survives the
            # length cap below and the LLM fallback sees it too.
            try:
                rotated = "".join(c["text"] for c in pdf.pages[0].chars if not c.get("upright"))
                if rotated.strip():
                    pages_text.insert(0, rotated.strip())
            except Exception:
                pass
        raw_text = "\n\n".join(pages_text)[:3000]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read PDF: {e}") from e

    if not raw_text:
        raise HTTPException(status_code=400, detail="Could not extract text from PDF first pages")

    meta = None
    source = "ai"

    # 1) Authoritative path: find a DOI and pull ground-truth metadata from Crossref.
    doi = _find_doi(raw_text)
    if doi:
        cr = _crossref_lookup(doi)
        if cr:
            meta = cr
            source = "crossref"

    # 2) Preprints carry no DOI but do carry an arXiv stamp — resolve it via the
    #    arXiv export API.
    arxiv_id = _find_arxiv_id(raw_text)
    if meta is None and arxiv_id:
        ax = _arxiv_lookup(arxiv_id)
        if ax:
            meta = ax
            source = "arxiv"

    # 3) Fallback: LLM extraction from the first pages (only if both lookups missed).
    if meta is None:
        response = get_client().chat.completions.create(
            model=settings.llm_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Extract bibliographic metadata from this academic paper text. "
                        "Return ONLY valid JSON with these fields: "
                        "title (string), authors (array of strings in 'Last, First' format), "
                        "year (string), journal (string), volume (string), issue (string), "
                        "pages (string), doi (string). "
                        "Use empty string for missing fields, empty array for missing authors."
                    )
                    + GUARDRAIL,
                },
                {"role": "user", "content": wrap_untrusted("document_text", raw_text)},
            ],
            max_tokens=400,
            temperature=0.0,
        )
        try:
            text = response.choices[0].message.content.strip()
            match = re.search(r"\{.*\}", text, re.DOTALL)
            meta = json.loads(match.group() if match else text)
        except Exception:
            meta = {
                "title": "Unknown",
                "authors": [],
                "year": "",
                "journal": "",
                "volume": "",
                "issue": "",
                "pages": "",
                "doi": doi or "",
            }

        # Backfill the deterministic arXiv facts the LLM commonly misses (the
        # stamp is rotated margin text): year from the ID's YYMM prefix, and the
        # preprint venue.
        if arxiv_id:
            if not (meta.get("year") or "").strip():
                meta["year"] = _arxiv_year(arxiv_id)
            if not (meta.get("journal") or "").strip():
                meta["journal"] = _arxiv_venue(arxiv_id)

    # Record provenance so the UI/user knows how the citation was derived.
    meta["source"] = source
    citations = format_all(meta)

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO citations (document_id, apa, mla, chicago, ieee, harvard, raw_metadata)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (document_id) DO UPDATE
               SET apa=%s, mla=%s, chicago=%s, ieee=%s, harvard=%s, raw_metadata=%s""",
            (
                request.document_id,
                citations["apa"],
                citations["mla"],
                citations["chicago"],
                citations["ieee"],
                citations["harvard"],
                json.dumps(meta),
                citations["apa"],
                citations["mla"],
                citations["chicago"],
                citations["ieee"],
                citations["harvard"],
                json.dumps(meta),
            ),
        )

    return {**citations, "raw_metadata": meta}


@router.get("/citations/{document_id}")
def get_citation(document_id: str):
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT apa, mla, chicago, ieee, harvard, raw_metadata FROM citations WHERE document_id = %s",
            (document_id,),
        )
        row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Citation not found")

    return {
        "apa": row[0],
        "mla": row[1],
        "chicago": row[2],
        "ieee": row[3],
        "harvard": row[4],
        "raw_metadata": row[5],
    }
