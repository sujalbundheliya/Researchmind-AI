'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Layers, X, Loader2 } from 'lucide-react';

interface DocumentSummaryModalProps {
  docName: string;
  summary: string;
  loading: boolean;
  onClose: () => void;
}

export default function DocumentSummaryModal({ docName, summary, loading, onClose }: DocumentSummaryModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 border-b border-line">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-clay/10 flex items-center justify-center flex-shrink-0">
              <Layers size={16} className="text-clay" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-ink leading-tight">Paper Summary</h3>
              <p className="text-xs text-subtle truncate" title={docName}>{docName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-subtle hover:text-ink w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface2 flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-muted text-sm mb-4">
                <Loader2 size={18} className="animate-spin text-clay" />
                Reading the paper and writing a summary…
              </div>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-3 bg-surface2 rounded animate-pulse" style={{ width: `${[100, 92, 96, 80, 88][i]}%` }} />
              ))}
            </div>
          ) : (
            <div className="prose prose-sm max-w-none
              prose-headings:text-ink prose-headings:font-semibold
              prose-h2:text-base prose-h2:mt-5 prose-h2:mb-2
              prose-h3:text-sm prose-h3:mt-4 prose-h3:mb-1.5
              prose-p:text-ink prose-p:leading-relaxed prose-p:my-2.5
              prose-strong:text-ink prose-strong:font-semibold
              prose-ul:my-2 prose-li:my-1 prose-li:text-ink
              prose-a:text-clay">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
