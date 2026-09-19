/**
 * Document-title normalization, shared by every component that has to decide
 * whether two documents are "the same paper".
 *
 * This is a deliberate port of `_normalize_title` in AI/app/routers/zotero.py —
 * the Zotero importer and the PDF uploader MUST agree, otherwise a .bib entry
 * and its PDF reconcile in one direction but not the other. If you change the
 * rules here, change them there too (and vice versa).
 *
 * Rules: drop a trailing file extension, lowercase, collapse every run of
 * non-alphanumerics to a single space, trim. So the BibTeX title
 * "Attention is All you Need" and the uploaded "Attention Is All You Need.pdf"
 * both become "attention is all you need".
 */

const EXT_RE = /\.(pdf|docx?|txt|bib|ris)$/i;
const NONWORD_RE = /[^a-z0-9]+/g;

function normalizeTitle(s) {
  const stripped = String(s || '').trim().replace(EXT_RE, '');
  return stripped.toLowerCase().replace(NONWORD_RE, ' ').trim();
}

module.exports = { normalizeTitle };
