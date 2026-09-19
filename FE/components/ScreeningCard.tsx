'use client';

import { useState } from 'react';
import { UserCheck, FileText, Quote } from 'lucide-react';
import api from '@/lib/api';
// Type-only: importing the module for real would drag pdf.js into the server
// bundle, which throws `DOMMatrix is not defined` during SSR.
import type { PdfHighlight } from '@/components/PdfViewer';

export interface Evidence {
  quote: string;
  page: number;
  chunk_id?: string | null;
}

export interface Screening {
  id: string;
  document_id: string;
  doc_name: string;
  doc_status?: string;
  decision: 'include' | 'exclude' | 'maybe';
  reason: string;
  ai_decision?: string;
  ai_reason?: string;
  reviewed_at?: string | null;
  reviewer_name?: string | null;
  extracted_data?: { confidence?: string };
  evidence?: Evidence[] | null;
  created_at: string;
}

interface ScreeningCardProps {
  screening: Screening;
  reviewId: string;
  onUpdate: (id: string, decision: string) => void;
  /** Opens the shared PDF viewer, owned by the review page. */
  onOpenPdf: (screening: Screening, highlights: PdfHighlight[], page?: number) => void;
}

const DECISION_STYLES: Record<string, string> = {
  include: 'bg-green-50 text-green-700 border-green-200',
  exclude: 'bg-red-50 text-red-700 border-red-200',
  maybe: 'bg-yellow-50 text-yellow-700 border-yellow-200',
};

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'bg-blue-50 text-blue-700',
  medium: 'bg-surface2 text-muted',
  low: 'bg-orange-50 text-orange-600',
};

export default function ScreeningCard({ screening, reviewId, onUpdate, onOpenPdf }: ScreeningCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [saving, setSaving] = useState(false);

  const confidence = screening.extracted_data?.confidence || 'medium';

  const evidence = screening.evidence ?? [];
  const hasEvidence = evidence.length > 0;

  // Screenings recorded before evidence capture shipped have none. Rather than
  // disabling the viewer, open the PDF with no highlights — the reviewer still
  // gets the source in context, just without the passages marked.
  const highlights: PdfHighlight[] = evidence.map((e) => ({ quote: e.quote, page: e.page }));

  const openPdf = (page?: number) => onOpenPdf(screening, highlights, page);

  // Overridden when a reviewer timestamp exists, or the final decision no
  // longer matches the original AI decision (covers the just-overridden case
  // before a reload brings back reviewed_at).
  const aiDecision = screening.ai_decision || screening.decision;
  const overridden = !!screening.reviewed_at || aiDecision !== screening.decision;
  const reviewer = screening.reviewer_name || 'you';

  const handleOverride = async (newDecision: string) => {
    setSaving(true);
    try {
      await api.patch(`/reviews/${reviewId}/screenings/${screening.id}`, { decision: newDecision });
      onUpdate(screening.id, newDecision);
      setOverriding(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface border border-line rounded-xl p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <button
            onClick={() => openPdf()}
            title={`Open ${screening.doc_name}${hasEvidence ? ' with the supporting passages highlighted' : ''}`}
            className="group flex items-center gap-1.5 text-sm font-medium text-ink hover:text-clay transition-colors mb-2 max-w-full"
          >
            <FileText size={14} className="flex-shrink-0 text-subtle group-hover:text-clay transition-colors" />
            <span className="truncate underline decoration-transparent group-hover:decoration-clay underline-offset-2 transition-colors">
              {screening.doc_name}
            </span>
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize ${DECISION_STYLES[screening.decision] || DECISION_STYLES.maybe}`}>
              {screening.decision}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CONFIDENCE_STYLES[confidence] || CONFIDENCE_STYLES.medium}`}>
              {confidence} confidence
            </span>
            {overridden && (
              <>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-surface2 text-subtle line-through capitalize" title="Original AI decision">
                  AI: {aiDecision}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700" title={`Overridden by ${reviewer}`}>
                  <UserCheck size={11} /> Reviewed
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => openPdf()}
            title="Open the PDF with evidence highlighted"
            className="flex items-center gap-1 text-xs text-clay hover:bg-clay/10 px-2 py-1 border border-clay/40 rounded transition-colors"
          >
            <FileText size={12} /> PDF
          </button>
          <button
            onClick={() => setOverriding(!overriding)}
            className="text-xs text-subtle hover:text-ink px-2 py-1 border border-line rounded"
          >
            Override
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-clay hover:underline"
          >
            {expanded ? 'Hide' : 'Reason'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-line space-y-2">
          {overridden && (
            <p className="text-xs text-purple-700 bg-purple-50 border border-purple-100 rounded-lg px-2.5 py-1.5">
              Manually overridden from <span className="font-semibold capitalize">{aiDecision}</span> to{' '}
              <span className="font-semibold capitalize">{screening.decision}</span> by {reviewer}
              {screening.reviewed_at && ` · ${new Date(screening.reviewed_at).toLocaleString()}`}
            </p>
          )}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle mb-0.5">
              AI justification{overridden ? ' (original)' : ''}
            </p>
            <p className="text-xs text-muted leading-relaxed">{screening.ai_reason || screening.reason}</p>
          </div>

          {/* Verified quotes — each one jumps straight to its page in the PDF. */}
          {hasEvidence && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle mb-1.5 flex items-center gap-1">
                <Quote size={10} /> Supporting evidence
              </p>
              <div className="space-y-1.5">
                {evidence.map((e, i) => (
                  <button
                    key={i}
                    onClick={() => openPdf(e.page)}
                    title="Open this passage in the PDF"
                    className="w-full text-left p-2.5 rounded-lg border border-line bg-canvas hover:border-clay/50 hover:bg-clay/5 transition-colors group"
                  >
                    <p className="text-xs text-muted leading-relaxed italic">&ldquo;{e.quote}&rdquo;</p>
                    <p className="text-[10px] text-subtle mt-1 group-hover:text-clay transition-colors">
                      page {e.page} · click to view in PDF
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {overriding && (
        <div className="mt-3 pt-3 border-t border-line">
          <p className="text-xs text-muted mb-2">Override decision:</p>
          <div className="flex gap-2">
            {(['include', 'exclude', 'maybe'] as const).map((d) => (
              <button
                key={d}
                onClick={() => handleOverride(d)}
                disabled={saving || d === screening.decision}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border capitalize transition-colors disabled:opacity-40 ${
                  d === screening.decision
                    ? 'opacity-40 cursor-default'
                    : d === 'include'
                    ? 'border-green-300 text-green-700 hover:bg-green-50'
                    : d === 'exclude'
                    ? 'border-red-300 text-red-700 hover:bg-red-50'
                    : 'border-yellow-300 text-yellow-700 hover:bg-yellow-50'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
