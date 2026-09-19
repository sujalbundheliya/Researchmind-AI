'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import api from '@/lib/api';
import { useChat } from '@/lib/hooks/useChat';
import { useConfirm } from '@/lib/confirm';
import FileUploader from '@/components/FileUploader';
import DocumentGridCard from '@/components/DocumentGridCard';
import DocumentSummaryModal from '@/components/DocumentSummaryModal';
import {
  CheckSquare, Square, Sparkles, FileSearch, ScissorsLineDashed, Atom, PartyPopper,
  Loader2, MessageSquare, MessagesSquare, FolderOpen,
} from 'lucide-react';

interface Document {
  id: string;
  original_name: string;
  status: string;
  file_size_bytes?: number;
  page_count?: number;
  created_at?: string;
}

const PROCESSING_STEPS = [
  { label: 'Reading your PDF', icon: FileSearch },
  { label: 'Splitting into chunks', icon: ScissorsLineDashed },
  { label: 'Generating embeddings', icon: Atom },
  { label: 'Wrapping up', icon: PartyPopper },
];

function ProcessingWizard({ count }: { count: number }) {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setStepIdx(i => Math.min(i + 1, PROCESSING_STEPS.length - 1)), 3200);
    return () => clearInterval(t);
  }, []);

  const Step = PROCESSING_STEPS[stepIdx];
  const StepIcon = Step.icon;

  return (
    <div className="mt-5 w-full rounded-xl border border-line bg-surface p-4 text-left">
      <div className="flex items-center gap-3">
        <div className="relative w-10 h-10 flex-shrink-0">
          <div className="absolute inset-0 rounded-full border-2 border-clay/15" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-clay border-r-clay animate-spin" />
          <StepIcon size={15} className="absolute inset-0 m-auto text-clay" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink">
            Processing {count} document{count !== 1 ? 's' : ''}…
          </p>
          <p key={stepIdx} className="text-xs text-subtle mt-0.5 animate-[fadeSlideIn_0.4s_ease-out]">{Step.label}…</p>
        </div>
      </div>

      <div className="mt-3.5 h-1.5 bg-line rounded-full overflow-hidden relative">
        <div className="absolute inset-y-0 left-0 bg-clay rounded-full animate-[indeterminate-bar_2.2s_ease-in-out_infinite]" />
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        {PROCESSING_STEPS.map((s, i) => (
          <div key={s.label}
            className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i <= stepIdx ? 'bg-clay' : 'bg-line'}`} />
        ))}
      </div>

      <p className="mt-3 text-[11px] text-subtle text-center">
        This usually takes under a minute — feel free to keep this tab open in the background.
      </p>
    </div>
  );
}

// Ingestion runs as a single atomic step server-side (no granular progress is reported),
// so we approximate a percentage from elapsed time — climbs fast, eases near completion.
function estimateProgress(startedAt: number): number {
  const elapsedSec = (Date.now() - startedAt) / 1000;
  return Math.min(96, Math.round(100 * (1 - Math.exp(-elapsedSec / 25))));
}

function EmptyWorkspace({ processingCount, onUploaded }: { processingCount: number; onUploaded: (doc: Record<string, unknown>) => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
      <div className="max-w-md w-full text-center">
        <div className="relative w-16 h-16 mx-auto mb-5">
          <div className="absolute inset-0 rounded-2xl bg-clay/15 rotate-6" />
          <div className="relative w-16 h-16 rounded-2xl bg-clay/10 flex items-center justify-center">
            <Sparkles size={26} className="text-clay" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-ink mb-2">Let&apos;s start your research</h2>
        <p className="text-sm text-muted mb-6 leading-relaxed">
          Drop a paper below and ask it anything — summaries, findings, cross-paper gaps.
          Every answer is grounded strictly in what you upload, never guessed.
        </p>
        <FileUploader onUploadSuccess={onUploaded} />
        {processingCount > 0 && <ProcessingWizard count={processingCount} />}
      </div>
    </div>
  );
}

export default function AllDocsWorkspace() {
  const router = useRouter();
  const [docs, setDocs] = useState<Document[]>([]);
  const [processingDocs, setProcessingDocs] = useState<Document[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [startingSession, setStartingSession] = useState(false);
  const [summaryDoc, setSummaryDoc] = useState<Document | null>(null);
  const [summaryText, setSummaryText] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [, setTick] = useState(0);
  const { createSession } = useChat();
  const confirm = useConfirm();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimesRef = useRef<Map<string, number>>(new Map());

  const processingCount = processingDocs.length;

  const fetchDocs = useCallback(() => {
    return api.get<Document[]>('/documents').then(r => {
      const ready = r.data.filter(d => d.status === 'ready');
      const processing = r.data.filter(d => d.status === 'processing');
      setDocs(ready);
      setProcessingDocs(processing);
      return { ready, processing };
    });
  }, []);

  useEffect(() => {
    getCurrentUser().then(u => { if (!u) router.push('/login'); });
    fetchDocs().finally(() => setLoadingDocs(false));
  }, [router, fetchDocs]);

  // Track when each document started processing so we can show an estimated % (the
  // backend ingests in one atomic step and doesn't report granular progress).
  useEffect(() => {
    const live = new Set(processingDocs.map(d => d.id));
    for (const d of processingDocs) {
      if (!startTimesRef.current.has(d.id)) startTimesRef.current.set(d.id, Date.now());
    }
    for (const id of Array.from(startTimesRef.current.keys())) {
      if (!live.has(id)) startTimesRef.current.delete(id);
    }
  }, [processingDocs]);

  // Poll while documents are still processing so the list resolves itself,
  // and re-render every second so the estimated-progress bars keep advancing.
  useEffect(() => {
    if (processingCount === 0) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) return;
    let ticks = 0;
    pollRef.current = setInterval(() => {
      ticks += 1;
      setTick(t => t + 1);
      if (ticks % 4 === 0) fetchDocs();
    }, 1000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [processingCount, fetchDocs]);

  const handleUploaded = useCallback(() => {
    setLoadingDocs(true);
    fetchDocs().finally(() => setLoadingDocs(false));
  }, [fetchDocs]);

  const handleDelete = useCallback(async (doc: Document) => {
    const ok = await confirm({
      title: 'Remove document?',
      message: `"${doc.original_name}" will be removed from your library. This can't be undone.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/documents/${doc.id}`);
      setDocs(p => p.filter(d => d.id !== doc.id));
      setSelectedIds(p => p.filter(id => id !== doc.id));
    } catch { /* ignore */ }
  }, [confirm]);

  const handleRename = useCallback(async (id: string, name: string) => {
    await api.patch(`/documents/${id}/rename`, { name });
    setDocs(p => p.map(d => d.id === id ? { ...d, original_name: name } : d));
  }, []);

  const handleSummarize = useCallback(async (doc: Document) => {
    setSummaryDoc(doc);
    setSummaryText('');
    setSummarizing(true);
    try {
      const r = await api.post<{ summary: string }>(`/chat/summarize/${doc.id}`);
      setSummaryText(r.data.summary);
    } catch {
      setSummaryText('Failed to generate summary. Please try again.');
    } finally {
      setSummarizing(false);
    }
  }, []);

  const toggleDoc = (id: string) => {
    setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  };

  const allSelected = selectedIds.length === docs.length && docs.length > 0;
  const toggleAll = () => setSelectedIds(allSelected ? [] : docs.map(d => d.id));

  const startChat = useCallback(async () => {
    if (!selectedIds.length || startingSession) return;
    setStartingSession(true);
    try {
      const s = await createSession(
        selectedIds.length === 1 ? 'single' : 'multi',
        selectedIds,
        `${selectedIds.length} Document${selectedIds.length !== 1 ? 's' : ''}`,
      );
      router.push(`/workspace/chat?session=${s.id}`);
    } finally {
      setStartingSession(false);
    }
  }, [selectedIds, startingSession, createSession, router]);

  if (!loadingDocs && docs.length === 0) {
    return <EmptyWorkspace processingCount={processingCount} onUploaded={handleUploaded} />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-6 lg:py-8">

          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-clay/10 flex items-center justify-center flex-shrink-0">
                <FolderOpen size={20} className="text-clay" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-ink leading-tight">All Documents</h1>
                <p className="text-sm text-subtle">
                  {loadingDocs ? 'Loading…' : `${docs.length} document${docs.length !== 1 ? 's' : ''} ingested`}
                  {processingCount > 0 && ` · ${processingCount} processing`}
                </p>
              </div>
            </div>
            <button onClick={startChat} disabled={selectedIds.length === 0 || startingSession}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-clay text-white rounded-xl text-sm font-semibold hover:bg-clay-hover disabled:bg-line disabled:text-subtle disabled:cursor-not-allowed transition-colors shadow-sm">
              {startingSession ? (
                <Loader2 size={15} className="animate-spin" />
              ) : selectedIds.length === 1 ? (
                <MessageSquare size={15} />
              ) : (
                <MessagesSquare size={15} />
              )}
              {startingSession ? 'Starting chat…' : `Start chat${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}`}
            </button>
          </div>

          {/* Uploader — always visible */}
          <div className="mb-6">
            <FileUploader onUploadSuccess={handleUploaded} />
          </div>

          {/* Processing documents */}
          {processingDocs.length > 0 && (
            <div className="mb-6 space-y-2">
              {processingDocs.map(doc => {
                const progress = estimateProgress(startTimesRef.current.get(doc.id) ?? Date.now());
                return (
                  <div key={doc.id} className="p-3.5 rounded-2xl border border-line bg-surface">
                    <div className="flex items-center gap-2 mb-2">
                      <Loader2 size={14} className="text-clay animate-spin flex-shrink-0" />
                      <span className="text-sm text-ink truncate flex-1" title={doc.original_name}>{doc.original_name}</span>
                      <span className="text-xs text-clay font-semibold tabular-nums flex-shrink-0">{progress}%</span>
                    </div>
                    <div className="h-1.5 bg-line rounded-full overflow-hidden ml-6">
                      <div className="h-full bg-clay rounded-full transition-[width] duration-700 ease-out" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Toolbar */}
          {docs.length > 0 && (
            <div className="flex items-center justify-between mb-4">
              <button onClick={toggleAll}
                className="flex items-center gap-1.5 text-sm text-muted hover:text-ink font-medium transition-colors">
                {allSelected ? <CheckSquare size={15} className="text-clay" /> : <Square size={15} />}
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
              <span className="text-xs text-subtle">
                Click a card to select · {selectedIds.length}/{docs.length} selected
              </span>
            </div>
          )}

          {/* Document grid */}
          {loadingDocs ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => <div key={i} className="h-36 bg-surface2 rounded-2xl animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {docs.map(doc => (
                <DocumentGridCard key={doc.id} doc={doc} selected={selectedIds.includes(doc.id)}
                  onToggle={() => toggleDoc(doc.id)} onDelete={() => handleDelete(doc)}
                  onRename={(name) => handleRename(doc.id, name)} onSummarize={() => handleSummarize(doc)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Summary modal */}
      {summaryDoc && (
        <DocumentSummaryModal docName={summaryDoc.original_name} summary={summaryText} loading={summarizing}
          onClose={() => setSummaryDoc(null)} />
      )}
    </div>
  );
}
