"""Heuristics for spotting chunks that carry no retrievable meaning.

Motivated by measurement, not theory. Retrieving for "Summarize this paper" against
the Transformer paper returned 8 of 20 chunks like these:

    [TABLE page 15] ehT ure ten | waL 5: ce. | lliw Ma We | reven ny give ...
    [TABLE page 14]  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ...
    Input-Input Layer5 ehT ehT waL waL lliw lliw reven reven eb eb tcefrep ...

Both come from the attention-visualization figures on pages 13-15: pdfplumber reads
the mirrored axis labels right-to-left ("ehT waL lliw reven eb tcefrep" is "The Law
will never be perfect" reversed) and reads the figure grid as an empty table.

Chunks like these are worse than useless. Carrying almost no semantic signal, they
sit at a middling cosine distance from *everything*, which is exactly what wins when
the query is vague — so they crowd out real content precisely when it is needed most.

The detectors are deliberately narrow. A chunk wrongly dropped is unrecoverable
without re-ingestion, whereas a junk chunk that slips through merely costs a slot.
Genuine data tables must survive: they answer real questions (Table 3 ablations,
Table 2 BLEU scores), and they look superficially like the empty ones.
"""

import re

# Function words that appear in essentially any English prose. Used in both
# directions: present => real text, present *when reversed* => mirrored text.
_COMMON_WORDS = {
    "the",
    "of",
    "and",
    "to",
    "in",
    "is",
    "that",
    "for",
    "with",
    "as",
    "we",
    "this",
    "are",
    "on",
    "by",
    "it",
    "be",
    "an",
    "at",
    "from",
    "or",
    "was",
    "which",
    "can",
    "has",
    "have",
    "not",
    "our",
    "all",
    "each",
    "these",
    "than",
}

_TOKEN_RE = re.compile(r"[A-Za-z]+")

# Front matter: correct text, but never the answer to anything. Kept out of the
# retrieval anchor, which is supposed to surface a paper's abstract/intro and was
# instead surfacing Google's copyright grant.
_BOILERPLATE_PATTERNS = [
    r"hereby grants permission",
    r"provided proper attribution",
    r"permission to make digital or hard copies",
    r"work performed while at",
    r"equal contribution",
    r"corresponding author",
    r"\bconference on neural information processing systems\b",
    r"\b\d{1,2}(st|nd|rd|th)\s+conference\b",
    r"all rights reserved",
    r"licensed under",
    r"creative commons",
    r"copyright\s*(\(c\)|©|\d{4})",
    r"^\s*arxiv:\s*\d",
]
_BOILERPLATE_RE = re.compile("|".join(_BOILERPLATE_PATTERNS), re.IGNORECASE | re.MULTILINE)


def _strip_table_marker(text: str) -> str:
    return re.sub(r"^\[TABLE page \d+\]\s*", "", text, flags=re.IGNORECASE)


def is_mirrored_text(text: str) -> bool:
    """True when tokens read as words only when reversed.

    'ehT waL lliw reven eb tcefrep' scores 5 reversed hits against 0 forward hits.
    A real table of numbers scores 0 against 0 and is left alone.
    """
    tokens = [t.lower() for t in _TOKEN_RE.findall(text)]
    if len(tokens) < 6:
        return False
    forward = sum(1 for t in tokens if t in _COMMON_WORDS)
    reversed_hits = sum(1 for t in tokens if t[::-1] in _COMMON_WORDS and t not in _COMMON_WORDS)
    return reversed_hits >= 3 and reversed_hits > forward


def is_structurally_empty(text: str) -> bool:
    """True for table skeletons: separators and whitespace with no real cells."""
    body = _strip_table_marker(text)
    stripped = re.sub(r"[|\-\s+_=]", "", body)
    if len(stripped) >= 40:
        return False
    # Short but meaningful lines (a caption, a single figure label) are kept only
    # if they contain actual words rather than stray punctuation.
    return len(_TOKEN_RE.findall(body)) < 5


def is_low_value_chunk(text: str) -> bool:
    """Whether a chunk should be dropped at ingestion time."""
    if not text or not text.strip():
        return True
    return is_structurally_empty(text) or is_mirrored_text(text)


def is_boilerplate(text: str) -> bool:
    """Front matter — copyright grants, affiliations, conference footers."""
    return bool(_BOILERPLATE_RE.search(text or ""))


def rejection_reason(text: str) -> str | None:
    """Why a chunk would be dropped, for ingestion logging."""
    if not text or not text.strip():
        return "empty"
    if is_structurally_empty(text):
        return "structurally-empty"
    if is_mirrored_text(text):
        return "mirrored-text"
    return None
