"""Query intent routing.

Vector search answers "what does the paper say about X" well, because X gives the
embedding something to be near. It answers "summarize this paper" *badly*, because
that question has no semantic anchor — nothing in the paper is genuinely close to
it, so top-k fills with whatever is nearest to nothing in particular (reference
lists, table dumps, figure captions) and the model correctly reports that it can't
answer. Measured: 8 of 20 retrieved chunks were figure/table noise and the abstract
never made the cut.

The fix is to not run that query through retrieval at all. Overview-shaped requests
are routed to a whole-document summarization path instead, which reads the document
in chunk order rather than by similarity.

This module only classifies. The routing itself lives in `routers/query.py`.
"""

import re
from collections.abc import Sequence

# A reference to a specific artifact means the user wants one thing explained, not
# the paper. "Explain Figure 1" must never reach the summarizer, even though it
# shares the verb "explain" with "explain this paper".
_SPECIFIC_ARTIFACT_RE = re.compile(
    r"\b(figure|fig\.?|table|tbl\.?|section|sec\.?|equation|eq\.?|algorithm|"
    r"appendix|listing|theorem|lemma|formula|chart|graph|diagram)\s*\.?\s*\d|"
    r"\b(figure|table|section|equation|algorithm|appendix)\b\s+[IVX]+\b",
    re.IGNORECASE,
)

# Overview-shaped requests. Two families:
#   1. an explicit summarize/overview verb, with or without an object
#   2. "explain"/"describe" aimed at the document as a whole, or at an audience
#      ("explain to a beginner") rather than at a specific artifact
_SUMMARY_PATTERNS = [
    # summarize / summarise / sum up / recap / tl;dr
    r"\b(summari[sz]e|summari[sz]ation|summary|synopsis|recap|abstract of|tl;?dr|gist)\b",
    r"\bsum\s+(it|this|that|them)?\s*up\b",
    # give me an overview / high-level view
    r"\b(overview|high[- ]level|bird'?s[- ]eye|key\s+(points?|takeaways?|findings?|contributions?)|"
    r"main\s+(points?|ideas?|takeaways?|contributions?))\b",
    # what is this paper about
    r"\bwhat\s+(is|are|was)\s+(this|the|these|it)\s+(paper|study|article|document|work|research)s?\s+about\b",
    r"\bwhat'?s\s+(this|the|it)\s+(paper|study|article|document)s?\s+about\b",
    # explain / describe / walk me through — the paper as a whole
    r"\b(explain|describe|break\s+down|walk\s+(me\s+)?through|tell\s+me\s+about)\b[^?.!]{0,20}\b"
    r"(this|the|these)\s+(paper|study|article|document|work|research|it)s?\b",
    # audience/tone-shifted follow-ups with no object: "explain to a beginner",
    # "explain like I'm a PhD researcher", "in simple terms", "ELI5"
    r"\bexplain\s+(it\s+)?(to|for|like)\b",
    r"\beli5\b",
    r"\bin\s+(simple|plain|layman'?s?|basic)\s+(terms|english|language|words)\b",
    r"\bfor\s+(a\s+)?(beginner|layperson|non[- ]expert|five[- ]year[- ]old|5[- ]year[- ]old)\b",
]
_SUMMARY_RE = re.compile("|".join(_SUMMARY_PATTERNS), re.IGNORECASE)

# Bare reformat follow-ups: "in 5 bullets", "as 3 points". On their own these carry
# no verb, but in a chat they mean "redo the last overview in this shape".
_REFORMAT_RE = re.compile(
    r"^\s*(now\s+)?(again\s+)?(in|as|using|with)\s+\d+\s*(bullets?|points?|lines?|sentences?|paragraphs?)\s*[.!?]?\s*$",
    re.IGNORECASE,
)

# "summarize ALL of them" / "each paper" / "both" — an explicit multi-document scope,
# which resolves the ambiguity a bare "summarize this paper" would otherwise have.
_ALL_SCOPE_RE = re.compile(r"\b(all|each|every|both|these|them|everything)\b", re.IGNORECASE)

# Singular, definite references to *a* paper with no name attached. With one
# document selected these are unambiguous; with several they are not.
_SINGULAR_REFERENT_RE = re.compile(
    r"\b(this|the)\s+(paper|study|article|document|work|research|manuscript)\b|"
    r"\bthe\s+(proposed|presented|described)\s+"
    r"(method|approach|model|system|framework|architecture|algorithm|technique)\b|"
    r"\bthe\s+(method|approach|model|framework|architecture)\s+proposed\b|"
    r"\b(the|their)\s+authors?\b",
    re.IGNORECASE,
)

# Questions that ask us to *identify* a paper are never ambiguous — picking the
# paper is the whole job. "Which paper introduces self-attention?" Also covers
# comparison requests ("comparison table", "compare", "comparing") — the noun
# form was previously missed because \bcompare\b doesn't match inside "comparison".
_IDENTIFY_RE = re.compile(
    r"\b(which|what)\s+(paper|study|article|document|one|of\s+(these|them))\b|"
    r"\b(compar(?:e|ing|ison)|contrast|versus|vs\.?|difference between|across)\b",
    re.IGNORECASE,
)


def is_summary_request(question: str) -> bool:
    """True when the user wants the document(s) characterized as a whole.

    A comparison is a distinct, better-served intent: "comparison table... key
    contribution... evaluation approach" hits the bare `key contributions` phrase
    below, but it names dimensions to compare, not a request to summarize each
    paper — routing it into whole-document summarization loses the compare/contrast
    structure the SYSTEM_PROMPT and retrieval anchor already handle. Check this
    first, the same way _SPECIFIC_ARTIFACT_RE is checked first below.
    """
    q = question.strip()
    if _SPECIFIC_ARTIFACT_RE.search(q) or _IDENTIFY_RE.search(q):
        return False
    return bool(_SUMMARY_RE.search(q) or _REFORMAT_RE.match(q))


def wants_all_documents(question: str) -> bool:
    """True when the request explicitly scopes itself to every selected document."""
    return bool(_ALL_SCOPE_RE.search(question))


def match_document_by_name(question: str, doc_names: Sequence[str]) -> int | None:
    """Index of the one document the question names, or None.

    Matches on the filename stem and on any distinctive word in it (>=4 chars, so
    "APWA" and "OpenDeepThink" hit but "a"/"the"/"pdf" don't). Returns None when
    zero or more than one document matches, since both mean "not resolved".
    """
    q = question.lower()
    hits = []
    for i, name in enumerate(doc_names):
        stem = re.sub(r"\.pdf$", "", name or "", flags=re.IGNORECASE).lower()
        if not stem:
            continue
        if stem in q:
            hits.append(i)
            continue
        # Distinctive multi-word title fragments, e.g. "attention is all you need"
        words = [w for w in re.findall(r"[a-z0-9]{4,}", stem) if w not in _STOPWORDS]
        if words and sum(1 for w in words if w in q) >= max(2, len(words) // 2):
            hits.append(i)
    return hits[0] if len(hits) == 1 else None


_STOPWORDS = {
    "copy",
    "final",
    "draft",
    "version",
    "paper",
    "arxiv",
    "preprint",
    "this",
    "that",
    "with",
    "from",
    "into",
    "your",
    "ours",
    "pdf",
}


def is_ambiguous(question: str, document_count: int) -> bool:
    """True when a singular 'the paper' reference can't be resolved to one document.

    Only fires with several documents in scope. Questions that name a paper, ask us
    to identify one, or explicitly scope to all of them are all resolvable and so
    are never ambiguous.
    """
    if document_count <= 1:
        return False
    q = question.strip()
    if _IDENTIFY_RE.search(q) or _ALL_SCOPE_RE.search(q):
        return False
    return bool(_SINGULAR_REFERENT_RE.search(q))


def clarification_message(doc_names: list[str]) -> str:
    """Ask which paper the user meant, listing what's selected."""
    listed = "\n".join(f"- {n}" for n in doc_names)
    return (
        "You have several papers selected, and that question refers to just one — "
        "I don't want to guess which.\n\n"
        f"Which of these did you mean?\n\n{listed}\n\n"
        "You can name the paper, or ask me to cover all of them."
    )
