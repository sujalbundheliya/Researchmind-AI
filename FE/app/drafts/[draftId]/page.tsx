'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import api from '@/lib/api';
import DraftEditor from '@/components/DraftEditor';

interface SupportingPaper { paper: string; page?: string }
interface Finding {
  statement: string;
  type?: string;
  supporting_papers?: SupportingPaper[];
  why?: string;
  implication?: string;
  confidence?: 'high' | 'medium' | 'low';
}
interface Contradiction {
  topic: string;
  paper_a: { paper: string; claim: string; page?: string };
  paper_b: { paper: string; claim: string; page?: string };
}
interface Gap { gap: string; evidence: string; supported_by?: string[] }
interface EvidenceRow { finding: string; papers: string[]; confidence?: string }
interface Diagnostics {
  papers_selected?: number;
  papers_represented?: number;
  papers_total_with_content?: number;
  cross_paper_insights?: number;
  contradictions?: number;
  gaps?: number;
  findings?: number;
}
interface Synthesis {
  findings?: Finding[];
  contradictions?: Contradiction[];
  gaps?: Gap[];
  evidence_matrix?: EvidenceRow[];
}

interface Validation {
  documents_used?: string[];
  uncited_documents?: string[];
  missing_documents?: string[];
  invented_documents?: string[];
  unsupported_count?: number;
  synthesis?: Synthesis;
  diagnostics?: Diagnostics;
}

const CONF_STYLE: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-rose-100 text-rose-800',
};

function ConfidencePill({ c }: { c?: string }) {
  if (!c) return null;
  return <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${CONF_STYLE[c] || 'bg-gray-100 text-gray-700'}`}>{c}</span>;
}

function SynthesisAudit({ s, d }: { s: Synthesis; d?: Diagnostics }) {
  const [open, setOpen] = useState(false);
  const stats: [string, number | undefined][] = [
    ['Papers used', d ? d.papers_represented : undefined],
    ['Cross-paper insights', d?.cross_paper_insights],
    ['Contradictions', d?.contradictions],
    ['Gaps', d?.gaps],
  ];
  return (
    <div className="border-b border-line bg-surface flex-shrink-0">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-2.5 text-sm hover:bg-surface2">
        <span className="flex items-center gap-3 text-ink font-medium">
          Synthesis audit
          {d && <span className="text-subtle font-normal">
            {d.papers_represented}/{d.papers_selected ?? d.papers_total_with_content} papers · {d.findings ?? s.findings?.length ?? 0} findings · {d.contradictions ?? 0} contradictions · {d.gaps ?? 0} gaps
          </span>}
        </span>
        <span className="text-subtle text-xs">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="px-6 pb-4 space-y-4 text-sm max-h-[46vh] overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {stats.map(([label, val]) => (
              <div key={label} className="bg-surface2 rounded-lg px-3 py-2">
                <div className="text-lg font-semibold text-ink">{val ?? '—'}</div>
                <div className="text-xs text-subtle">{label}</div>
              </div>
            ))}
          </div>

          {s.evidence_matrix?.length ? (
            <div>
              <h4 className="font-semibold text-ink mb-1.5">Evidence matrix</h4>
              <div className="overflow-x-auto border border-line rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-surface2 text-subtle">
                    <tr><th className="text-left px-3 py-1.5 font-medium">Finding</th>
                        <th className="text-left px-3 py-1.5 font-medium">Supporting papers</th>
                        <th className="text-left px-3 py-1.5 font-medium">Confidence</th></tr>
                  </thead>
                  <tbody>
                    {s.evidence_matrix.map((r, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="px-3 py-1.5 text-ink">{r.finding}</td>
                        <td className="px-3 py-1.5 text-muted">{r.papers.join(', ')}</td>
                        <td className="px-3 py-1.5"><ConfidencePill c={r.confidence} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {s.contradictions?.length ? (
            <div>
              <h4 className="font-semibold text-ink mb-1.5">Contradictions</h4>
              <ul className="space-y-2">
                {s.contradictions.map((c, i) => (
                  <li key={i} className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    <div className="font-medium text-rose-900">{c.topic}</div>
                    <div className="text-xs text-rose-800 mt-1">
                      <span className="font-medium">{c.paper_a.paper}:</span> {c.paper_a.claim}
                    </div>
                    <div className="text-xs text-rose-800">
                      <span className="font-medium">{c.paper_b.paper}:</span> {c.paper_b.claim}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {s.gaps?.length ? (
            <div>
              <h4 className="font-semibold text-ink mb-1.5">Evidence-backed gaps</h4>
              <ul className="space-y-2">
                {s.gaps.map((g, i) => (
                  <li key={i} className="bg-surface2 rounded-lg px-3 py-2">
                    <div className="text-ink">{g.gap}</div>
                    <div className="text-xs text-subtle mt-1">Evidence: {g.evidence}{g.supported_by?.length ? ` — ${g.supported_by.join(', ')}` : ''}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

interface Draft {
  id: string;
  title: string;
  content: string;
  mode: string;
  document_ids: string[];
  created_at: string;
  validation?: Validation | null;
}

function ProvenanceBanner({ v }: { v: Validation }) {
  const warnings: string[] = [];
  if (v.missing_documents?.length) warnings.push(...v.missing_documents);
  if (v.uncited_documents?.length) warnings.push(`Not reflected in the draft: ${v.uncited_documents.join(', ')}`);
  if (v.invented_documents?.length) warnings.push(`Removed citations to non-selected sources: ${v.invented_documents.join(', ')}`);
  if (v.unsupported_count) warnings.push(`${v.unsupported_count} point(s) could not be grounded in the papers`);

  const hasWarnings = warnings.length > 0;
  return (
    <div className={`px-6 py-2.5 text-sm border-b flex-shrink-0 ${hasWarnings ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
      {v.documents_used?.length ? (
        <div><span className="font-medium">Grounded in:</span> {v.documents_used.join(', ')}</div>
      ) : null}
      {hasWarnings && (
        <ul className="mt-1 list-disc list-inside space-y-0.5">
          {warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
    </div>
  );
}

export default function DraftDetailPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const u = await getCurrentUser();
    if (!u) { router.push('/login'); return; }
    try {
      const res = await api.get<Draft>(`/writing/drafts/${draftId}`);
      setDraft(res.data);
    } catch {
      router.push('/dashboard/drafts');
    } finally {
      setLoading(false);
    }
  }, [draftId, router]);

  useEffect(() => { load(); }, [load]);

  const handleUpdate = useCallback((content: string) => {
    setDraft(prev => prev ? { ...prev, content } : prev);
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full bg-canvas">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!draft) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-canvas">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 px-6 py-3.5 bg-surface border-b border-line text-sm flex-shrink-0 shadow-sm">
        <button onClick={() => router.push('/dashboard/drafts')}
          className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
          ← Drafts
        </button>
        <span className="text-subtle">/</span>
        <span className="text-ink font-medium truncate">{draft.title}</span>
      </div>

      {draft.validation && <ProvenanceBanner v={draft.validation} />}
      {draft.validation?.synthesis && (
        <SynthesisAudit s={draft.validation.synthesis} d={draft.validation.diagnostics} />
      )}

      <div className="flex-1 overflow-hidden">
        <DraftEditor draft={draft} onUpdate={handleUpdate} />
      </div>
    </div>
  );
}
