"""
Research Gaps v2 — per-paper structured profiling.

Instead of random chunk sampling, each document is profiled via targeted BGE
retrieval against a fixed set of probe queries (limitations, future work,
methodology, contributions, scope). The retrieved evidence is distilled by the
LLM into a compact JSON profile that Stage 2 (cross-paper synthesis) reasons over.

Profiles are deterministic given a document, so they are cached in
`document_profiles` and reused across gap analyses.
"""

import json

from openai import OpenAI

from app.config import settings
from app.database import get_connection
from app.services.prompt_guard import GUARDRAIL, wrap_untrusted
from app.services.retriever import retrieve

# Probe queries embedded with the mandatory BGE prefix (handled in embedder.encode).
# These target exactly the facets Stage 2 needs to reason about gaps.
PROBE_QUERIES = [
    "limitations, weaknesses, and threats to validity of this study",
    "future work, open problems, and directions for further research",
    "methodology, experimental design, dataset, and sample",
    "main contributions, key findings, and results",
    "research questions, scope, and topics addressed",
]

PER_PROBE_TOP_K = 4

PROFILE_SYSTEM_PROMPT = (
    "You build a structured profile of a single research paper from the provided "
    "excerpts. Return ONLY a JSON object with exactly these keys:\n"
    '  "problem": string — the problem/objective the paper addresses,\n'
    '  "methodology": string — methods, data, and experimental design,\n'
    '  "key_findings": array of strings — main results/contributions,\n'
    '  "stated_limitations": array of strings — limitations the AUTHORS explicitly state,\n'
    '  "stated_future_work": array of strings — future work the AUTHORS explicitly mention,\n'
    '  "scope_topics": array of strings — specific topics/areas this paper covers.\n'
    "Use ONLY information present in the excerpts. If a field has no evidence, use an "
    "empty string or empty array — never invent content. Keep each item concise."
)

_client: OpenAI | None = None
_tables_ready = False


def get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.llm_api_key, base_url=settings.llm_base_url)
    return _client


def ensure_tables() -> None:
    """Idempotently create the gap caches. Cheap; safe to call before each use."""
    global _tables_ready
    if _tables_ready:
        return
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS document_profiles (
                document_id uuid PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
                user_id     uuid NOT NULL,
                profile     jsonb NOT NULL,
                created_at  timestamptz DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS gap_analyses (
                user_id    uuid NOT NULL,
                doc_key    text NOT NULL,
                gaps       text NOT NULL,
                doc_count  integer NOT NULL,
                created_at timestamptz DEFAULT now(),
                PRIMARY KEY (user_id, doc_key)
            );
            """
        )
    _tables_ready = True


def _parse_json(raw: str) -> dict:
    """Defensive JSON parse — strips code fences if the model adds them."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1] if "```" in text[3:] else text
        text = text.lstrip("json").strip("`").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise


def build_profile(user_id: str, document_id: str) -> dict | None:
    """Run targeted retrieval + one LLM call to produce a structured profile."""
    seen: set = set()
    excerpts: list[str] = []
    doc_name: str | None = None

    for probe in PROBE_QUERIES:
        chunks = retrieve(
            question=probe,
            user_id=user_id,
            document_ids=[document_id],
            top_k=PER_PROBE_TOP_K,
        )
        for ch in chunks:
            content = ch["content"].strip()
            if content and content not in seen:
                seen.add(content)
                excerpts.append(content)
                doc_name = doc_name or ch["doc_name"]

    if not excerpts:
        return None

    context = "\n\n---\n\n".join(excerpts)
    response = get_client().chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": PROFILE_SYSTEM_PROMPT + GUARDRAIL},
            {"role": "user", "content": wrap_untrusted("document_excerpts", context[:8000])},
        ],
        max_tokens=900,
        temperature=0.1,
        response_format={"type": "json_object"},
    )

    profile = _parse_json(response.choices[0].message.content)
    profile["doc_name"] = doc_name or "Unknown"
    # Normalise shape so Stage 2 can rely on it.
    profile.setdefault("problem", "")
    profile.setdefault("methodology", "")
    for key in ("key_findings", "stated_limitations", "stated_future_work", "scope_topics"):
        if not isinstance(profile.get(key), list):
            profile[key] = []
    return profile


def get_or_build_profile(user_id: str, document_id: str) -> dict | None:
    """Return a cached profile or build, cache, and return a new one."""
    ensure_tables()
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT profile FROM document_profiles WHERE document_id = %s AND user_id = %s",
            (document_id, user_id),
        )
        row = cur.fetchone()
        if row:
            return row[0]

    profile = build_profile(user_id, document_id)
    if profile is None:
        return None

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO document_profiles (document_id, user_id, profile)
               VALUES (%s, %s, %s)
               ON CONFLICT (document_id) DO UPDATE SET profile = EXCLUDED.profile,
                                                       created_at = now()""",
            (document_id, user_id, json.dumps(profile)),
        )
    return profile
