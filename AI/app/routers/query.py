import math

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import get_connection
from app.services import intent
from app.services.llm import (
    NO_INFO_RESPONSE,
    generate_answer,
    generate_chat_reply,
    is_smalltalk,
    summarize_document,
    summarize_for_chat,
)
from app.services.prompt_guard import KIND_REFUSAL, detect_injection
from app.services.retriever import fetch_document_texts, retrieve, retrieve_quota

router = APIRouter()

# Per-document character budget for the summarization path. A full paper runs
# ~50-100k chars; Gemini 2.5 Flash has room, but the budget keeps latency and
# token spend bounded when several papers are summarized at once.
SUMMARY_CHAR_BUDGET = 90_000


class QueryRequest(BaseModel):
    question: str
    user_id: str
    session_id: str
    document_ids: list[str] | None = None
    workspace_ids: list[str] | None = None
    chat_history: list[dict] | None = None


class SummarizeRequest(BaseModel):
    document_id: str
    user_id: str


def _document_names(
    document_ids: list[str],
    user_id: str,
    workspace_ids: list[str] | None,
) -> list[str]:
    """Display names for the selected documents, in the order they were selected.

    Scoped the same way retrieval is, so an id the caller isn't entitled to
    simply yields no name rather than leaking one.
    """
    with get_connection() as conn:
        cur = conn.cursor()
        if workspace_ids:
            cur.execute(
                "SELECT id, original_name FROM documents "
                "WHERE id = ANY(%s::uuid[]) AND workspace_id = ANY(%s::uuid[])",
                (document_ids, workspace_ids),
            )
        else:
            cur.execute(
                "SELECT id, original_name FROM documents "
                "WHERE id = ANY(%s::uuid[]) AND user_id = %s AND workspace_id IS NULL",
                (document_ids, user_id),
            )
        by_id = {str(r[0]): r[1] for r in cur.fetchall()}
    return [by_id[d] for d in document_ids if d in by_id]


def _resolve_summary_targets(
    question: str,
    document_ids: list[str],
    doc_names: list[str],
) -> list[str] | None:
    """Which documents a summary request refers to; None means "must ask".

    One selected document, or an explicit "all of them", resolves on its own.
    With several selected and no named paper, guessing would be worse than asking.
    """
    if len(document_ids) == 1:
        return document_ids
    named = intent.match_document_by_name(question, doc_names)
    if named is not None:
        return [document_ids[named]]
    if intent.wants_all_documents(question):
        return document_ids
    return None


@router.post("/query")
def query(request: QueryRequest):
    # Direct jailbreak / prompt-extraction attempt → warm refusal, no LLM call.
    if detect_injection(request.question):
        return {"answer": KIND_REFUSAL, "sources": [], "chunks_used": 0}

    # Greetings/small talk get a warm, free-form reply — they shouldn't trigger
    # the strict document-grounding flow or the "could not find" fallback.
    if is_smalltalk(request.question):
        reply = generate_chat_reply(
            question=request.question, chat_history=request.chat_history or []
        )
        return {"answer": reply, "sources": [], "chunks_used": 0}

    # ── Intent routing ────────────────────────────────────────────────────────
    # Overview requests ("summarize this paper") have no semantic anchor, so
    # similarity search returns noise and the model correctly reports it can't
    # answer. Route them to whole-document reading instead of retrieval.
    selected_ids = request.document_ids or []
    doc_names: list[str] = []
    if selected_ids:
        doc_names = _document_names(selected_ids, request.user_id, request.workspace_ids)

    if selected_ids and intent.is_summary_request(request.question):
        target_ids = _resolve_summary_targets(request.question, selected_ids, doc_names)
        if target_ids is None:
            return {
                "answer": intent.clarification_message(doc_names),
                "sources": [],
                "chunks_used": 0,
            }
        budget = max(8_000, SUMMARY_CHAR_BUDGET // max(1, len(target_ids)))
        documents = fetch_document_texts(
            document_ids=target_ids,
            user_id=request.user_id,
            workspace_ids=request.workspace_ids,
            char_budget=budget,
        )
        if documents:
            result = summarize_for_chat(
                question=request.question,
                documents=documents,
                chat_history=request.chat_history or [],
            )
            return {
                "answer": result["answer"],
                "sources": result["sources"],
                "chunks_used": sum(d["chunk_count"] for d in documents),
            }
        # No text on hand (still ingesting, or an empty doc) — fall through to RAG.

    # A singular "the paper" with several selected can't be resolved. Ask rather
    # than silently picking one or refusing.
    if intent.is_ambiguous(request.question, len(selected_ids)):
        return {
            "answer": intent.clarification_message(doc_names),
            "sources": [],
            "chunks_used": 0,
        }

    # Selecting specific documents (as opposed to searching the whole library)
    # gets a guaranteed per-document quota instead of pooled top-k. Pooled search
    # lets one paper dominate every slot — reproduced directly: a 2-document
    # comparison request came back 16 chunks from one paper, 6 from the other, and
    # the model correctly refused to compare what it hadn't actually been shown.
    # The quota is adaptive so single-document behavior (24 chunks, close to
    # today's 20 + anchor) is preserved and context stays roughly flat as more
    # documents are added. Above ~10 documents a per-document floor stops being
    # meaningful (nobody reads 240 chunks), so fall through to pooled search.
    if request.document_ids and len(request.document_ids) <= 10:
        per_document_k = max(4, math.ceil(24 / len(request.document_ids)))
        chunks = retrieve_quota(
            question=request.question,
            user_id=request.user_id,
            document_ids=request.document_ids,
            workspace_ids=request.workspace_ids,
            per_document_k=per_document_k,
        )
    else:
        chunks = retrieve(
            question=request.question,
            user_id=request.user_id,
            document_ids=request.document_ids,
            workspace_ids=request.workspace_ids,
            # 12 was tight enough that a specific fact could legitimately answer a
            # question yet score just below the cutoff (verified empirically: an
            # explanatory passage scored 0.67 while unrelated bibliography/table
            # entries scored 0.72-0.78 and filled every slot first). Gemini 2.5
            # Flash's context window has ample room for a few more ~800-char chunks.
            top_k=20,
        )

    if not chunks:
        return {
            "answer": NO_INFO_RESPONSE,
            "sources": [],
            "chunks_used": 0,
        }

    result = generate_answer(
        question=request.question,
        context_chunks=chunks,
        chat_history=request.chat_history or [],
    )

    return {
        "answer": result["answer"],
        "sources": result["sources"],
        "chunks_used": len(chunks),
    }


@router.post("/summarize")
def summarize(request: SummarizeRequest):
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT content FROM chunks WHERE document_id = %s AND user_id = %s ORDER BY chunk_index",
            (request.document_id, request.user_id),
        )
        rows = cur.fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail="No chunks found for document")

    content_list = [row[0] for row in rows]
    summary = summarize_document(content_list)
    return {"summary": summary}
