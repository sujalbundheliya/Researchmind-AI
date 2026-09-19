from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.services.text_quality import is_low_value_chunk, rejection_reason

# Larger chunks (800 chars) with more overlap (150) so cross-section context
# is preserved and fewer boundaries cut through a single argument.
_splitter = RecursiveCharacterTextSplitter(
    chunk_size=800,
    chunk_overlap=150,
    length_function=len,
)


def chunk_pages(pages: list[dict]) -> list[dict]:
    """Split pages into chunks, discarding ones with no retrievable meaning.

    Figure regions yield mirrored text and empty table grids (see text_quality).
    Indexing them actively hurts: they sit at a middling distance from every
    query, so they win slots exactly when the question is vague and real content
    is needed most. Measured at ~3% of chunks on this corpus, with data tables
    left untouched.
    """
    chunks = []
    chunk_index = 0
    dropped: dict[str, int] = {}

    for page in pages:
        text = page["text"]

        if text.startswith("[TABLE"):
            # Keep table chunks intact — splitting a markdown table destroys its structure
            candidates = [text]
        else:
            candidates = _splitter.split_text(text)

        for candidate in candidates:
            if is_low_value_chunk(candidate):
                reason = rejection_reason(candidate) or "unknown"
                dropped[reason] = dropped.get(reason, 0) + 1
                continue
            chunks.append(
                {
                    "content": candidate,
                    "page_number": page["page"],
                    "chunk_index": chunk_index,
                }
            )
            chunk_index += 1

    if dropped:
        summary = ", ".join(f"{count} {reason}" for reason, count in sorted(dropped.items()))
        print(f"Chunker dropped {sum(dropped.values())} low-value chunks ({summary})")

    return chunks
