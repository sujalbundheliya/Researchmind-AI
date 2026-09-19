'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '@/lib/api';

interface FindingsPanelProps {
  docId: string;
}

export default function FindingsPanel({ docId }: FindingsPanelProps) {
  const [findings, setFindings] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(true);

  const extract = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ findings: string }>(`/chat/findings/${docId}`);
      setFindings(res.data.findings);
      setExpanded(true);
    } catch {
      setError('Failed to extract findings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-canvas">
      <div className="p-4 border-b border-line bg-surface flex-shrink-0">
        <button
          onClick={extract}
          disabled={loading}
          className="w-full py-2.5 px-3 bg-clay text-white rounded-lg text-sm font-medium
            hover:bg-clay-hover transition-colors disabled:opacity-50"
        >
          {loading ? 'Extracting…' : findings ? 'Re-extract Findings' : 'Extract Key Findings'}
        </button>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {findings ? (
          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-subtle hover:text-ink mb-3 flex items-center gap-1"
            >
              <span>{expanded ? '▼' : '▶'}</span>
              {expanded ? 'Collapse' : 'Expand'}
            </button>
            {expanded && (
              <div className="bg-surface border border-line rounded-xl p-5
                prose prose-sm max-w-none
                prose-headings:text-ink prose-headings:font-semibold
                prose-h2:text-base prose-h2:mt-4 prose-h2:mb-2
                prose-ul:my-1 prose-li:my-0.5
                prose-p:text-ink prose-p:my-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{findings}</ReactMarkdown>
              </div>
            )}
          </div>
        ) : !loading ? (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <div className="text-3xl mb-3">📋</div>
              <p className="text-sm text-muted">
                Extract structured key findings from this paper
              </p>
              <p className="text-xs text-subtle mt-1">
                Objective · Methodology · Findings · Conclusions · Limitations
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-3 text-muted text-sm">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-clay" />
              Extracting findings…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
