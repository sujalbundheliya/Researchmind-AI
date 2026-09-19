import pdfplumber

from app.services.prompt_guard import strip_hidden_chars


def _table_to_markdown(table: list) -> str:
    if not table:
        return ""
    rows = []
    for row in table:
        cells = [strip_hidden_chars(str(cell or "")).strip().replace("\n", " ") for cell in row]
        rows.append(" | ".join(cells))
    if len(rows) >= 2:
        rows.insert(1, " | ".join(["---"] * len(table[0])))
    return "\n".join(rows)


def extract_text_by_page(path: str) -> list[dict]:
    pages = []
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            # x_tolerance is lowered from pdfplumber's default (3) because these
            # academic PDFs' embedded font metrics under-report inter-word gaps —
            # at the default, extract_text() silently glues words together
            # ("thenumberofoperations..."), which quietly wrecks retrieval quality
            # and specific-fact answers without ever raising an error.
            #
            # Sanitize away zero-width / bidi / control chars that could hide
            # injected instructions from a human reviewer but not from the model.
            text = strip_hidden_chars(page.extract_text(x_tolerance=1) or "").strip()
            if len(text) >= 50:
                pages.append({"page": i, "text": text})

            # Extract tables as separate structured chunks so they embed correctly
            for table in page.extract_tables() or []:
                md = _table_to_markdown(table)
                if md and len(md) >= 30:
                    pages.append({"page": i, "text": f"[TABLE page {i}]\n{md}"})

    return pages
