'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import api from '@/lib/api';
import ExtractionTable from '@/components/ExtractionTable';
import { ArrowLeft, Sparkles, Download, Search, X, RotateCw } from 'lucide-react';

interface Column { name: string; description: string; }
type Confidence = 'high' | 'medium' | 'low' | 'verified';
interface CellData { value: string; confidence: Confidence; page?: number | null; chunk_id?: string | null; source_text?: string | null; edited?: boolean; }
interface Row { id: string; document_id: string; doc_name: string; data: Record<string, CellData>; }
interface TableMeta { id: string; name: string; columns: Column[]; }
interface Document { id: string; original_name: string; status: string; }

interface Progress {
  total: number;
  done: number;
  currentName: string;
  failedIds: string[];
  running: boolean;
  note?: string;
}

const MAX_DOCS = 20;

export default function ExtractionDetailPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const router = useRouter();
  const [table, setTable] = useState<TableMeta | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [showPicker, setShowPicker] = useState(false);
  const [docs, setDocs] = useState<Document[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const [progress, setProgress] = useState<Progress | null>(null);
  const [autoOpened, setAutoOpened] = useState(false);

  const load = useCallback(async () => {
    const u = await getCurrentUser();
    if (!u) { router.push('/login'); return; }
    try {
      const res = await api.get<{ table: TableMeta; rows: Row[] }>(`/extraction/tables/${tableId}`);
      setTable(res.data.table);
      setRows(res.data.rows);
    } catch {
      router.push('/dashboard/extraction');
    } finally {
      setLoading(false);
    }
  }, [tableId, router]);

  useEffect(() => { load(); }, [load]);

  // Merge a freshly extracted/edited row into local state by document_id so the
  // table fills in incrementally without a full reload.
  const upsertRow = useCallback((raw: { id: string; document_id: string; data: Record<string, CellData> }, fallbackName: string) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.document_id === raw.document_id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], id: raw.id, data: raw.data };
        return copy;
      }
      return [...prev, { id: raw.id, document_id: raw.document_id, doc_name: fallbackName, data: raw.data }];
    });
  }, []);

  const openPicker = useCallback(async () => {
    setSelectedIds([]); setSearch(''); setError('');
    setShowPicker(true);
    try {
      const res = await api.get<Document[]>('/documents');
      setDocs(res.data.filter(d => d.status === 'ready'));
    } catch { /* silent */ }
  }, []);

  // Fresh from "Create Table": auto-open the paper picker so the user goes
  // straight from defining columns to extracting, without a blank in-between.
  useEffect(() => {
    if (loading || autoOpened) return;
    const wantsExtract = new URLSearchParams(window.location.search).get('extract') === '1';
    if (wantsExtract && rows.length === 0) {
      setAutoOpened(true);
      openPicker();
      window.history.replaceState(null, '', `/extraction/${tableId}`);
    }
  }, [loading, autoOpened, rows.length, tableId, openPicker]);

  const toggleDoc = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // Client-driven extraction: iterate the per-document endpoint with limited
  // concurrency so the UI shows live progress, fills rows incrementally, and
  // isolates per-document failures (instead of one opaque blocking call).
  const runExtraction = useCallback(async (docIds: string[]) => {
    if (docIds.length === 0) return;
    const nameById = new Map(docs.map(d => [d.id, d.original_name]));
    setProgress({ total: docIds.length, done: 0, currentName: '', failedIds: [], running: true });

    const CONCURRENCY = 3;
    let cursor = 0;

    const worker = async () => {
      while (cursor < docIds.length) {
        const docId = docIds[cursor++];
        const name = nameById.get(docId) || rows.find(r => r.document_id === docId)?.doc_name || 'Document';
        setProgress(p => p ? { ...p, currentName: name } : p);
        try {
          const res = await api.post(`/extraction/tables/${tableId}/extract/${docId}`);
          upsertRow(res.data, name);
          setProgress(p => p ? { ...p, done: p.done + 1 } : p);
        } catch (err) {
          const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
          setProgress(p => p ? { ...p, done: p.done + 1, failedIds: [...p.failedIds, docId], note: msg || p.note } : p);
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, docIds.length) }, worker));
    setProgress(p => p ? { ...p, running: false, currentName: '' } : p);
  }, [docs, rows, tableId, upsertRow]);

  const startExtraction = () => {
    if (selectedIds.length === 0 || selectedIds.length > MAX_DOCS) return;
    setShowPicker(false);
    runExtraction(selectedIds);
  };

  // Per-row actions wired into the results table.
  const handleReExtract = useCallback(async (row: Row) => {
    const res = await api.post(`/extraction/tables/${tableId}/extract/${row.document_id}`);
    upsertRow(res.data, row.doc_name);
  }, [tableId, upsertRow]);

  const handleEditCell = useCallback(async (row: Row, column: string, value: string) => {
    const res = await api.patch(`/extraction/tables/${tableId}/rows/${row.id}`, { column, value });
    upsertRow(res.data, row.doc_name);
  }, [tableId, upsertRow]);

  const handleExport = () => {
    window.open(`${process.env.NEXT_PUBLIC_API_URL}/extraction/tables/${tableId}/export`, '_blank');
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-clay" />
    </div>
  );

  if (!table) return null;

  const extractedIds = new Set(rows.map(r => r.document_id));
  const filteredDocs = docs.filter(d => d.original_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-5xl mx-auto">
      <button onClick={() => router.push('/dashboard/extraction')} className="flex items-center gap-1.5 text-xs text-clay hover:underline mb-4">
        <ArrowLeft size={14} /> All Tables
      </button>

      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-2xl font-semibold text-ink">{table.name}</h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-clay text-clay rounded-lg hover:bg-blue-50">
            <Download size={13} /> Export CSV
          </button>
          {rows.length === 0 && (
            <button onClick={openPicker}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-clay text-white rounded-lg hover:bg-clay-hover">
              <Sparkles size={13} /> Extract
            </button>
          )}
        </div>
      </div>
      <p className="text-muted text-sm mb-6">{table.columns.length} column{table.columns.length !== 1 ? 's' : ''} · {rows.length} paper{rows.length !== 1 ? 's' : ''}</p>

      {/* Non-blocking progress panel */}
      {progress && (
        <div className="mb-5 rounded-xl border border-line bg-surface p-4">
          {progress.running ? (
            <>
              <div className="flex items-center justify-between gap-3 text-sm mb-2">
                <span className="font-medium text-ink flex items-center gap-2">
                  <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-clay" />
                  Extracting {progress.done} / {progress.total}…
                </span>
                {progress.currentName && <span className="text-xs text-subtle truncate max-w-[50%]" title={progress.currentName}>{progress.currentName}</span>}
              </div>
              <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                <div className="h-full bg-clay transition-all duration-300" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink">
                  <span className="font-medium">{progress.total - progress.failedIds.length} extracted</span>
                  {progress.failedIds.length > 0 && <span className="text-red-600"> · {progress.failedIds.length} failed</span>}
                </span>
                <div className="flex items-center gap-2">
                  {progress.failedIds.length > 0 && (
                    <button
                      onClick={() => runExtraction(progress.failedIds)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-clay text-clay rounded-lg hover:bg-blue-50"
                    >
                      <RotateCw size={12} /> Retry failed
                    </button>
                  )}
                  <button onClick={() => setProgress(null)} className="text-subtle hover:text-ink text-xl leading-none px-1">×</button>
                </div>
              </div>
              {progress.failedIds.length > 0 && progress.note && (
                <p className="text-xs text-red-600 mt-2">{progress.note}</p>
              )}
            </>
          )}
        </div>
      )}

      <ExtractionTable columns={table.columns} rows={rows} onReExtract={handleReExtract} onEditCell={handleEditCell} />

      {/* Doc picker modal */}
      {showPicker && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowPicker(false)}>
          <div className="bg-surface rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h2 className="text-base font-semibold text-ink">Extract from Papers</h2>
              <button onClick={() => setShowPicker(false)} className="text-subtle hover:text-ink text-2xl leading-none">×</button>
            </div>
            <div className="flex flex-col flex-1 overflow-hidden p-5">
              <p className="text-sm text-muted mb-3">Select up to {MAX_DOCS} ready papers to extract these columns from.</p>

              {docs.length === 0 ? (
                <p className="text-sm text-subtle">No ready documents. Upload and process papers first.</p>
              ) : (
                <>
                  <div className="relative mb-2">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search papers…"
                      className="w-full border border-line rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay"
                    />
                  </div>

                  <div className="flex items-center gap-3 mb-2 text-xs">
                    <button onClick={() => setSelectedIds(filteredDocs.slice(0, MAX_DOCS).map(d => d.id))} className="font-medium text-clay hover:underline">
                      Select all
                    </button>
                    {selectedIds.length > 0 && (
                      <button onClick={() => setSelectedIds([])} className="font-medium text-muted hover:text-ink ml-auto">Clear</button>
                    )}
                  </div>

                  <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
                    {filteredDocs.length === 0 ? (
                      <p className="text-sm text-subtle py-4 text-center">No papers match “{search}”.</p>
                    ) : filteredDocs.map(doc => (
                      <label key={doc.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-surface2 cursor-pointer">
                        <input type="checkbox" checked={selectedIds.includes(doc.id)} onChange={() => toggleDoc(doc.id)} className="accent-clay" />
                        <span className="text-sm text-ink truncate flex-1">{doc.original_name}</span>
                        {extractedIds.has(doc.id) && (
                          <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-surface2 text-subtle border border-line">Extracted</span>
                        )}
                      </label>
                    ))}
                  </div>
                </>
              )}
              {selectedIds.length > MAX_DOCS && <p className="text-xs text-red-600 mt-2">Select at most {MAX_DOCS} papers.</p>}
              {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            </div>
            <div className="flex items-center justify-between gap-2 p-5 border-t border-line">
              <span className="text-xs text-subtle">{selectedIds.length} selected</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowPicker(false)} className="px-4 py-2 text-sm text-muted hover:text-ink">Cancel</button>
                <button
                  onClick={startExtraction}
                  disabled={selectedIds.length === 0 || selectedIds.length > MAX_DOCS}
                  className="px-4 py-2 bg-clay text-white rounded-lg text-sm font-medium hover:bg-clay-hover disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Extract {selectedIds.length || ''} Paper{selectedIds.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
