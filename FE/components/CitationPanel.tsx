'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';

interface Citations {
  apa?: string;
  mla?: string;
  chicago?: string;
  ieee?: string;
  harvard?: string;
  raw_metadata?: Record<string, unknown>;
}

interface CitationPanelProps {
  docId: string;
  docName: string;
  onClose: () => void;
}

type Format = 'apa' | 'mla' | 'chicago' | 'ieee' | 'harvard';
const FORMATS: Format[] = ['apa', 'mla', 'chicago', 'ieee', 'harvard'];

export default function CitationPanel({ docId, docName, onClose }: CitationPanelProps) {
  const [citations, setCitations] = useState<Citations | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Format>('apa');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get<Citations>(`/citations/${docId}`)
      .then(res => setCitations(res.data))
      .catch(() => setCitations({}))
      .finally(() => setLoading(false));
  }, [docId]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const currentCitation = citations?.[activeTab] || '';
  const source = (citations?.raw_metadata as { source?: string } | undefined)?.source;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-xl shadow-xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <div>
            <h3 className="text-base font-semibold text-ink">Citations</h3>
            <p className="text-xs text-subtle mt-0.5 truncate max-w-xs">{docName}</p>
          </div>
          <button onClick={onClose} className="text-subtle hover:text-ink text-2xl leading-none">×</button>
        </div>

        {/* Format tabs */}
        <div className="flex border-b border-line px-5">
          {FORMATS.map(fmt => (
            <button
              key={fmt}
              onClick={() => setActiveTab(fmt)}
              className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors uppercase ${
                activeTab === fmt
                  ? 'border-clay text-clay'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>

        {/* Citation content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-subtle text-sm">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-clay" />
              Extracting citation metadata…
            </div>
          ) : currentCitation ? (
            <div className="space-y-3">
              {source === 'crossref' ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                  ✓ Verified via Crossref (DOI)
                </span>
              ) : source === 'ai' ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
                  ⚠ AI-extracted — verify before use
                </span>
              ) : null}
              <div className="bg-canvas border border-line rounded-xl p-4">
                <p className="text-sm text-ink leading-relaxed font-mono">{currentCitation}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-subtle">Citation not available for this format.</p>
          )}
        </div>

        {/* Actions */}
        {currentCitation && (
          <div className="p-5 border-t border-line flex justify-between items-center">
            <button
              onClick={() => handleCopy(currentCitation)}
              className="px-4 py-2 bg-clay text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              {copied ? 'Copied ✓' : 'Copy Citation'}
            </button>
            <button
              onClick={() => {
                const all = FORMATS.map(f => `${f.toUpperCase()}\n${citations?.[f] || 'N/A'}`).join('\n\n');
                handleCopy(all);
              }}
              className="text-xs text-subtle hover:text-ink"
            >
              Copy all formats
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
