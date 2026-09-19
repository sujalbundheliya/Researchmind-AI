import os
import threading

import numpy as np
from fastapi import APIRouter, BackgroundTasks
from psycopg2.extras import execute_values

from app.database import get_connection
from app.models.schemas import IngestRequest, IngestResponse
from app.services.chunker import chunk_pages
from app.services.embedder import encode
from app.services.pdf_extractor import extract_text_by_page

router = APIRouter()

# Embedding is CPU-bound and shares a single model instance. Serialize the heavy
# work so that uploading many documents at once queues them one-at-a-time instead
# of thrashing the CPU and exhausting the DB connection pool.
_ingest_lock = threading.Lock()


def _mark_failed(document_id: str) -> None:
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE documents SET status = 'failed' WHERE id = %s", (document_id,))


def _process_ingest(request: IngestRequest) -> None:
    with _ingest_lock:
        try:
            pages = extract_text_by_page(request.file_path)
            if not pages:
                raise ValueError(
                    "No extractable text found in PDF (minimum 50 chars per page required)"
                )

            chunks = chunk_pages(pages)
            if not chunks:
                raise ValueError("No chunks produced from extracted text")

            texts = [c["content"] for c in chunks]
            embeddings = encode(texts)

            with get_connection() as conn:
                cur = conn.cursor()

                # Upsert the document row so chunks FK always resolves, even if the
                # backend's INSERT hasn't replicated to this connection yet.
                cur.execute(
                    """INSERT INTO documents
                           (id, user_id, workspace_id, filename, original_name,
                            file_size_bytes, file_path, status)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, 'processing')
                       ON CONFLICT (id) DO NOTHING""",
                    (
                        request.document_id,
                        request.user_id,
                        request.workspace_id,
                        request.filename or os.path.basename(request.file_path),
                        request.original_name or os.path.basename(request.file_path),
                        request.file_size_bytes or os.path.getsize(request.file_path),
                        request.file_path,
                    ),
                )

                data = [
                    (
                        request.document_id,
                        request.user_id,
                        request.workspace_id,
                        chunk["chunk_index"],
                        chunk["page_number"],
                        chunk["content"],
                        np.array(embeddings[i]),
                    )
                    for i, chunk in enumerate(chunks)
                ]

                execute_values(
                    cur,
                    """INSERT INTO chunks
                           (document_id, user_id, workspace_id, chunk_index, page_number, content, embedding)
                       VALUES %s""",
                    data,
                )

                page_count = max(c["page_number"] for c in chunks)
                cur.execute(
                    "UPDATE documents SET status = 'ready', page_count = %s WHERE id = %s",
                    (page_count, request.document_id),
                )

            print(f"Ingest complete for {request.document_id}: {len(chunks)} chunks")

        except Exception as exc:
            print(f"Ingest error for {request.document_id}: {exc}")
            try:
                _mark_failed(request.document_id)
            except Exception as db_exc:
                print(f"Failed to mark document as failed: {db_exc}")


@router.post("/ingest", response_model=IngestResponse, status_code=202)
def ingest_document(request: IngestRequest, background_tasks: BackgroundTasks):
    # Return immediately; the heavy extract/embed/write work runs in the
    # background. The frontend polls document status to observe completion.
    background_tasks.add_task(_process_ingest, request)
    return IngestResponse(document_id=request.document_id, status="processing")
