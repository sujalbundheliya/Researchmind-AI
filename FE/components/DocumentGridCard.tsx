'use client';

import { useState } from 'react';
import { Check, MoreVertical, Layers, Pencil, Trash2, Quote } from 'lucide-react';
import CitationPanel from './CitationPanel';

export interface GridDocument {
  id: string;
  original_name: string;
  status: string;
  file_size_bytes?: number;
  page_count?: number;
  created_at?: string;
}

function formatSize(bytes?: number): string {
  if (!bytes) return '—';
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface DocumentGridCardProps {
  doc: GridDocument;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onRename: (name: string) => Promise<void>;
  onSummarize: () => void;
  // Whether the viewer may rename/delete this doc. Defaults to true (personal
  // docs); the workspace page passes false for viewer-role members.
  canModify?: boolean;
}

export default function DocumentGridCard({
  doc, selected, onToggle, onDelete, onRename, onSummarize, canModify = true,
}: DocumentGridCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(doc.original_name);
  const [savingName, setSavingName] = useState(false);
  const [showCite, setShowCite] = useState(false);

  const submitRename = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const trimmed = name.trim();
    if (!trimmed || trimmed === doc.original_name) { setRenaming(false); setName(doc.original_name); return; }
    setSavingName(true);
    try {
      await onRename(trimmed);
      setRenaming(false);
    } catch {
      setName(doc.original_name);
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      onClick={() => { if (!renaming) onToggle(); }}
      onKeyDown={(e) => { if (!renaming && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); onToggle(); } }}
      className={`group relative flex flex-col gap-3 p-4 rounded-2xl border cursor-pointer transition-all outline-none ${
        selected
          ? 'border-clay bg-clay/[0.06] ring-1 ring-clay shadow-sm'
          : 'border-line bg-surface hover:border-clay/40 hover:shadow-sm'
      }`}
    >
      {/* Top row: icon + selection indicator */}
      <div className="flex items-start justify-between gap-2">
        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold text-red-500 tracking-wide">PDF</span>
        </div>
        <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all ${
          selected ? 'bg-clay text-white' : 'border-2 border-line group-hover:border-clay/50'
        }`}>
          {selected && <Check size={13} strokeWidth={3} />}
        </div>
      </div>

      {/* Name (or rename form) */}
      {renaming ? (
        <form onSubmit={submitRename} onClick={(e) => e.stopPropagation()} className="min-h-[2.5rem]">
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus disabled={savingName}
            onKeyDown={(e) => { if (e.key === 'Escape') { setRenaming(false); setName(doc.original_name); } }}
            className="w-full text-sm border border-clay rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-clay bg-surface" />
          <div className="flex items-center gap-2 mt-1.5">
            <button type="submit" disabled={savingName}
              className="text-xs font-semibold text-clay hover:text-clay-hover disabled:opacity-50">
              {savingName ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => { setRenaming(false); setName(doc.original_name); }}
              className="text-xs text-subtle hover:text-ink">Cancel</button>
          </div>
        </form>
      ) : (
        <p className="text-sm font-semibold text-ink leading-snug line-clamp-2 min-h-[2.5rem]" title={doc.original_name}>
          {doc.original_name}
        </p>
      )}

      {/* Meta + actions menu */}
      <div className="flex items-center justify-between gap-2 mt-auto">
        <span className="text-xs text-subtle truncate">
          {formatSize(doc.file_size_bytes)}
          {doc.page_count ? ` · ${doc.page_count}p` : ''}
          {doc.created_at ? ` · ${formatDate(doc.created_at)}` : ''}
        </span>
        <div className="relative flex-shrink-0">
          <button type="button" title="More actions"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
            className={`p-1 rounded-lg text-subtle hover:text-ink hover:bg-surface2 transition-all ${menuOpen ? 'opacity-100 bg-surface2' : 'opacity-0 group-hover:opacity-100'}`}>
            <MoreVertical size={15} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
              <div className="absolute right-0 bottom-full mb-1 w-40 bg-surface rounded-xl shadow-lg border border-line z-20 overflow-hidden py-1"
                onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { setMenuOpen(false); onSummarize(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-surface2 transition-colors">
                  <Layers size={14} className="text-clay" /> Summarize
                </button>
                <button onClick={() => { setMenuOpen(false); setShowCite(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-surface2 transition-colors">
                  <Quote size={14} /> Cite
                </button>
                {canModify && (
                  <>
                    <button onClick={() => { setMenuOpen(false); setName(doc.original_name); setRenaming(true); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-surface2 transition-colors">
                      <Pencil size={14} /> Rename
                    </button>
                    <button onClick={() => { setMenuOpen(false); onDelete(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 size={14} /> Delete
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showCite && (
        <div onClick={(e) => e.stopPropagation()}>
          <CitationPanel docId={doc.id} docName={doc.original_name} onClose={() => setShowCite(false)} />
        </div>
      )}
    </div>
  );
}
