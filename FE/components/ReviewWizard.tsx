'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';

interface Document {
  id: string;
  original_name: string;
  status: string;
}

interface ReviewWizardProps {
  onClose: () => void;
}

export default function ReviewWizard({ onClose }: ReviewWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [inclusion, setInclusion] = useState('');
  const [exclusion, setExclusion] = useState('');
  const [docs, setDocs] = useState<Document[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Document[]>('/documents')
      .then(res => setDocs(res.data.filter(d => d.status === 'ready')));
  }, []);

  const toggleDoc = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const reviewRes = await api.post<{ id: string }>('/reviews', {
        title, research_question: question, inclusion_criteria: inclusion, exclusion_criteria: exclusion,
      });
      const reviewId = reviewRes.data.id;

      if (selectedIds.length > 0) {
        await api.post(`/reviews/${reviewId}/screen-all`, { document_ids: selectedIds });
      }

      router.push(`/review/${reviewId}`);
      onClose();
    } catch {
      setError('Failed to create review. Please try again.');
      setSubmitting(false);
    }
  };

  const canNext = () => {
    if (step === 1) return title.trim() && question.trim();
    if (step === 2) return inclusion.trim();
    if (step === 3) return exclusion.trim();
    return true;
  };

  const steps = ['Title & Question', 'Inclusion Criteria', 'Exclusion Criteria', 'Select Documents'];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-line">
          <h2 className="text-base font-semibold text-ink">New Systematic Review</h2>
          <button onClick={onClose} className="text-subtle hover:text-ink text-2xl leading-none">×</button>
        </div>

        {/* Step indicators */}
        <div className="flex px-5 pt-4 gap-1">
          {steps.map((s, i) => (
            <div key={i} className="flex-1 text-center">
              <div className={`h-1.5 rounded-full mb-1 ${i + 1 <= step ? 'bg-clay' : 'bg-line'}`} />
              <p className={`text-xs ${i + 1 === step ? 'text-clay font-medium' : 'text-subtle'}`}>
                {s}
              </p>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Review Title</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clay"
                  placeholder="e.g. AI in Healthcare Systematic Review 2025"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Research Question</label>
                <textarea
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  rows={3}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clay resize-none"
                  placeholder="What is the effect of X on Y in population Z?"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Inclusion Criteria</label>
              <p className="text-xs text-subtle mb-2">Papers must meet ALL these criteria to be included</p>
              <textarea
                value={inclusion}
                onChange={e => setInclusion(e.target.value)}
                rows={6}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clay resize-none"
                placeholder="English language&#10;Published post-2015&#10;Randomized controlled trials&#10;Human studies only"
              />
            </div>
          )}

          {step === 3 && (
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Exclusion Criteria</label>
              <p className="text-xs text-subtle mb-2">Papers meeting ANY of these criteria will be excluded</p>
              <textarea
                value={exclusion}
                onChange={e => setExclusion(e.target.value)}
                rows={6}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clay resize-none"
                placeholder="Non-human studies&#10;Case reports&#10;Conference abstracts&#10;Grey literature"
              />
            </div>
          )}

          {step === 4 && (
            <div>
              <p className="text-sm text-muted mb-3">
                Select documents to screen ({docs.length} ready). You can screen more later.
              </p>
              {docs.length === 0 ? (
                <p className="text-sm text-subtle">No ready documents. Upload and process papers first.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {docs.map(doc => (
                    <label key={doc.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-surface2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(doc.id)}
                        onChange={() => toggleDoc(doc.id)}
                        className="accent-clay"
                      />
                      <span className="text-sm text-ink truncate">{doc.original_name}</span>
                    </label>
                  ))}
                </div>
              )}
              {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-line">
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="px-4 py-2 text-sm text-muted hover:text-ink"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < 4 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext()}
              className="px-4 py-2 bg-clay text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 bg-clay text-white rounded-lg text-sm font-medium hover:bg-clay-hover disabled:opacity-50"
            >
              {submitting
                ? 'Creating & Screening…'
                : selectedIds.length > 0
                ? `Create & Screen ${selectedIds.length} Papers`
                : 'Create Review'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
