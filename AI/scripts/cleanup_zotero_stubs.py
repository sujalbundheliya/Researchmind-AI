"""One-time cleanup for orphaned Zotero import stubs.

Earlier Zotero imports created metadata-only `pending_pdf` document stubs even when
a matching PDF was already ingested (the dedup compared exact title vs. filename, so
"Attention Is All You Need" never matched "Attention Is All You Need.pdf"). Those stubs
are invisible on the All Documents grid (which shows only `ready` docs) and just clutter
the database.

This script, for every user, finds each `pending_pdf` stub whose normalized title
matches a real (non-stub) document. If the real document has no citations yet, the
stub's citation row is moved onto it; otherwise the stub's citation is dropped. Either
way the stub document is then deleted.

Run inside the AI container, from /app (where the `app` package lives):

Must be run with `-m` from /app: running the file by path would put scripts/ on
sys.path instead of /app, and `import app` would fail.

    docker compose exec ai python -m scripts.cleanup_zotero_stubs           # apply
    docker compose exec ai python -m scripts.cleanup_zotero_stubs --dry-run # report only
"""

import sys

from app.database import get_connection
from app.routers.zotero import _normalize_title


def main(dry_run: bool) -> None:
    linked = 0
    deleted = 0
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, user_id, original_name, status FROM documents")
        rows = cur.fetchall()

        # Group per user: normalized-title index of real docs, plus the stubs.
        real_by_user: dict = {}
        stubs = []
        for doc_id, user_id, name, status in rows:
            key = _normalize_title(name)
            if not key:
                continue
            if status == "pending_pdf":
                stubs.append((doc_id, user_id, name, key))
            else:
                real_by_user.setdefault(user_id, {}).setdefault(key, doc_id)

        for stub_id, user_id, name, key in stubs:
            real_id = real_by_user.get(user_id, {}).get(key)
            if not real_id:
                continue  # genuinely PDF-less stub — leave it for manual upload

            cur.execute("SELECT 1 FROM citations WHERE document_id = %s", (real_id,))
            real_has_citation = cur.fetchone() is not None

            action = "delete stub" if real_has_citation else "move citation -> real, delete stub"
            print(f"[{name}] user={user_id} stub={stub_id} real={real_id}: {action}")

            if dry_run:
                deleted += 1
                if not real_has_citation:
                    linked += 1
                continue

            if real_has_citation:
                cur.execute("DELETE FROM citations WHERE document_id = %s", (stub_id,))
            else:
                # Move the stub's citation onto the real document.
                cur.execute(
                    "UPDATE citations SET document_id = %s WHERE document_id = %s",
                    (real_id, stub_id),
                )
                linked += 1
            cur.execute("DELETE FROM documents WHERE id = %s", (stub_id,))
            deleted += 1

    prefix = "[dry-run] would" if dry_run else ""
    print(
        f"\n{prefix} delete {deleted} stub(s); {prefix} link {linked} citation(s) onto existing PDFs."
    )


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
