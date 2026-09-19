'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import api from '@/lib/api';
import dynamic from 'next/dynamic';
import ScreeningCard, { Screening } from '@/components/ScreeningCard';
import type { PdfHighlight } from '@/components/PdfViewer';
import { ArrowLeft, Download, ChevronDown, ChevronRight, FlaskConical } from 'lucide-react';

// pdf.js reaches for browser-only globals (DOMMatrix, Canvas) the moment it is
// imported, which crashes the Node server render with `DOMMatrix is not
// defined`. Loading it client-side only keeps the page server-renderable.
const PdfViewer = dynamic(() => import('@/components/PdfViewer'), { ssr: false });

interface Review {
  id: string;
  title: string;
  research_question: string;
  inclusion_criteria: string;
  exclusion_criteria: string;
  status: string;
  screenings: Screening[];
}

export default function ReviewDetailPage() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const router = useRouter();
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCriteria, setShowCriteria] = useState(false);

  // One viewer for the whole page — cards request it rather than each holding
  // their own copy of a full-screen modal.
  const [pdfTarget, setPdfTarget] = useState<{
    docId: string;
    docName: string;
    highlights: PdfHighlight[];
    page?: number;
  } | null>(null);

  const openPdf = useCallback((screening: Screening, highlights: PdfHighlight[], page?: number) => {
    setPdfTarget({
      docId: screening.document_id,
      docName: screening.doc_name,
      highlights,
      page,
    });
  }, []);

  const load = useCallback(async () => {
    const u = await getCurrentUser();
    if (!u) { router.push('/login'); return; }
    try {
      const res = await api.get<Review>(`/reviews/${reviewId}`);
      setReview(res.data);
    } catch {
      router.push('/review');
    } finally {
      setLoading(false);
    }
  }, [reviewId, router]);

  useEffect(() => { load(); }, [load]);

  const handleScreeningUpdate = (id: string, decision: string) => {
    setReview(prev => prev ? {
      ...prev,
      screenings: prev.screenings.map(s => s.id === id ? { ...s, decision: decision as Screening['decision'] } : s)
    } : prev);
  };

  const handleExport = () => {
    window.open(`${process.env.NEXT_PUBLIC_API_URL}/reviews/${reviewId}/export`, '_blank');
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-clay" />
    </div>
  );

  if (!review) return null;

  const screenings = review.screenings || [];
  const included = screenings.filter(s => s.decision === 'include').length;
  const excluded = screenings.filter(s => s.decision === 'exclude').length;
  const maybe = screenings.filter(s => s.decision === 'maybe').length;

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => router.push('/dashboard/review')} className="flex items-center gap-1.5 text-xs text-clay hover:underline mb-4">
        <ArrowLeft size={14} /> All Reviews
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0 mt-0.5">
            <FlaskConical size={18} />
          </div>
          <h1 className="text-2xl font-bold text-ink leading-tight">{review.title}</h1>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-clay text-clay rounded-lg hover:bg-blue-50 transition-colors flex-shrink-0"
        >
          <Download size={13} /> Export CSV
        </button>
      </div>
      <p className="text-muted text-sm mb-4 pl-[52px]">{review.research_question}</p>

      <button onClick={() => setShowCriteria(!showCriteria)} className="inline-flex items-center gap-1 text-xs font-medium text-clay hover:underline mb-6 ml-[52px]">
        {showCriteria ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {showCriteria ? 'Hide criteria' : 'Show criteria'}
      </button>

      {showCriteria && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 p-4 bg-surface rounded-xl border border-line text-xs">
          <div>
            <p className="font-semibold text-green-700 mb-1">Inclusion</p>
            <p className="text-muted whitespace-pre-wrap leading-relaxed">{review.inclusion_criteria}</p>
          </div>
          <div>
            <p className="font-semibold text-red-600 mb-1">Exclusion</p>
            <p className="text-muted whitespace-pre-wrap leading-relaxed">{review.exclusion_criteria}</p>
          </div>
        </div>
      )}

      {/* PRISMA counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Screened', value: screenings.length, color: 'text-ink' },
          { label: 'Include', value: included, color: 'text-green-600' },
          { label: 'Exclude', value: excluded, color: 'text-red-500' },
          { label: 'Maybe', value: maybe, color: 'text-yellow-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-surface border border-line rounded-xl p-5 text-center">
            <p className={`text-3xl font-bold ${color} leading-tight`}>{value}</p>
            <p className="text-xs text-muted mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Screenings */}
      <div>
        <h2 className="text-base font-semibold text-ink mb-3">
          Screening Results
          {screenings.length > 0 && <span className="text-subtle font-normal ml-1.5 text-sm">({screenings.length})</span>}
        </h2>

        {screenings.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-line rounded-xl text-subtle text-sm">
            No papers screened yet.
          </div>
        ) : (
          <div className="space-y-3">
            {screenings.map(s => (
              <ScreeningCard
                key={s.id}
                screening={s}
                reviewId={reviewId}
                onUpdate={handleScreeningUpdate}
                onOpenPdf={openPdf}
              />
            ))}
          </div>
        )}
      </div>

      {pdfTarget && (
        <PdfViewer
          docId={pdfTarget.docId}
          docName={pdfTarget.docName}
          highlights={pdfTarget.highlights}
          initialPage={pdfTarget.page}
          onClose={() => setPdfTarget(null)}
        />
      )}
    </div>
  );
}
