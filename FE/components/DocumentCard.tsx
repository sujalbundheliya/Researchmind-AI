'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Pencil, Trash2, Quote, Link2, MessageSquare, CheckSquare, Square } from 'lucide-react';
import StatusBadge from './StatusBadge';
import CitationPanel from './CitationPanel';
import api from '@/lib/api';
import { useConfirm } from '@/lib/confirm';
import { useChat } from '@/lib/hooks/useChat';

interface Document {
  id: string; original_name: string; file_size_bytes: number;
  status: string; page_count?: number; created_at: string;
  /** Set when the PDF was fetched from a link rather than uploaded from disk. */
  source_url?: string | null;
}

/** Bare hostname for the provenance badge — "arxiv.org", not the full URL. */
function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}
interface DocumentCardProps {
  doc: Document;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  // Whether the viewer may rename/delete this doc. Defaults to true (personal
  // docs); the workspace detail page passes false for viewer-role members.
  canModify?: boolean;
  // The workspace this doc lives in, if any — threaded through to the chat
  // session so it shows up under that workspace's Sessions tab and the AI
  // retriever scopes to it. Omitted (null) for personal docs.
  workspaceId?: string | null;
  // Multi-select support for bulk "chat with N documents" (workspace page).
  // Omit both to keep the card's default single-doc-only behavior.
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export default function DocumentCard({
  doc, onDelete, onRename, canModify = true, workspaceId = null,
  selectable = false, selected = false, onToggleSelect,
}: DocumentCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(doc.original_name);
  const [renameLoading, setRenameLoading] = useState(false);
  const [showCite, setShowCite] = useState(false);
  const [starting, setStarting] = useState(false);
  const confirm = useConfirm();
  const router = useRouter();
  const { createSession } = useChat();

  const handleChat = async () => {
    if (starting) return;
    setMenuOpen(false);
    setStarting(true);
    try {
      const s = await createSession('single', [doc.id], doc.original_name, workspaceId);
      router.push(`/workspace/chat?session=${s.id}`);
    } finally {
      setStarting(false);
    }
  };

  const sizeMB = (doc.file_size_bytes / 1024 / 1024).toFixed(1);
  const date = new Date(doc.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });

  const handleDelete = async () => {
    setMenuOpen(false);
    const ok = await confirm({
      title: 'Delete document?',
      message: `"${doc.original_name}" and its data will be permanently deleted.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try { await api.delete(`/documents/${doc.id}`); onDelete(doc.id); } catch { /* ignore */ }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || newName === doc.original_name) { setRenaming(false); return; }
    setRenameLoading(true);
    try {
      await api.patch(`/documents/${doc.id}/rename`, { name: newName.trim() });
      onRename(doc.id, newName.trim());
      setRenaming(false);
    } catch { /* ignore */ } finally { setRenameLoading(false); }
  };

  return (
    <div className={`bg-surface rounded-xl border px-4 py-3.5 transition-all group ${
      selectable && selected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-line hover:shadow-sm'
    }`}>
      <div className="flex items-start gap-3">
        {/* Selection checkbox — only shown in bulk-select mode, only for ready docs */}
        {selectable && doc.status === 'ready' && (
          <button type="button" onClick={() => onToggleSelect?.(doc.id)}
            aria-label={selected ? 'Deselect document' : 'Select document'}
            className="flex-shrink-0 mt-1 text-subtle hover:text-blue-600 transition-colors">
            {selected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}
          </button>
        )}

        {/* File icon */}
        <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-xs font-bold text-red-500">PDF</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          {renaming ? (
            <form onSubmit={handleRename} className="flex gap-2 items-center mb-1">
              <input value={newName} onChange={e => setNewName(e.target.value)} autoFocus disabled={renameLoading}
                className="flex-1 text-sm border border-blue-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0" />
              <button type="submit" disabled={renameLoading} className="text-xs text-blue-600 font-semibold hover:text-blue-700">Save</button>
              <button type="button" onClick={() => { setRenaming(false); setNewName(doc.original_name); }} className="text-xs text-subtle hover:text-ink">×</button>
            </form>
          ) : (
            <p className="text-sm font-medium text-ink truncate leading-snug" title={doc.original_name}>
              {doc.original_name}
            </p>
          )}

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <StatusBadge status={doc.status} />
            <span className="text-xs text-subtle">{sizeMB} MB</span>
            {doc.page_count ? <span className="text-xs text-subtle">{doc.page_count} pages</span> : null}
            <span className="text-xs text-subtle">{date}</span>
            {doc.source_url && (
              <a
                href={doc.source_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={doc.source_url}
                className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-clay/10 text-clay hover:bg-clay/20 transition-colors max-w-[140px]"
              >
                <Link2 size={9} className="flex-shrink-0" />
                <span className="truncate">{sourceHost(doc.source_url)}</span>
              </a>
            )}
          </div>
        </div>

        {/* Menu */}
        {(canModify || doc.status === 'ready') && (
          <div className="relative flex-shrink-0">
            <button onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 text-subtle hover:text-ink hover:bg-surface2 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
              aria-label="Actions">
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-1 w-36 bg-surface rounded-xl shadow-lg border border-line z-20 overflow-hidden py-1">
                  {doc.status === 'ready' && (
                    <>
                      <button onClick={handleChat} disabled={starting}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-surface2 transition-colors disabled:opacity-50">
                        <MessageSquare size={13} /> {starting ? 'Starting…' : 'Chat'}
                      </button>
                      <button onClick={() => { setMenuOpen(false); setShowCite(true); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-surface2 transition-colors">
                        <Quote size={13} /> Cite
                      </button>
                    </>
                  )}
                  {canModify && (
                    <>
                      <button onClick={() => { setMenuOpen(false); setRenaming(true); setNewName(doc.original_name); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-surface2 transition-colors">
                        <Pencil size={13} /> Rename
                      </button>
                      <button onClick={handleDelete}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 size={13} /> Delete
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showCite && (
        <CitationPanel docId={doc.id} docName={doc.original_name} onClose={() => setShowCite(false)} />
      )}
    </div>
  );
}
