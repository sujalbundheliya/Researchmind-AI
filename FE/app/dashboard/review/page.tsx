'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, User } from '@/lib/auth';
import { canCreate } from '@/lib/plan';
import api from '@/lib/api';
import ReviewWizard from '@/components/ReviewWizard';
import { FlaskConical, Plus, ArrowRight, Crown } from 'lucide-react';

interface Review {
  id: string;
  title: string;
  research_question: string;
  status: string;
  screened_count: number;
  included_count: number;
  excluded_count: number;
  maybe_count: number;
  created_at: string;
}

export default function ReviewPage() {
  const router = useRouter();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const load = useCallback(async () => {
    const u = await getCurrentUser();
    if (!u) { router.push('/login'); return; }
    setUser(u);
    try {
      const res = await api.get<Review[]>('/reviews');
      setReviews(res.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const locked = user ? !canCreate(user, 'review') : false;
  const handleNew = () => {
    if (locked) { router.push('/dashboard/billing'); return; }
    setShowWizard(true);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Systematic Review</h1>
          <p className="text-muted text-sm mt-1">Screen papers against inclusion &amp; exclusion criteria with AI assistance.</p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm flex-shrink-0"
        >
          {locked ? <><Crown size={15} /> Upgrade for more</> : <><Plus size={15} /> New Review</>}
        </button>
      </div>

      {locked && (
        <div className="mb-4 flex items-center gap-2 text-xs bg-clay/10 text-clay rounded-lg px-3 py-2">
          <Crown size={13} /> Free plan includes 1 systematic review. Upgrade for unlimited.
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-surface rounded-xl border border-line animate-pulse" />)}
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-line rounded-xl bg-surface">
          <FlaskConical size={32} className="mx-auto text-subtle mb-3" />
          <p className="text-muted font-medium text-sm mb-1">No reviews yet</p>
          <p className="text-subtle text-xs mb-4">Start a systematic review to screen your papers against defined criteria.</p>
          <button onClick={handleNew}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            {locked ? 'Upgrade for more' : 'New Review'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map(r => (
            <button
              key={r.id}
              onClick={() => router.push(`/review/${r.id}`)}
              className="group w-full text-left bg-surface border border-line rounded-xl p-5 hover:border-clay hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{r.title}</p>
                  <p className="text-xs text-muted mt-0.5 line-clamp-2">{r.research_question}</p>
                </div>
                <ArrowRight size={16} className="text-subtle opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-muted">{r.screened_count} screened</span>
                <span className="text-green-600 font-medium">{r.included_count} include</span>
                <span className="text-red-500 font-medium">{r.excluded_count} exclude</span>
                <span className="text-yellow-600 font-medium">{r.maybe_count} maybe</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {showWizard && <ReviewWizard onClose={() => setShowWizard(false)} />}
    </div>
  );
}
