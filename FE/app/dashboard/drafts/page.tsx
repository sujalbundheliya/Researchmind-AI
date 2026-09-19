'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, User } from '@/lib/auth';
import { canCreate } from '@/lib/plan';
import api from '@/lib/api';
import Toaster from '@/components/Toaster';
import { useToast } from '@/lib/toast';
import { FileEdit, Plus, Trash2, ArrowRight, Crown, ChevronDown, Check } from 'lucide-react';

interface Draft {
  id: string;
  title: string;
  mode: string;
  document_ids: string[];
  char_count: number;
  created_at: string;
}

interface Document {
  id: string;
  original_name: string;
  status: string;
}

const MODES: { value: string; label: string; help: string }[] = [
  { value: 'literature_review', label: 'Literature Review', help: 'Synthesize findings across selected papers' },
  { value: 'survey_analysis', label: 'Survey Analysis', help: 'Thematic taxonomy and landscape of approaches' },
  { value: 'abstract', label: 'Abstract', help: 'A concise structured abstract' },
  { value: 'introduction', label: 'Introduction', help: 'Background and motivation section' },
  { value: 'discussion', label: 'Discussion', help: 'Interpretation and implications' },
  { value: 'peer_review', label: 'Peer Review', help: 'Significance, soundness, and required improvements' },
  { value: 'threats_to_validity', label: 'Threats to Validity', help: 'Internal, external, and construct validity threats' },
  { value: 'methodological_critique', label: 'Methodological Critique', help: 'Design, baselines, ablations, and confounds' },
  { value: 'custom', label: 'Custom', help: 'Your own instruction' },
];

const MODE_LABELS: Record<string, string> = Object.fromEntries(MODES.map(m => [m.value, m.label]));

function TypeDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({ top: 0, bottom: 0, left: 0, width: 0, dropUp: false });
  const selected = MODES.find(m => m.value === value) ?? MODES[0];

  // The menu is rendered with position:fixed so it escapes the modal's
  // overflow-y-auto scroll container (which would otherwise clip it). We anchor
  // it to the trigger's viewport rect and flip upward when there's no room below.
  const reposition = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const menuH = Math.min(MODES.length * 60 + 8, 288); // matches max-h-72
    const spaceBelow = window.innerHeight - r.bottom;
    const dropUp = spaceBelow < menuH + 12 && r.top > spaceBelow;
    setCoords({ top: r.bottom, bottom: r.top, left: r.left, width: r.width, dropUp });
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true); // capture: also catch modal scroll
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, reposition]);

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm bg-surface text-left transition-colors ${
          open ? 'border-clay ring-2 ring-clay/30' : 'border-line hover:border-clay/60'
        }`}
      >
        <span className="text-ink font-medium truncate">{selected.label}</span>
        <ChevronDown size={16} className={`text-subtle flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'fixed',
            left: coords.left,
            width: coords.width,
            top: coords.dropUp ? undefined : coords.top + 6,
            bottom: coords.dropUp ? window.innerHeight - coords.bottom + 6 : undefined,
          }}
          className="z-[60] bg-surface border border-line rounded-xl shadow-xl overflow-y-auto py-1 max-h-72"
        >
          {MODES.map(m => {
            const active = m.value === value;
            return (
              <button
                type="button"
                key={m.value}
                role="option"
                aria-selected={active}
                onClick={() => { onChange(m.value); setOpen(false); }}
                className={`w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors ${
                  active ? 'bg-clay-tint' : 'hover:bg-surface2'
                }`}
              >
                <span className="flex-shrink-0 w-4 mt-0.5">
                  {active && <Check size={15} className="text-clay" />}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm ${active ? 'text-clay font-semibold' : 'text-ink font-medium'}`}>{m.label}</span>
                  <span className="block text-xs text-subtle mt-0.5">{m.help}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DraftsPage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const { toasts, toast, removeToast } = useToast();

  // create-modal state
  const [docs, setDocs] = useState<Document[]>([]);
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState('literature_review');
  const [instruction, setInstruction] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const u = await getCurrentUser();
    if (!u) { router.push('/login'); return; }
    setUser(u);
    try {
      const res = await api.get<Draft[]>('/writing/drafts');
      setDrafts(res.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const locked = user ? !canCreate(user, 'draft') : false;
  const openCreate = async () => {
    if (locked) { router.push('/dashboard/billing'); return; }
    setTitle(''); setMode('literature_review'); setInstruction(''); setSelectedIds([]); setError('');
    setShowCreate(true);
    try {
      const res = await api.get<Document[]>('/documents');
      setDocs(res.data.filter(d => d.status === 'ready'));
    } catch { /* silent */ }
  };

  const toggleDoc = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleGenerate = async () => {
    if (!title.trim() || selectedIds.length === 0) return;
    setGenerating(true);
    setError('');
    try {
      const res = await api.post<{ id: string }>('/writing/drafts', {
        title: title.trim(),
        mode,
        document_ids: selectedIds,
        custom_instruction: mode === 'custom' ? instruction.trim() : null,
      });
      router.push(`/drafts/${res.data.id}`);
    } catch (err) {
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      setError(
        e.response?.status === 429
          ? (e.response?.data?.message || 'Daily AI usage limit reached. Please try again later.')
          : 'Failed to generate draft. Please try again.'
      );
      setGenerating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this draft?')) return;
    try {
      await api.delete(`/writing/drafts/${id}`);
      setDrafts(prev => prev.filter(d => d.id !== id));
      toast('Draft deleted');
    } catch {
      toast('Failed to delete draft', 'error');
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">AI Drafts</h1>
          <p className="text-muted text-sm mt-1">Generate grounded research writing from your documents.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm flex-shrink-0"
        >
          {locked ? <><Crown size={15} /> Upgrade for more</> : <><Plus size={15} /> New Draft</>}
        </button>
      </div>

      {locked && (
        <div className="mb-4 flex items-center gap-2 text-xs bg-clay/10 text-clay rounded-lg px-3 py-2">
          <Crown size={13} /> Free plan includes 1 AI draft. Upgrade for unlimited.
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-surface rounded-xl border border-line animate-pulse" />)}
        </div>
      ) : drafts.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-line rounded-xl bg-surface">
          <FileEdit size={32} className="mx-auto text-subtle mb-3" />
          <p className="text-muted font-medium text-sm mb-1">No drafts yet</p>
          <p className="text-subtle text-xs mb-4">Generate a literature review, abstract, or custom section from your papers.</p>
          <button onClick={openCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            {locked ? 'Upgrade for more' : 'New Draft'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {drafts.map(d => (
            <button
              key={d.id}
              onClick={() => router.push(`/drafts/${d.id}`)}
              className="group w-full text-left bg-surface border border-line rounded-xl px-5 py-4 hover:border-clay hover:shadow-sm transition-all flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink truncate">{d.title}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-subtle">
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{MODE_LABELS[d.mode] || d.mode}</span>
                  <span>{d.document_ids.length} doc{d.document_ids.length !== 1 ? 's' : ''}</span>
                  <span>·</span>
                  <span>{new Date(d.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <button onClick={e => handleDelete(e, d.id)}
                className="p-1.5 text-subtle hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                <Trash2 size={15} />
              </button>
              <ArrowRight size={16} className="text-subtle opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !generating && setShowCreate(false)}>
          <div className="bg-surface rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="text-base font-semibold text-ink">New AI Draft</h2>
              <button onClick={() => setShowCreate(false)} className="text-subtle hover:text-ink text-2xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Draft Title</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Literature Review — Transformer Architectures"
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clay"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">Type</label>
                <TypeDropdown value={mode} onChange={setMode} />
              </div>

              {mode === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Custom Instruction</label>
                  <textarea
                    value={instruction}
                    onChange={e => setInstruction(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="Describe what you want written…"
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clay resize-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-ink mb-1">
                  Source Documents {selectedIds.length > 0 && <span className="text-subtle font-normal">({selectedIds.length} selected)</span>}
                </label>
                {docs.length === 0 ? (
                  <p className="text-sm text-subtle py-2">No ready documents. Upload and process papers first.</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto border border-line rounded-lg p-2">
                    {docs.map(doc => (
                      <label key={doc.id} className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-surface2 cursor-pointer">
                        <input type="checkbox" checked={selectedIds.includes(doc.id)} onChange={() => toggleDoc(doc.id)} className="accent-clay" />
                        <span className="text-sm text-ink truncate">{doc.original_name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 p-5 border-t border-line">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-muted hover:text-ink">Cancel</button>
              <button
                onClick={handleGenerate}
                disabled={generating || !title.trim() || selectedIds.length === 0 || (mode === 'custom' && !instruction.trim())}
                className="px-4 py-2 bg-clay text-white rounded-lg text-sm font-medium hover:bg-clay-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {generating ? 'Generating…' : 'Generate Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toaster toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
