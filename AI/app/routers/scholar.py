import json

from fastapi import APIRouter, HTTPException
from openai import OpenAI
from pydantic import BaseModel

from app.config import settings
from app.database import get_connection
from app.services.profiler import ensure_tables, get_or_build_profile
from app.services.prompt_guard import GUARDRAIL, scrub_output, wrap_untrusted

router = APIRouter()

MAX_GAP_DOCS = 20  # consistent with the extraction cap

GAPS_SYSTEM_PROMPT = (
    "You are given structured JSON profiles of several research papers, including "
    "limitations and future work the authors wrote themselves. Identify research gaps "
    "across THIS SET ONLY.\n\n"
    "Format your response exactly as markdown with these four sections:\n\n"
    "## Topics Not Covered\n"
    "## Methodological Gaps\n"
    "## Future Research Areas\n"
    "## Cross-Paper Observations\n\n"
    "Rules — follow all of them:\n"
    "- Every bullet MUST cite the paper(s) it concerns using the exact form [Paper: <doc_name>].\n"
    "- Tag every bullet as (stated) if it comes from an author's own limitation/future-work, "
    "or (inferred) if you deduced it from absence/contrast across the set.\n"
    "- A bullet with no [Paper: ...] citation is not allowed.\n"
    "- If a section has no real evidence across the set, write exactly this single line under it: "
    "Insufficient evidence across the selected papers.\n"
    "- Introduce NO facts that are absent from the profiles. Never invent cross-paper links.\n"
    "- Each bullet starts with '- '. Be specific and analytical."
)


def get_client() -> OpenAI:
    return OpenAI(api_key=settings.llm_api_key, base_url=settings.llm_base_url)


class FindingsRequest(BaseModel):
    document_id: str
    user_id: str


class GapsRequest(BaseModel):
    user_id: str
    document_ids: list[str]
    refresh: bool = False


@router.post("/extract-findings")
def extract_findings(request: FindingsRequest):
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT content FROM chunks WHERE document_id = %s AND user_id = %s ORDER BY chunk_index",
            (request.document_id, request.user_id),
        )
        rows = cur.fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail="No content found for document")

    content = "\n\n".join(row[0] for row in rows)[:5000]

    response = get_client().chat.completions.create(
        model=settings.llm_model,
        messages=[
            {
                "role": "system",
                "content": (
                    "Extract key information from this research paper. "
                    "Format your response exactly as markdown with these sections:\n\n"
                    "## Research Objective\n"
                    "[1-2 sentences describing the main goal]\n\n"
                    "## Methodology\n"
                    "[bullet points describing the research methods]\n\n"
                    "## Key Findings\n"
                    "[bullet points of the main results]\n\n"
                    "## Conclusions\n"
                    "[bullet points of conclusions drawn]\n\n"
                    "## Limitations\n"
                    "[bullet points of acknowledged limitations]\n\n"
                    "Be concise and factual. Use only information from the provided text."
                )
                + GUARDRAIL,
            },
            {"role": "user", "content": wrap_untrusted("document_content", content)},
        ],
        max_tokens=1000,
        temperature=0.1,
    )

    return {"findings": scrub_output(response.choices[0].message.content.strip())}


@router.post("/research-gaps")
def research_gaps(request: GapsRequest):
    # Dedupe + cap; cross-paper analysis needs at least two distinct papers.
    unique_ids = list(dict.fromkeys(request.document_ids))
    if len(unique_ids) < 2:
        raise HTTPException(
            status_code=400, detail="Minimum 2 documents required to identify research gaps"
        )
    if len(unique_ids) > MAX_GAP_DOCS:
        raise HTTPException(
            status_code=400, detail=f"At most {MAX_GAP_DOCS} documents can be analyzed at once"
        )

    ensure_tables()
    # Cache key is order-independent so the same set always maps to one result.
    doc_key = ",".join(sorted(unique_ids))

    if not request.refresh:
        with get_connection() as conn:
            cur = conn.cursor()
            cur.execute(
                "SELECT gaps, doc_count FROM gap_analyses WHERE user_id = %s AND doc_key = %s",
                (request.user_id, doc_key),
            )
            row = cur.fetchone()
            if row:
                return {"gaps": row[0], "doc_count": row[1], "cached": True}

    # Stage 1: load (or build + cache) a structured profile per paper.
    profiles = []
    for doc_id in unique_ids:
        profile = get_or_build_profile(request.user_id, doc_id)
        if profile is not None:
            profiles.append(profile)

    if len(profiles) < 2:
        raise HTTPException(
            status_code=404,
            detail="Not enough document content to compare. At least two readable papers are required.",
        )

    # Stage 2: synthesise gaps over the compact profiles (grounded, deterministic).
    profiles_json = json.dumps(profiles, ensure_ascii=False)
    response = get_client().chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": GAPS_SYSTEM_PROMPT + GUARDRAIL},
            {
                "role": "user",
                "content": f"Profiles of {len(profiles)} papers:\n\n"
                + wrap_untrusted("paper_profiles", profiles_json),
            },
        ],
        max_tokens=1400,
        temperature=0.1,
    )
    gaps = scrub_output(response.choices[0].message.content.strip())

    # Persist so the same set returns byte-identical output (determinism gate).
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO gap_analyses (user_id, doc_key, gaps, doc_count)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (user_id, doc_key)
               DO UPDATE SET gaps = EXCLUDED.gaps, doc_count = EXCLUDED.doc_count, created_at = now()""",
            (request.user_id, doc_key, gaps, len(profiles)),
        )

    return {"gaps": gaps, "doc_count": len(profiles), "cached": False}
