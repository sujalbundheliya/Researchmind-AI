'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, Trash2, RotateCw, Loader2, FileText, Link2, ExternalLink, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { useConfirm } from '@/lib/confirm';
import { AdminDocument, formatBytes, formatDate } from './types';

const STATUS_FILTERS = [
  { id: '', label: 'All' },
  { id: 'ready', label: 'Ready' },
  { id: 'processing', label: 'Processing' },
  { id: 'failed', label: 'Failed' },
];

const STATUS_STYLES: Record<string, string> = {
  ready: 'bg-success/15 text-success',
  processing: 'bg-warning/15 text-warning',
  failed: 'bg-danger/15 text-danger',
};

interface Props {
  onChanged?: () => void;
  toast: (msg: string, type?: 'success' | 'error') => void;
}

export default function DocumentsTab({ onChanged, toast }: Props) {
  const confirm = useConfirm();
  const [docs, setDocs] = useState<AdminDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (q: string, st: string) => {
    setLoading(true);
    try {
      const res = await api.get<{ documents: AdminDocument[]; total: number }>('/admin/documents', {
        params: { search: q, status: st, limit: 100 },
      });
      setDocs(res.data.documents);
      setTotal(res.data.total);
    } catch {
      toast('Could not load documents', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(search, status); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  const onSearch = (e: React.FormEvent) => { e.preventDefault(); load(search, status); };

  const reingest = async (doc: AdminDocument) => {
    setBusyId(doc.id);
    try {
      await api.post(`/admin/documents/${doc.id}/reingest`);
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, status: 'processing' } : d)));
      toast('Re-ingestion started');
      onChanged?.();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast(axiosErr.response?.data?.message ?? 'Could not re-ingest', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (doc: AdminDocument) => {
    const ok = await confirm({
      title: 'Delete this document?',
      message: `"${doc.original_name}" belonging to ${doc.owner_email ?? 'an unknown user'}. The file and its extracted content are removed permanently.`,
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/documents/${doc.id}`);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      setTotal((t) => Math.max(0, t - 1));
      toast('Document deleted');
      onChanged?.();
    } catch {
      toast('Delete failed', 'error');
    }
  };

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <form onSubmit={onSearch} className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search filename or owner email…"
              className="w-full border border-line rounded-lg pl-9 pr-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-clay"
            />
          </div>
          <button type="submit" className="px-3 py-2 text-sm font-medium bg-surface2 text-ink rounded-lg hover:bg-line transition-colors">
            Search
          </button>
        </form>

        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatus(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                status === f.id ? 'bg-clay text-white' : 'bg-surface2 text-muted hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-subtle mb-3">{total} document{total === 1 ? '' : 's'}</p>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-clay" /></div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-line rounded-xl">
          <FileText size={28} className="mx-auto text-subtle mb-3" />
          <p className="text-sm text-muted">No documents found.</p>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-xs text-subtle uppercase tracking-wider border-b border-line">
                <th className="px-4 py-3 font-semibold">Document</th>
                <th className="px-4 py-3 font-semibold">Owner</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Size</th>
                <th className="px-4 py-3 font-semibold">Added</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id} className="border-b border-line last:border-0 hover:bg-surface2/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink truncate max-w-[240px]" title={doc.original_name}>
                        {doc.original_name}
                      </p>
                      {doc.source_url && (
                        <a
                          href={doc.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Fetched from ${doc.source_url}`}
                          className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-clay/10 text-clay flex-shrink-0 hover:bg-clay/20 transition-colors"
                        >
                          <Link2 size={9} /> link <ExternalLink size={8} />
                        </a>
                      )}
                    </div>
                    {doc.page_count != null && (
                      <p className="text-xs text-subtle">{doc.page_count} pages</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-ink truncate max-w-[180px]">{doc.owner_name ?? '—'}</p>
                    <p className="text-xs text-subtle truncate max-w-[180px]">{doc.owner_email ?? 'deleted user'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[doc.status] || ''}`}>
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted tabular-nums whitespace-nowrap">
                    {formatBytes(doc.file_size_bytes)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{formatDate(doc.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {doc.status !== 'processing' && (
                        <button
                          onClick={() => reingest(doc)}
                          disabled={busyId === doc.id}
                          title="Re-run text extraction and embedding"
                          className="p-1.5 text-subtle hover:text-clay hover:bg-clay/10 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {busyId === doc.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
                        </button>
                      )}
                      <button
                        onClick={() => remove(doc)}
                        title="Delete document"
                        className="p-1.5 text-subtle hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-subtle mt-3 flex items-start gap-1.5">
        <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
        Re-ingesting clears the document&apos;s existing extracted chunks and processes the file again — useful
        when ingestion failed because the AI service was still starting up.
      </p>
    </div>
  );
}
