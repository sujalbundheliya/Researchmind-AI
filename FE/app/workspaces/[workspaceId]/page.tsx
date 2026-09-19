'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import api from '@/lib/api';
import FileUploader from '@/components/FileUploader';
import DocumentGridCard from '@/components/DocumentGridCard';
import DocumentSummaryModal from '@/components/DocumentSummaryModal';
import InviteModal from '@/components/InviteModal';
import { useChat } from '@/lib/hooks/useChat';
import {
  ArrowLeft, UserPlus, Trash2, FileText, MessageSquare, MessagesSquare,
  Loader2, CheckSquare, Square,
} from 'lucide-react';

// Ingestion runs as a single atomic step server-side (no granular progress is
// reported), so we approximate a percentage from elapsed time — climbs fast,
// eases near completion. Mirrors the estimate used on the All Documents page.
function estimateProgress(startedAt: number): number {
  const elapsedSec = (Date.now() - startedAt) / 1000;
  return Math.min(96, Math.round(100 * (1 - Math.exp(-elapsedSec / 25))));
}

interface Member { user_id: string; name: string; email: string; role: string; joined_at: string; }
interface Workspace { id: string; name: string; your_role: string; storage_used_bytes: number; storage_limit_bytes: number; members: Member[]; doc_count: number; }
interface Document { id: string; original_name: string; file_size_bytes: number; status: string; page_count?: number; created_at: string; }
interface Session { id: string; title: string; mode: string; message_count: number; created_at: string; }

type Tab = 'documents' | 'members' | 'sessions';

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-700',
  editor: 'bg-blue-100 text-blue-700',
  viewer: 'bg-surface2 text-muted',
};

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('documents');
  const [showInvite, setShowInvite] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [startingChat, setStartingChat] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [summaryDoc, setSummaryDoc] = useState<Document | null>(null);
  const [summaryText, setSummaryText] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [, setTick] = useState(0);
  const { createSession } = useChat();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimesRef = useRef<Map<string, number>>(new Map());

  const toggleSelect = (id: string) => setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const load = useCallback(async () => {
    const u = await getCurrentUser();
    if (!u) { router.push('/login'); return; }
    setCurrentUserId(u.id);
    try {
      const [wsRes, docsRes, sessRes] = await Promise.all([
        api.get<Workspace>(`/workspaces/${workspaceId}`),
        api.get<Document[]>(`/documents?workspace_id=${workspaceId}`),
        api.get<Session[]>(`/chat/sessions?workspace_id=${workspaceId}`),
      ]);
      setWs(wsRes.data); setDocs(docsRes.data); setSessions(sessRes.data);
    } catch { router.push('/dashboard/workspaces'); }
    finally { setLoading(false); }
  }, [workspaceId, router]);

  useEffect(() => { load(); }, [load]);

  const readyDocs = docs.filter(d => d.status === 'ready');
  const processingDocs = docs.filter(d => d.status === 'processing');
  const processingCount = processingDocs.length;

  // Track when each document started processing so we can show an estimated %
  // (the backend ingests in one atomic step and doesn't report granular progress).
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
      if (ticks % 4 === 0) api.get<Document[]>(`/documents?workspace_id=${workspaceId}`).then(r => setDocs(r.data));
    }, 1000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [processingCount, workspaceId]);

  const allSelected = selectedIds.length === readyDocs.length && readyDocs.length > 0;
  const toggleAll = () => setSelectedIds(allSelected ? [] : readyDocs.map(d => d.id));

  const handleChatWithWorkspace = async () => {
    if (!selectedIds.length || startingChat) return;
    setStartingChat(true);
    try {
      const s = await createSession(
        selectedIds.length === 1 ? 'single' : 'multi',
        selectedIds,
        `${selectedIds.length} Document${selectedIds.length !== 1 ? 's' : ''}`,
        workspaceId,
      );
      router.push(`/workspace/chat?session=${s.id}`);
    } finally {
      setStartingChat(false);
    }
  };

  const handleSummarize = async (doc: Document) => {
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
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Remove this member?')) return;
    try {
      await api.delete(`/workspaces/${workspaceId}/members/${userId}`);
      setWs(prev => prev ? { ...prev, members: prev.members.filter(m => m.user_id !== userId) } : prev);
    } catch { /* ignore */ }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-canvas">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!ws) return null;

  const canEdit = ws.your_role === 'owner' || ws.your_role === 'editor';
  const isOwner = ws.your_role === 'owner';
  const storagePct = ws.storage_limit_bytes > 0 ? Math.min((ws.storage_used_bytes / ws.storage_limit_bytes) * 100, 100) : 0;
  const storageGB = (ws.storage_used_bytes / 1024 / 1024 / 1024).toFixed(2);
  const limitGB = (ws.storage_limit_bytes / 1024 / 1024 / 1024).toFixed(0);

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'documents', label: 'Documents', count: docs.length },
    { key: 'members', label: 'Members', count: ws.members.length },
    { key: 'sessions', label: 'Sessions', count: sessions.length },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button onClick={() => router.push('/dashboard/workspaces')}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium mb-4">
          <ArrowLeft size={15} /> Workspaces
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold">{ws.name[0].toUpperCase()}</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-ink">{ws.name}</h1>
              <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${ROLE_BADGE[ws.your_role] || ROLE_BADGE.viewer}`}>
                {ws.your_role}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleChatWithWorkspace} disabled={selectedIds.length === 0 || startingChat}
              title={readyDocs.length === 0 ? 'Upload a document first' : selectedIds.length === 0 ? 'Select at least one document below' : undefined}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:bg-line disabled:text-subtle transition-colors disabled:cursor-not-allowed flex-shrink-0">
              {startingChat ? (
                <Loader2 size={15} className="animate-spin" />
              ) : selectedIds.length === 1 ? (
                <MessageSquare size={15} />
              ) : (
                <MessagesSquare size={15} />
              )}
              {startingChat ? 'Starting…' : `Chat${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}`}
            </button>

            {/* Storage */}
            <div className="bg-surface border border-line rounded-xl p-3.5 min-w-[180px]">
              <div className="flex justify-between text-xs text-muted mb-1.5">
                <span>Storage</span>
                <span>{storageGB} / {limitGB} GB</span>
              </div>
              <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${storagePct >= 90 ? 'bg-red-500' : storagePct >= 70 ? 'bg-amber-500' : 'bg-blue-600'}`}
                  style={{ width: `${storagePct}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line mb-6 -mx-1 px-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted hover:text-ink'}`}>
            {t.label}
            {t.count !== undefined && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-surface2 text-muted'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'documents' && (
        <div className="space-y-4">
          {canEdit && <FileUploader onUploadSuccess={doc => setDocs(p => [doc as unknown as Document, ...p])} workspaceId={workspaceId} />}
          {!canEdit && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
              <FileText size={15} /> Viewers can read documents but cannot upload.
            </div>
          )}
          {docs.length === 0 ? (
            <div className="text-center py-14 border-2 border-dashed border-line rounded-xl bg-surface">
              <FileText size={32} className="mx-auto text-subtle mb-3" />
              <p className="text-muted font-medium text-sm">No workspace documents yet</p>
              {canEdit && <p className="text-subtle text-xs mt-1">Upload a paper above to get started</p>}
            </div>
          ) : (
            <>
              {/* Processing documents */}
              {processingDocs.length > 0 && (
                <div className="space-y-2">
                  {processingDocs.map(doc => {
                    const progress = estimateProgress(startTimesRef.current.get(doc.id) ?? Date.now());
                    return (
                      <div key={doc.id} className="p-3.5 rounded-2xl border border-line bg-surface">
                        <div className="flex items-center gap-2 mb-2">
                          <Loader2 size={14} className="text-blue-600 animate-spin flex-shrink-0" />
                          <span className="text-sm text-ink truncate flex-1" title={doc.original_name}>{doc.original_name}</span>
                          <span className="text-xs text-blue-600 font-semibold tabular-nums flex-shrink-0">{progress}%</span>
                        </div>
                        <div className="h-1.5 bg-line rounded-full overflow-hidden ml-6">
                          <div className="h-full bg-blue-600 rounded-full transition-[width] duration-700 ease-out" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Selection toolbar */}
              {readyDocs.length > 0 && (
                <div className="flex items-center justify-between">
                  <button onClick={toggleAll}
                    className="flex items-center gap-1.5 text-sm text-muted hover:text-ink font-medium transition-colors">
                    {allSelected ? <CheckSquare size={15} className="text-blue-600" /> : <Square size={15} />}
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                  <span className="text-xs text-subtle">
                    Click a card to select · {selectedIds.length}/{readyDocs.length} selected
                  </span>
                </div>
              )}

              {/* Document grid */}
              {readyDocs.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {readyDocs.map(doc => (
                    <DocumentGridCard key={doc.id} doc={doc} canModify={canEdit}
                      selected={selectedIds.includes(doc.id)} onToggle={() => toggleSelect(doc.id)}
                      onDelete={async () => {
                        await api.delete(`/documents/${doc.id}`);
                        setDocs(p => p.filter(d => d.id !== doc.id));
                        setSelectedIds(p => p.filter(x => x !== doc.id));
                      }}
                      onRename={async (name) => {
                        await api.patch(`/documents/${doc.id}/rename`, { name });
                        setDocs(p => p.map(d => d.id === doc.id ? { ...d, original_name: name } : d));
                      }}
                      onSummarize={() => handleSummarize(doc)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'members' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted">{ws.members.length} member{ws.members.length !== 1 ? 's' : ''}</p>
            {canEdit && (
              <button onClick={() => setShowInvite(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                <UserPlus size={14} /> Invite
              </button>
            )}
          </div>
          <div className="space-y-2">
            {ws.members.map(m => (
              <div key={m.user_id} className="flex items-center gap-3 bg-surface border border-line rounded-xl px-4 py-3.5">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-blue-700">
                  {m.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{m.name}</p>
                  <p className="text-xs text-subtle">{m.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${ROLE_BADGE[m.role] || ROLE_BADGE.viewer}`}>
                    {m.role}
                  </span>
                  {isOwner && m.user_id !== currentUserId && (
                    <button onClick={() => handleRemoveMember(m.user_id)}
                      className="p-1.5 text-subtle hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'sessions' && (
        <div className="space-y-2">
          {sessions.length === 0 ? (
            <div className="text-center py-14 border-2 border-dashed border-line rounded-xl bg-surface">
              <MessageSquare size={32} className="mx-auto text-subtle mb-3" />
              <p className="text-muted font-medium text-sm">No shared sessions yet</p>
              <p className="text-subtle text-xs mt-1">Start a chat in this workspace to see sessions here</p>
            </div>
          ) : sessions.map(s => (
            <button key={s.id} onClick={() => router.push(`/workspace/chat?session=${s.id}`)}
              className="w-full flex items-center gap-3 bg-surface border border-line rounded-xl px-4 py-3.5 text-left hover:border-blue-300 hover:shadow-sm transition-all">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize flex-shrink-0 ${s.mode === 'single' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                {s.mode}
              </span>
              <span className="flex-1 text-sm text-ink truncate">{s.title}</span>
              <span className="text-xs text-subtle flex-shrink-0">{s.message_count} msgs · {new Date(s.created_at).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      )}

      {showInvite && <InviteModal workspaceId={workspaceId} onClose={() => setShowInvite(false)} />}

      {summaryDoc && (
        <DocumentSummaryModal docName={summaryDoc.original_name} summary={summaryText} loading={summarizing}
          onClose={() => setSummaryDoc(null)} />
      )}
    </div>
  );
}
