import json
import re

from fastapi import APIRouter, HTTPException
from openai import APIError, OpenAI, RateLimitError
from pydantic import BaseModel

from app.config import settings
from app.database import get_connection
from app.services.prompt_guard import (
    GUARDRAIL,
    KIND_REFUSAL,
    detect_injection,
    wrap_untrusted,
)
from app.services.retriever import retrieve

router = APIRouter()


def get_client() -> OpenAI:
    return OpenAI(api_key=settings.llm_api_key, base_url=settings.llm_base_url)


def _chat_completion(**kwargs):
    """Call the LLM, translating provider errors into clean HTTP responses.

    Without this, a Groq rate-limit (e.g. the free-tier daily token cap)
    surfaces as an opaque 500 + stack trace. A 429 lets the caller show a
    "try again later" message and isolate the failure per document.
    """
    try:
        return get_client().chat.completions.create(**kwargs)
    except RateLimitError as e:
        raise HTTPException(
            status_code=429,
            detail="AI token limit reached for now. Please try again later.",
        ) from e
    except APIError as e:
        raise HTTPException(
            status_code=502, detail="AI service unavailable. Please try again."
        ) from e


def _parse_json_response(text: str) -> dict:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise ValueError(f"Could not parse JSON from: {text[:200]}") from None


class ScreenPaperRequest(BaseModel):
    document_id: str
    user_id: str
    inclusion_criteria: str
    exclusion_criteria: str


class ColumnDef(BaseModel):
    name: str
    description: str


class ExtractColumnsRequest(BaseModel):
    document_id: str
    user_id: str
    columns: list[ColumnDef]


def _normalize_for_match(text: str) -> str:
    """Collapse a string to a form that survives PDF text extraction quirks.

    Extraction inserts line breaks mid-sentence, hyphenates across line ends and
    uses typographic quotes/dashes. Normalizing both sides before comparing is
    what lets a model-returned quote be matched against the chunk it came from.
    """
    text = text.lower()
    for dash in ("‐", "‑", "‒", "–", "—"):
        text = text.replace(dash, "-")
    for quote in ("‘", "’", "‛"):
        text = text.replace(quote, "'")
    for quote in ("“", "”"):
        text = text.replace(quote, '"')
    text = text.replace("­", "")  # soft hyphen
    text = re.sub(r"-\s+", "", text)  # de-hyphenate across line breaks
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _match_key(text: str) -> str:
    """Normalize further, dropping whitespace entirely.

    PDF extraction frequently loses inter-word spaces — this paper's own
    abstract comes out of pdfplumber as "basedsolelyonattentionmechanisms".
    A model asked to quote it verbatim will usually write the spaces back in,
    because that is what the words obviously are. Comparing with spaces removed
    means such a quote still verifies as present, instead of being discarded as
    a hallucination for a difference the reader would never notice.

    Safe for the 25-char minimum enforced below: a run of that length matching
    ignoring spaces is not a coincidence.
    """
    return re.sub(r"\s+", "", _normalize_for_match(text))


def _ground_evidence(raw_evidence, rows) -> list[dict]:
    """Keep only quotes that genuinely appear in the source chunks.

    The model is asked for verbatim quotes, but nothing stops it paraphrasing.
    An unverified quote would send the PDF viewer hunting for text that isn't
    there, so each candidate is checked against the chunk content and dropped if
    it doesn't match. Survivors carry the chunk's REAL page number — never the
    page the model claimed — which is the same grounding rule extract_columns
    already applies to extracted cell values.
    """
    if not isinstance(raw_evidence, list):
        return []

    normalized_rows = [
        (chunk_id, page, content, _match_key(content)) for (content, page, chunk_id) in rows
    ]

    grounded: list[dict] = []
    seen: set = set()

    for item in raw_evidence[:6]:
        if not isinstance(item, dict):
            continue
        quote = str(item.get("quote", "")).strip()
        # Very short fragments match everywhere and highlight nothing useful.
        if len(quote) < 25:
            continue

        needle = _match_key(quote)
        match = next((r for r in normalized_rows if needle in r[3]), None)

        # Tolerate a truncated tail (the model cutting a long sentence short) by
        # retrying with the first ~60% of the quote.
        if match is None and len(needle) > 60:
            head = needle[: int(len(needle) * 0.6)]
            match = next((r for r in normalized_rows if head in r[3]), None)

        if match is None:
            continue

        key = needle[:80]
        if key in seen:
            continue
        seen.add(key)

        grounded.append(
            {
                "quote": quote,
                "page": match[1],
                "chunk_id": str(match[0]),
            }
        )
        if len(grounded) == 4:
            break

    return grounded


@router.post("/screen-paper")
def screen_paper(request: ScreenPaperRequest):
    # Inclusion/exclusion criteria are direct user input — block jailbreak attempts.
    if detect_injection(request.inclusion_criteria) or detect_injection(request.exclusion_criteria):
        raise HTTPException(status_code=400, detail=KIND_REFUSAL)

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT content, page_number, id FROM chunks WHERE document_id = %s AND user_id = %s ORDER BY chunk_index LIMIT 10",
            (request.document_id, request.user_id),
        )
        rows = cur.fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail="No content found for document")

    context = "\n\n".join(f"[Page {row[1]}]\n{row[0]}" for row in rows)

    prompt = (
        f"Based ONLY on the document excerpts below, decide if this paper meets the systematic review criteria.\n\n"
        f"Inclusion criteria:\n{wrap_untrusted('inclusion_criteria', request.inclusion_criteria)}\n\n"
        f"Exclusion criteria:\n{wrap_untrusted('exclusion_criteria', request.exclusion_criteria)}\n\n"
        f"Document excerpts:\n{wrap_untrusted('document_excerpts', context)}\n\n"
        f"Return a JSON object with exactly these fields:\n"
        f'- decision: "include", "exclude", or "maybe"\n'
        f"- reason: A short explanation of the decision (1-3 sentences)\n"
        f'- confidence: "high", "medium", or "low"\n'
        f"- evidence: An array of 1-4 objects, each with:\n"
        f"    - quote: a sentence copied WORD-FOR-WORD from the excerpts above that supports the decision.\n"
        f"             Copy it EXACTLY as written — do not paraphrase, summarise, shorten or fix typos.\n"
        f"             Each quote must be at least 25 characters long.\n"
        f"    - page: the page number shown in the [Page N] marker above that quote\n\n"
        f"Return ONLY valid JSON, no other text."
    )

    response = _chat_completion(
        model=settings.llm_model,
        messages=[
            {
                "role": "system",
                "content": "You are a systematic review assistant. Always return valid JSON only."
                + GUARDRAIL,
            },
            {"role": "user", "content": prompt},
        ],
        max_tokens=900,
        temperature=0.1,
    )

    try:
        result = _parse_json_response(response.choices[0].message.content)
        return {
            "decision": result.get("decision", "maybe"),
            "reason": result.get("reason", ""),
            "confidence": result.get("confidence", "medium"),
            "evidence": _ground_evidence(result.get("evidence"), rows),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to parse screening response: {e}"
        ) from e


@router.post("/extract-columns")
def extract_columns(request: ExtractColumnsRequest):
    # Column names/descriptions are direct user input — block jailbreak attempts.
    for col in request.columns:
        if detect_injection(col.name) or detect_injection(col.description):
            raise HTTPException(status_code=400, detail=KIND_REFUSAL)

    # Retrieve top 3 chunks per column, deduplicated for the prompt but kept
    # per-column so each extracted cell can be traced back to its source chunk.
    seen_contents: set = set()
    context_parts: list = []
    col_chunks: dict = {}  # column name -> retrieved chunks (for provenance)

    for col in request.columns:
        chunks = retrieve(
            # Q7: query with the column name AND description for stronger recall.
            question=f"{col.name}: {col.description}",
            user_id=request.user_id,
            document_ids=[request.document_id],
            top_k=3,
        )
        col_chunks[col.name] = chunks
        for chunk in chunks:
            key = chunk["content"][:100]
            if key not in seen_contents:
                seen_contents.add(key)
                context_parts.append(f"[Page {chunk['page_number']}]\n{chunk['content']}")

    if not context_parts:
        raise HTTPException(status_code=404, detail="No content found for document")

    context = "\n\n---\n\n".join(context_parts)
    columns_spec = "\n".join(f"- {col.name}: {col.description}" for col in request.columns)
    col_names = [col.name for col in request.columns]

    # Build example JSON for the prompt
    example = {
        name: {
            "value": "extracted value or Not reported",
            "confidence": "high|medium|low",
            "page": "integer or null",
        }
        for name in col_names
    }

    prompt = (
        f"Extract the following data points from the document excerpts below.\n\n"
        f"Fields to extract:\n{wrap_untrusted('field_specs', columns_spec)}\n\n"
        f"Document excerpts:\n{wrap_untrusted('document_excerpts', context)}\n\n"
        f"CRITICAL RULES:\n"
        f"- If a field is NOT present in the excerpts, return exactly the string: Not reported\n"
        f"- Never guess, infer, or use general knowledge\n"
        f"- Never return an empty string — always use Not reported if not found\n\n"
        f"Return ONLY valid JSON in this exact format:\n{json.dumps(example, indent=2)}"
    )

    response = _chat_completion(
        model=settings.llm_model,
        messages=[
            {
                "role": "system",
                "content": "You are a data extraction assistant. Return valid JSON only. Use 'Not reported' for any field not found."
                + GUARDRAIL,
            },
            {"role": "user", "content": prompt},
        ],
        max_tokens=800,
        temperature=0.0,
    )

    try:
        data = _parse_json_response(response.choices[0].message.content)

        for col in request.columns:
            # Enforce 'Not reported' for any missing or empty values
            if col.name not in data:
                data[col.name] = {"value": "Not reported", "confidence": "low", "page": None}
            cell = data[col.name]
            if not cell.get("value") or str(cell.get("value")).strip() == "":
                cell["value"] = "Not reported"
                cell["confidence"] = "low"
                cell["page"] = None

            # ── Provenance (Q8) ──
            # For real values, trace the cell back to a specific source chunk so
            # every number is explainable. The chunk's real page overrides any
            # page the LLM merely claimed.
            value = str(cell.get("value", "")).strip()
            chunks = col_chunks.get(col.name, [])
            if value and value != "Not reported" and chunks:
                claimed_page = cell.get("page")
                match = None
                # 1) the chunk that literally contains the extracted value
                for ch in chunks:
                    if value.lower() in ch["content"].lower():
                        match = ch
                        break
                # 2) the chunk on the page the LLM claimed
                if match is None and claimed_page is not None:
                    for ch in chunks:
                        if str(ch.get("page_number")) == str(claimed_page):
                            match = ch
                            break
                # 3) fall back to the top-ranked retrieved chunk
                if match is None:
                    match = chunks[0]

                cell["chunk_id"] = match["chunk_id"]
                cell["page"] = match["page_number"]  # grounded, not LLM-claimed
                cell["source_text"] = match["content"][:600]
            else:
                cell["chunk_id"] = None
                cell["source_text"] = None

        return {"data": data}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to parse extraction response: {e}"
        ) from e
