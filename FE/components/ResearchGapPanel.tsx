'use client';

import { useState, Fragment, isValidElement, Children, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '@/lib/api';
import { Search, RefreshCw, FileText, Loader2 } from 'lucide-react';

interface ResearchGapPanelProps {
  docIds: string[];
}

// Split a text run into styled tokens: (stated) / (inferred) badges and [Paper: …] chips.
function decorateText(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\(stated\)|\(inferred\)|\[Paper:[^\]]*\])/g);
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part === '(stated)') {
      return (
        <span key={key} className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-green-100 text-green-700 align-middle">
          stated
        </span>
      );
    }
    if (part === '(inferred)') {
      return (
        <span key={key} className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 align-middle">
          inferred
        </span>
      );
    }
    if (part.startsWith('[Paper:')) {
      const name = part.replace(/^\[Paper:\s*/, '').replace(/\]$/, '').trim();
      return (
        <span key={key} className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md text-[11px] font-medium bg-clay/10 text-clay align-middle">
          <FileText size={10} className="flex-shrink-0" /> {name}
        </span>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

// Walk markdown children, decorating string runs while leaving nested elements intact.
function decorateChildren(children: ReactNode): ReactNode {
  return Children.map(children, (child, i) => {
    if (typeof child === 'string') return decorateText(child, `t${i}`);
    return child;
  });
}

const INFERRED_RE = /\(inferred\)/;
const EMPTY_RE = /^Insufficient evidence across the selected papers\.?$/i;

const markdownComponents = {
  li: ({ children }: { children?: ReactNode }) => {
    const isInferred = Children.toArray(children).some(c => typeof c === 'string' && INFERRED_RE.test(c));
    return (
      <li className={isInferred ? 'italic text-muted' : 'text-ink'}>
        {decorateChildren(children)}
      </li>
    );
  },
  p: ({ children }: { children?: ReactNode }) => {
    const arr = Children.toArray(children);
    const text = arr.every(c => typeof c === 'string') ? arr.join('') : '';
    if (EMPTY_RE.test(text.trim())) {
      return <p className="text-sm text-subtle italic">{text}</p>;
    }
    return <p className="text-ink">{decorateChildren(children)}</p>;
  },
};

export default function ResearchGapPanel({ docIds }: ResearchGapPanelProps) {
  const [gaps, setGaps] = useState('');
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const disabled = docIds.length < 2;

  const identify = async (refresh = false) => {
    if (disabled) return;
    setLoading(true);
    setError('');
    if (refresh) setGaps('');
    try {
      const res = await api.post<{ gaps: string; cached?: boolean }>(
        `/chat/gaps${refresh ? '?refresh=true' : ''}`,
        { document_ids: docIds },
      );
      setGaps(res.data.gaps);
      setCached(Boolean(res.data.cached));
    } catch {
      setError('Failed to identify gaps. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-canvas">
      <div className="p-4 border-b border-line bg-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => identify(false)}
            disabled={disabled || loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-clay text-white rounded-lg text-sm font-medium
              hover:bg-clay-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {loading ? 'Analyzing…' : 'Identify Research Gaps'}
          </button>
          {gaps && !loading && (
            <button
              onClick={() => identify(true)}
              title="Regenerate (ignore cache)"
              className="flex items-center justify-center w-10 h-10 rounded-lg border border-line text-muted hover:text-ink hover:bg-surface2 transition-colors flex-shrink-0"
            >
              <RefreshCw size={15} />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-subtle">
            {disabled
              ? 'Select at least 2 documents to identify gaps'
              : `Analyzing ${docIds.length} document${docIds.length !== 1 ? 's' : ''}`}
          </p>
          {gaps && cached && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-surface2 text-subtle">cached</span>
          )}
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {gaps ? (
          <>
            <div className="flex items-center gap-3 mb-3 px-1">
              <span className="flex items-center gap-1 text-[11px] text-subtle">
                <span className="w-2.5 h-2.5 rounded-sm bg-green-200" /> stated = author&apos;s own
              </span>
              <span className="flex items-center gap-1 text-[11px] text-subtle">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-200" /> inferred = deduced
              </span>
            </div>
            <div className="bg-surface border border-line rounded-xl p-5
              prose prose-sm max-w-none
              prose-headings:text-ink prose-headings:font-semibold
              prose-h2:text-base prose-h2:mt-5 prose-h2:mb-2 prose-h2:first:mt-0
              prose-ul:my-1.5 prose-li:my-1
              prose-p:my-1.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{gaps}</ReactMarkdown>
            </div>
          </>
        ) : loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-3 text-muted text-sm">
              <Loader2 size={18} className="animate-spin text-clay" />
              Profiling papers and analyzing gaps…
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <div className="text-3xl mb-3">🔍</div>
              <p className="text-sm text-muted">Identify unstudied areas and methodological gaps</p>
              <p className="text-xs text-subtle mt-1">Grounded in each paper, with stated vs inferred labels</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
