'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, User } from '@/lib/auth';
import { canCreate as canCreateFeature } from '@/lib/plan';
import api from '@/lib/api';
import { Table2, Plus, ArrowRight, X, Crown } from 'lucide-react';

interface ExtractionTableMeta {
  id: string;
  name: string;
  columns: { name: string; description: string }[];
  doc_count: number;
  created_at: string;
}

interface Column { name: string; description: string; }

export default function ExtractionPage() {
  const router = useRouter();
  const [tables, setTables] = useState<ExtractionTableMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // create-modal state
  const [name, setName] = useState('');
  const [columns, setColumns] = useState<Column[]>([{ name: '', description: '' }]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const u = await getCurrentUser();
    if (!u) { router.push('/login'); return; }
    setUser(u);
    try {
      const res = await api.get<ExtractionTableMeta[]>('/extraction/tables');
      setTables(res.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const locked = user ? !canCreateFeature(user, 'extraction') : false;
  const openCreate = () => {
    if (locked) { router.push('/dashboard/billing'); return; }
    setName(''); setColumns([{ name: '', description: '' }]); setError('');
    setShowCreate(true);
  };

  const updateColumn = (i: number, key: keyof Column, value: string) =>
    setColumns(prev => prev.map((c, idx) => idx === i ? { ...c, [key]: value } : c));
  const addColumn = () => setColumns(prev => [...prev, { name: '', description: '' }]);
  const removeColumn = (i: number) => setColumns(prev => prev.filter((_, idx) => idx !== i));

  const validColumns = columns.filter(c => c.name.trim());
  const canCreate = name.trim() && validColumns.length > 0;

  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    setError('');
    try {
      const res = await api.post<{ id: string }>('/extraction/tables', {
        name: name.trim(),
        columns: validColumns.map(c => ({ name: c.name.trim(), description: c.description.trim() })),
      });
      router.push(`/extraction/${res.data.id}?extract=1`);
    } catch {
      setError('Failed to create table. Please try again.');
      setCreating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Data Extraction</h1>
          <p className="text-muted text-sm mt-1">Define columns once, then extract structured data from every paper.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm flex-shrink-0"
        >
          {locked ? <><Crown size={15} /> Upgrade for more</> : <><Plus size={15} /> New Table</>}
        </button>
      </div>

      {locked && (
        <div className="mb-4 flex items-center gap-2 text-xs bg-clay/10 text-clay rounded-lg px-3 py-2">
          <Crown size={13} /> Free plan includes 1 extraction table. Upgrade for unlimited.
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-surface rounded-xl border border-line animate-pulse" />)}
        </div>
      ) : tables.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-line rounded-xl bg-surface">
          <Table2 size={32} className="mx-auto text-subtle mb-3" />
          <p className="text-muted font-medium text-sm mb-1">No extraction tables yet</p>
          <p className="text-subtle text-xs mb-4">Create a table with the fields you want pulled from each paper.</p>
          <button onClick={openCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            {locked ? 'Upgrade for more' : 'New Table'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tables.map(t => (
            <button
              key={t.id}
              onClick={() => router.push(`/extraction/${t.id}`)}
              className="group w-full text-left bg-surface border border-line rounded-xl p-5 hover:border-clay hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <p className="text-sm font-semibold text-ink truncate">{t.name}</p>
                <ArrowRight size={16} className="text-subtle opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {t.columns.slice(0, 5).map(c => (
                  <span key={c.name} className="px-2 py-0.5 rounded-full bg-surface2 text-muted text-xs">{c.name}</span>
                ))}
                {t.columns.length > 5 && <span className="text-xs text-subtle">+{t.columns.length - 5} more</span>}
              </div>
              <p className="text-xs text-muted">{t.columns.length} column{t.columns.length !== 1 ? 's' : ''} · {t.doc_count} doc{t.doc_count !== 1 ? 's' : ''} extracted</p>
            </button>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !creating && setShowCreate(false)}>
          <div className="bg-surface rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="text-base font-semibold text-ink">New Extraction Table</h2>
              <button onClick={() => setShowCreate(false)} className="text-subtle hover:text-ink text-2xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Table Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. RCT Characteristics"
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clay"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">Columns</label>
                <p className="text-xs text-subtle mb-2">Each column is a field the AI will extract from every paper.</p>
                <div className="space-y-2">
                  {columns.map((col, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="flex-1 space-y-1.5">
                        <input
                          value={col.name}
                          onChange={e => updateColumn(i, 'name', e.target.value)}
                          placeholder="Column name (e.g. Sample Size)"
                          className="w-full border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay"
                        />
                        <input
                          value={col.description}
                          onChange={e => updateColumn(i, 'description', e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && i === columns.length - 1 && col.name.trim()) { e.preventDefault(); addColumn(); } }}
                          placeholder="What to extract — e.g. 'total participants enrolled'"
                          className="w-full border border-line rounded-lg px-3 py-1.5 text-xs text-muted focus:outline-none focus:ring-2 focus:ring-clay"
                        />
                      </div>
                      {columns.length > 1 && (
                        <button onClick={() => removeColumn(i)} className="p-1.5 text-subtle hover:text-red-500 hover:bg-red-50 rounded-lg mt-0.5">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={addColumn} className="mt-2 flex items-center gap-1.5 text-xs font-medium text-clay hover:underline">
                  <Plus size={13} /> Add column
                </button>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 p-5 border-t border-line">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-muted hover:text-ink">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={creating || !canCreate}
                className="px-4 py-2 bg-clay text-white rounded-lg text-sm font-medium hover:bg-clay-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating…' : 'Create Table'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
