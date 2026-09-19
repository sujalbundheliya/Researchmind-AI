'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import {
  X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Download, Loader2, FileWarning, Quote, ChevronsDown,
} from 'lucide-react';
import api from '@/lib/api';

// The worker is served from our own /public rather than a CDN: the production
// container has no outbound internet access at runtime, so a CDN worker would
// leave the viewer permanently stuck on "Loading".
//
// IMPORTANT: the worker file and the pdf.js API must be the exact same version,
// or every document fails to load with an opaque error. `pdfjs-dist` is pinned
// (not ranged) in package.json to the version react-pdf depends on, and the
// worker in public/pdf/ is copied from that install:
//
//   cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf/
//
// Re-run that after any pdfjs-dist or react-pdf upgrade.
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.mjs';

export interface PdfHighlight {
  /** Verbatim text to highlight. Matched against the PDF's own text layer. */
  quote: string;
  /** 1-based page the quote was found on. */
  page: number;
  /** Optional caption shown in the evidence rail (e.g. a column name). */
  label?: string;
}

interface PdfViewerProps {
  docId: string;
  docName: string;
  highlights?: PdfHighlight[];
  initialPage?: number;
  onClose: () => void;
}

/**
 * Normalize text for matching.
 *
 * PDF text extraction inserts line breaks mid-sentence, hyphenates across line
 * ends, and uses typographic quotes/dashes. Both the stored quote and the
 * page's text layer are reduced to the same shape before comparison — this
 * mirrors _normalize_for_match in AI/app/routers/review.py, which is what
 * verified the quote at screening time.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/­/g, '')
    .replace(/-\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split a quote into comparable words, dropping punctuation-only tokens. */
function words(text: string): string[] {
  return normalize(text).split(' ').filter((w) => w.replace(/[^a-z0-9]/g, '').length > 0);
}

/**
 * Normalize with whitespace removed entirely.
 *
 * PDF text layers routinely lose inter-word spaces, so the same sentence can be
 * "based solely on attention" in the stored quote and "basedsolelyonattention"
 * in the page — word-based comparison finds nothing. Matching on the
 * space-stripped form catches those. Mirrors _match_key in
 * AI/app/routers/review.py, which verifies the quote at screening time.
 */
function matchKey(text: string): string {
  return normalize(text).replace(/\s+/g, '');
}

export default function PdfViewer({
  docId,
  docName,
  highlights = [],
  initialPage,
  onClose,
}: PdfViewerProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const firstPage = initialPage ?? highlights[0]?.page ?? 1;
  const [currentPage, setCurrentPage] = useState(firstPage);

  // Pages that carry at least one highlight, in document order.
  const highlightPages = useMemo(
    () => Array.from(new Set(highlights.map((h) => h.page))).sort((a, b) => a - b),
    [highlights]
  );

  // Group the quotes by page so the text renderer only tests the ones that
  // could possibly appear on the page it's rendering.
  const quotesByPage = useMemo(() => {
    const map: Record<number, string[]> = {};
    highlights.forEach((h) => {
      if (!h.quote?.trim()) return;
      (map[h.page] ??= []).push(h.quote);
    });
    return map;
  }, [highlights]);

  /**
   * Fetch through the axios client rather than pointing pdf.js at the URL.
   * The session cookie is httpOnly + SameSite=Lax and the API is a different
   * origin, so letting the pdf.js worker fetch directly would be unauthenticated.
   * A blob also means the file is fetched exactly once.
   */
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    api
      .get(`/documents/${docId}/file`, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data as Blob);
        setFileUrl(objectUrl);
      })
      .catch(async (err) => {
        if (cancelled) return;
        // The error body arrives as a Blob because of responseType — read it
        // back to surface the real message (e.g. FILE_MISSING).
        let message = 'Could not load this PDF.';
        const data = err?.response?.data;
        if (data instanceof Blob) {
          try {
            const parsed = JSON.parse(await data.text());
            if (parsed?.message) message = parsed.message;
          } catch { /* keep the default */ }
        }
        setLoadError(message);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [docId]);

  // Escape closes the viewer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const scrollToPage = useCallback((page: number) => {
    setCurrentPage(page);
    pageRefs.current[page]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const jumpToHighlight = useCallback((index: number) => {
    const target = highlights[index];
    if (!target) return;
    setActiveIndex(index);
    scrollToPage(target.page);
  }, [highlights, scrollToPage]);

  /**
   * Wrap matching text in a <mark>. pdf.js calls this once per text item, and
   * an item is usually a line fragment rather than a whole sentence — so an
   * exact substring test would almost never fire on a real quote.
   *
   * Instead: if the item's words form a run of 4+ consecutive words from the
   * quote, treat the item as part of that quote and highlight it whole. Short
   * items (< 4 words) fall back to requiring the item to sit inside the quote,
   * which catches the trailing fragment of a sentence.
   */
  const makeTextRenderer = useCallback(
    (pageNumber: number) => {
      const pageQuotes = quotesByPage[pageNumber];
      if (!pageQuotes?.length) return undefined;

      const quoteWordLists = pageQuotes.map(words);
      const quoteKeys = pageQuotes.map(matchKey);

      return (textItem: { str: string }) => {
        const itemText = textItem.str;
        if (!itemText?.trim()) return itemText;

        const itemWords = words(itemText);
        if (itemWords.length === 0) return itemText;

        const wordRunMatch = quoteWordLists.some((quoteWords) => {
          if (quoteWords.length === 0) return false;

          if (itemWords.length >= 4) {
            // Does any 4-word window of the item appear consecutively in the quote?
            const quoteStr = ` ${quoteWords.join(' ')} `;
            for (let i = 0; i + 4 <= itemWords.length; i++) {
              if (quoteStr.includes(` ${itemWords.slice(i, i + 4).join(' ')} `)) return true;
            }
            return false;
          }

          // Short fragment: highlight only if the whole thing sits in the quote
          // AND carries some substance, so stray "the"/"of" items stay clean.
          const joined = itemWords.join(' ');
          return joined.length >= 8 && ` ${quoteWords.join(' ')} `.includes(` ${joined} `);
        });

        // Fallback for pages whose text layer has lost its spaces: compare with
        // whitespace stripped.
        //
        // The threshold is deliberately high. A line fragment only has to be a
        // substring of the quote to match here, so a short one ("andthe...")
        // can land inside an unrelated quote and highlight a line that isn't
        // actually evidence. Over-highlighting is worse than under-highlighting
        // for this feature: the whole point is that a mark means "this is what
        // the decision rested on".
        const isMatch = wordRunMatch || (() => {
          const itemKey = matchKey(itemText);
          if (itemKey.length < 24) return false;
          return quoteKeys.some((qk) => qk.includes(itemKey));
        })();

        return isMatch
          ? `<mark class="rm-pdf-highlight">${itemText}</mark>`
          : itemText;
      };
    },
    [quotesByPage]
  );

  // Track which page is in view so the toolbar counter stays honest as the
  // user scrolls freely rather than only when they click.
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !numPages) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const page = Number((visible.target as HTMLElement).dataset.page);
          if (page) setCurrentPage(page);
        }
      },
      { root, threshold: [0.1, 0.5] }
    );

    Object.values(pageRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [numPages]);

  // Once the document is open, land on the first evidence page.
  const handleLoadSuccess = useCallback(({ numPages: total }: { numPages: number }) => {
    setNumPages(total);
    if (firstPage > 1) {
      // Wait for the pages to mount before scrolling to one.
      setTimeout(() => scrollToPage(Math.min(firstPage, total)), 150);
    }
  }, [firstPage, scrollToPage]);

  const hasHighlights = highlights.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex flex-col">
      {/* Highlight styling. Scoped to the viewer and defined here so the
          component stays self-contained rather than depending on globals.css. */}
      <style jsx global>{`
        .rm-pdf-highlight {
          background-color: rgba(217, 119, 87, 0.38);
          color: inherit;
          border-radius: 2px;
          padding: 1px 0;
          box-shadow: 0 0 0 1px rgba(217, 119, 87, 0.5);
        }
        .rm-pdf-page .react-pdf__Page__textContent span {
          cursor: text;
        }
      `}</style>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 h-14 bg-surface border-b border-line flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-red-500">PDF</span>
          </div>
          <p className="text-sm font-semibold text-ink truncate" title={docName}>{docName}</p>
        </div>

        {numPages > 0 && (
          <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => scrollToPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors disabled:opacity-30"
              title="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-muted tabular-nums px-1 whitespace-nowrap">
              {currentPage} / {numPages}
            </span>
            <button
              onClick={() => scrollToPage(Math.min(numPages, currentPage + 1))}
              disabled={currentPage >= numPages}
              className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors disabled:opacity-30"
              title="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setScale((s) => Math.max(0.6, +(s - 0.2).toFixed(1)))}
            disabled={scale <= 0.6}
            className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors disabled:opacity-30"
            title="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-xs text-muted tabular-nums w-10 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale((s) => Math.min(2.6, +(s + 0.2).toFixed(1)))}
            disabled={scale >= 2.6}
            className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors disabled:opacity-30"
            title="Zoom in"
          >
            <ZoomIn size={16} />
          </button>

          {fileUrl && (
            <a
              href={fileUrl}
              download={docName}
              className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors"
              title="Download"
            >
              <Download size={16} />
            </a>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors ml-1"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0 bg-canvas">
        {/* Evidence rail */}
        {hasHighlights && (
          <aside className="hidden md:flex flex-col w-72 border-r border-line bg-surface flex-shrink-0">
            <div className="px-4 py-3 border-b border-line flex-shrink-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-subtle flex items-center gap-1.5">
                <Quote size={12} /> Supporting evidence
              </p>
              <p className="text-[11px] text-subtle mt-1">
                {highlights.length} passage{highlights.length === 1 ? '' : 's'} highlighted in the document
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {highlights.map((h, i) => (
                <button
                  key={`${h.page}-${i}`}
                  onClick={() => jumpToHighlight(i)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    activeIndex === i
                      ? 'border-clay bg-clay/10'
                      : 'border-line bg-canvas hover:border-clay/50 hover:bg-surface2'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    {h.label && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-clay truncate">
                        {h.label}
                      </span>
                    )}
                    <span className="text-[10px] text-subtle whitespace-nowrap ml-auto">page {h.page}</span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed line-clamp-4">&ldquo;{h.quote}&rdquo;</p>
                </button>
              ))}
            </div>
            {highlightPages.length > 1 && (
              <div className="p-3 border-t border-line flex-shrink-0">
                <button
                  onClick={() => jumpToHighlight((activeIndex + 1) % highlights.length)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-clay border border-clay/40 py-2 rounded-lg hover:bg-clay/10 transition-colors"
                >
                  <ChevronsDown size={13} /> Next passage
                </button>
              </div>
            )}
          </aside>
        )}

        {/* Document */}
        <div ref={containerRef} className="flex-1 overflow-y-auto min-w-0">
          {loadError ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <FileWarning size={32} className="text-subtle mb-3" />
              <p className="text-sm font-medium text-ink mb-1">{loadError}</p>
              <p className="text-xs text-subtle max-w-xs">
                The document&apos;s extracted text is still available — only the original file
                could not be opened.
              </p>
            </div>
          ) : !fileUrl ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 size={24} className="animate-spin text-clay" />
              <p className="text-sm text-muted">Loading document…</p>
            </div>
          ) : (
            <Document
              file={fileUrl}
              onLoadSuccess={handleLoadSuccess}
              onLoadError={(err: Error) => {
                // Surface the underlying reason: the usual cause is a worker /
                // API version mismatch, which is invisible without this.
                console.error('[PdfViewer] pdf.js failed to load the document:', err);
                setLoadError('This PDF could not be rendered.');
              }}
              loading={
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                  <Loader2 size={24} className="animate-spin text-clay" />
                  <p className="text-sm text-muted">Rendering…</p>
                </div>
              }
              className="flex flex-col items-center py-6 gap-6"
            >
              {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNumber) => (
                <div
                  key={pageNumber}
                  data-page={pageNumber}
                  ref={(el) => { pageRefs.current[pageNumber] = el; }}
                  className="rm-pdf-page shadow-lg scroll-mt-4"
                >
                  <Page
                    pageNumber={pageNumber}
                    scale={scale}
                    renderTextLayer
                    renderAnnotationLayer={false}
                    customTextRenderer={makeTextRenderer(pageNumber)}
                    loading={
                      <div className="bg-surface border border-line" style={{ width: 612 * scale, height: 792 * scale }} />
                    }
                  />
                  <p className="text-center text-[11px] text-subtle mt-1.5">Page {pageNumber}</p>
                </div>
              ))}
            </Document>
          )}
        </div>
      </div>
    </div>
  );
}
