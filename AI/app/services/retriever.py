import numpy as np

from app.database import get_connection
from app.services.embedder import encode
from app.services.text_quality import is_boilerplate, is_low_value_chunk


def _pick_anchor(rows, seen_ids: set) -> dict | None:
    """Best anchor candidate that is new and is actual paper prose.

    Two passes so the boilerplate filter can never cost us the anchor entirely:
    prefer a chunk that is neither already retrieved nor front matter; if every
    candidate is boilerplate, fall back to any unseen one.
    """

    def build(row):
        return {
            "chunk_id": str(row[0]),
            "content": row[1],
            "page_number": row[2],
            "doc_name": row[3],
            "score": float(row[4]),
        }

    fallback = None
    for row in rows:
        if str(row[0]) in seen_ids or is_low_value_chunk(row[1]):
            continue
        if is_boilerplate(row[1]):
            fallback = fallback or build(row)
            continue
        return build(row)
    return fallback


def retrieve_per_document(
    queries: list[str],
    user_id: str,
    document_ids: list[str],
    per_document_k: int = 4,
) -> dict[str, list[dict]]:
    """Retrieve chunks with a GUARANTEED per-document quota.

    The plain `retrieve()` pools every selected document into one global top-k,
    so a single dominant paper can seize all the slots and the others contribute
    nothing — that is the "selected paper vanished" failure. This function instead
    runs the search per document, so every selected document is guaranteed up to
    `per_document_k` of its own most relevant chunks (or is reported as empty).

    `queries` is a set of facets (e.g. "methods", "results", "limitations"); each
    document is ranked against every facet and its best unique chunks are kept.

    Returns a dict keyed by document_id -> list of chunk dicts (best first).
    Documents with no chunks at all appear with an empty list so the caller can
    detect and surface missing coverage.
    """
    if not document_ids:
        return {}
    if not queries:
        queries = [""]

    # Encode all facet queries once (local model — cheap to batch).
    query_embeddings = [np.array(e) for e in encode(queries)]

    results: dict[str, list[dict]] = {doc_id: [] for doc_id in document_ids}

    with get_connection() as conn:
        cur = conn.cursor()
        for doc_id in document_ids:
            seen_chunk_ids: set = set()
            scored: list[dict] = []
            for emb in query_embeddings:
                cur.execute(
                    """
                    SELECT c.id, c.content, c.page_number, d.original_name,
                           1 - (c.embedding <=> %s::vector) AS score
                    FROM chunks c
                    JOIN documents d ON c.document_id = d.id
                    WHERE c.user_id = %s
                      AND c.workspace_id IS NULL
                      AND c.document_id = %s::uuid
                    ORDER BY c.embedding <=> %s::vector
                    LIMIT %s
                    """,
                    [emb, user_id, doc_id, emb, per_document_k],
                )
                for row in cur.fetchall():
                    chunk_id = str(row[0])
                    if chunk_id in seen_chunk_ids:
                        continue
                    seen_chunk_ids.add(chunk_id)
                    scored.append(
                        {
                            "chunk_id": chunk_id,
                            "content": row[1],
                            "page_number": row[2],
                            "doc_name": row[3],
                            "score": float(row[4]),
                        }
                    )
            # Keep this document's best unique chunks across all facets.
            scored.sort(key=lambda c: c["score"], reverse=True)
            results[doc_id] = scored[:per_document_k]

    return results


def fetch_document_texts(
    document_ids: list[str],
    user_id: str,
    workspace_ids: list[str] | None = None,
    char_budget: int = 90_000,
) -> list[dict]:
    """Full text of each document in reading order — no similarity search.

    Backs the summarization path. An overview request has no semantic anchor, so
    ranking chunks by distance to it returns noise; reading the document in
    chunk order returns the document. Table dumps are skipped: they carry little
    prose value for a summary and eat the budget quickly.

    Returns [{"doc_name", "content", "chunk_count"}], preserving caller order and
    omitting documents that have no chunks yet.
    """
    if not document_ids:
        return []

    with get_connection() as conn:
        cur = conn.cursor()
        if workspace_ids:
            isolation, iso_param = "c.workspace_id = ANY(%s::uuid[])", workspace_ids
        else:
            isolation, iso_param = "c.user_id = %s AND c.workspace_id IS NULL", user_id

        cur.execute(
            f"""
            SELECT c.document_id, d.original_name, c.content
            FROM chunks c
            JOIN documents d ON c.document_id = d.id
            WHERE {isolation}
              AND c.document_id = ANY(%s::uuid[])
              AND c.content NOT LIKE '[TABLE%%'
            ORDER BY c.document_id, c.chunk_index
            """,
            [iso_param, document_ids],
        )
        rows = cur.fetchall()

    collected: dict[str, dict] = {}
    for doc_id, name, content in rows:
        entry = collected.setdefault(
            str(doc_id), {"doc_name": name, "parts": [], "used": 0, "chunk_count": 0}
        )
        entry["chunk_count"] += 1
        if entry["used"] >= char_budget:
            continue
        entry["parts"].append(content)
        entry["used"] += len(content)

    return [
        {
            "doc_name": collected[d]["doc_name"],
            "content": "\n\n".join(collected[d]["parts"]),
            "chunk_count": collected[d]["chunk_count"],
        }
        for d in document_ids
        if d in collected and collected[d]["parts"]
    ]


def _isolation(user_id: str, workspace_ids: list[str] | None):
    """Shared tenant-isolation clause: workspace context never mixes with personal."""
    if workspace_ids:
        return "c.workspace_id = ANY(%s::uuid[])", workspace_ids
    return "c.user_id = %s AND c.workspace_id IS NULL", user_id


def retrieve_quota(
    question: str,
    user_id: str,
    document_ids: list[str],
    workspace_ids: list[str] | None = None,
    per_document_k: int = 4,
) -> list[dict]:
    """Retrieve with a GUARANTEED per-document quota, in one round trip.

    Plain `retrieve()` pools every selected document into a single global top-k
    ranking, so one paper can occupy most or all of the slots. Reproduced directly
    while debugging a "could not find" refusal on a 2-document comparison request:
    16 of 20 pooled chunks came from one paper, 6 from the other — the model
    wasn't being unreasonable, it genuinely hadn't been shown enough of the second
    paper to compare. `PARTITION BY document_id` gives every selected document its
    own independent ranking in the same query, so no document can be crowded out
    regardless of how well its chunks score against the others.
    """
    embedding = np.array(encode([question])[0])
    isolation, iso_param = _isolation(user_id, workspace_ids)

    sql = f"""
        WITH ranked AS (
            SELECT c.id, c.content, c.page_number, c.document_id,
                   c.embedding <=> %s::vector AS dist,
                   ROW_NUMBER() OVER (
                       PARTITION BY c.document_id
                       ORDER BY c.embedding <=> %s::vector
                   ) AS rn
            FROM chunks c
            WHERE {isolation}
              AND c.document_id = ANY(%s::uuid[])
        )
        SELECT r.id, r.content, r.page_number, d.original_name, 1 - r.dist AS score
        FROM ranked r
        JOIN documents d ON r.document_id = d.id
        WHERE r.rn <= %s
        ORDER BY r.dist
    """
    params = [embedding, embedding, iso_param, document_ids, per_document_k]

    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(sql, params)
        rows = cur.fetchall()

        results = [
            {
                "chunk_id": str(row[0]),
                "content": row[1],
                "page_number": row[2],
                "doc_name": row[3],
                "score": float(row[4]),
            }
            for row in rows
        ]

        # Same anchor guarantee as retrieve() — the quota already gives every
        # document a fair share of the ranking, but a per-document quota doesn't
        # by itself fix a dense numeric table outranking abstract prose *within*
        # one document, which is the failure the anchor exists for.
        seen_ids = {r["chunk_id"] for r in results}
        for doc_id in document_ids:
            anchor_query = f"""
                SELECT c.id, c.content, c.page_number, d.original_name,
                       1 - (c.embedding <=> %s::vector) AS score
                FROM chunks c
                JOIN documents d ON c.document_id = d.id
                WHERE {isolation} AND c.document_id = %s::uuid AND c.page_number <= 2
                  AND c.content NOT LIKE '[TABLE%%'
                ORDER BY c.embedding <=> %s::vector
                LIMIT 8
            """
            cur.execute(anchor_query, [embedding, iso_param, doc_id, embedding])
            anchor = _pick_anchor(cur.fetchall(), seen_ids)
            if anchor is None:
                continue
            results.append(anchor)
            seen_ids.add(anchor["chunk_id"])

        return results


def retrieve(
    question: str,
    user_id: str,
    document_ids: list[str] | None = None,
    workspace_ids: list[str] | None = None,
    top_k: int = 5,
) -> list[dict]:
    embedding = encode([question])[0]
    embedding_array = np.array(embedding)

    with get_connection() as conn:
        cur = conn.cursor()

        # Strict isolation: workspace context NEVER mixes with personal context
        where_parts = []
        params: list = []

        if workspace_ids and len(workspace_ids) > 0:
            # Workspace context: only workspace chunks, never personal
            where_parts.append("c.workspace_id = ANY(%s::uuid[])")
            params.append(workspace_ids)
        else:
            # Personal context: only personal chunks (workspace_id must be NULL)
            where_parts.append("c.user_id = %s AND c.workspace_id IS NULL")
            params.append(user_id)

        if document_ids and len(document_ids) > 0:
            where_parts.append("c.document_id = ANY(%s::uuid[])")
            params.append(document_ids)

        where_clause = " AND ".join(where_parts)

        query = f"""
            SELECT c.id, c.content, c.page_number, d.original_name,
                   1 - (c.embedding <=> %s::vector) AS score
            FROM chunks c
            JOIN documents d ON c.document_id = d.id
            WHERE {where_clause}
            ORDER BY c.embedding <=> %s::vector
            LIMIT %s
        """

        final_params = [embedding_array] + params + [embedding_array, top_k]
        cur.execute(query, final_params)
        rows = cur.fetchall()

        results = [
            {
                "chunk_id": str(row[0]),
                "content": row[1],
                "page_number": row[2],
                "doc_name": row[3],
                "score": float(row[4]),
            }
            for row in rows
        ]

        # Anchor in an abstract/intro chunk per document. Pure top-k semantic
        # search can get swamped by dense numeric tables (results appendices,
        # benchmark grids) on a vague or "what is this paper about"-style
        # question — none of the actual overview prose makes the cut, and the
        # model is left synthesizing a summary out of raw score tables. A vague
        # query's embedding just doesn't compete with a table's on relevance,
        # so we don't rely on ranking to surface page 1-2 — we guarantee it,
        # still picked by best match to the actual question, not just "page 1".
        if document_ids and len(document_ids) <= 4:
            # Fetch SEVERAL candidates per document, not one. The previous version
            # took the single best page-1/2 chunk and skipped it if it was already
            # in the top-k — which silently made the whole anchor a no-op in the
            # exact case it exists for. Measured on the Transformer paper: the
            # three best candidates were a Google Brain affiliation footnote, a
            # copyright grant, and one prose chunk, all already present, so the
            # anchor added nothing and the abstract never reached the model.
            #
            # Taking the best candidate that is BOTH new and not front matter
            # makes the guarantee real: every selected document contributes at
            # least one piece of genuine overview prose.
            seen_ids = {r["chunk_id"] for r in results}
            for doc_id in document_ids:
                anchor_query = f"""
                    SELECT c.id, c.content, c.page_number, d.original_name,
                           1 - (c.embedding <=> %s::vector) AS score
                    FROM chunks c
                    JOIN documents d ON c.document_id = d.id
                    WHERE {where_clause} AND c.document_id = %s::uuid AND c.page_number <= 2
                      AND c.content NOT LIKE '[TABLE%%'
                    ORDER BY c.embedding <=> %s::vector
                    LIMIT 8
                """
                cur.execute(anchor_query, [embedding_array] + params + [doc_id, embedding_array])
                rows = cur.fetchall()

                anchor = _pick_anchor(rows, seen_ids)
                if anchor is None:
                    continue
                results.append(anchor)
                seen_ids.add(anchor["chunk_id"])
            # Deliberately NOT trimmed back down to top_k: an earlier version of
            # this evicted the weakest natural match to make room, which just as
            # often threw away the one chunk a specific factual question actually
            # needed. document_ids is capped at 4 above, so this adds at most 4
            # extra chunks — negligible context cost next to the reliability gain.

        return results
