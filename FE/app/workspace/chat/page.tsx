'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import api from '@/lib/api';
import { useChat } from '@/lib/hooks/useChat';
import ChatInterface from '@/components/ChatInterface';
import ResearchGapPanel from '@/components/ResearchGapPanel';
import ChatHistorySidebar from '@/components/ChatHistorySidebar';
import { ArrowLeft, FileText, MessagesSquare } from 'lucide-react';

interface Document { id: string; original_name: string; }
type Tab = 'chat' | 'gaps';

function NoChatSelected() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="relative w-16 h-16 mx-auto mb-5">
          <div className="absolute inset-0 rounded-2xl bg-clay/15 rotate-6" />
          <div className="relative w-16 h-16 rounded-2xl bg-clay/10 flex items-center justify-center">
            <MessagesSquare size={26} className="text-clay" />
          </div>
        </div>
        <h2 className="text-lg font-bold text-ink mb-2">No chat selected</h2>
        <p className="text-sm text-muted leading-relaxed">
          Pick a conversation from the history on the left, or start a new chat
          by selecting documents in <span className="font-medium text-ink">All Documents</span>.
        </p>
      </div>
    </div>
  );
}

function ChatWorkspaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('chat');
  const { session, messages, isLoading, error, loadSession, sendMessage } = useChat();

  const init = useCallback(async () => {
    const u = await getCurrentUser();
    if (!u) { router.push('/login'); return; }

    if (!sessionId) { setLoading(false); return; }

    setLoading(true);
    setTab('chat');
    try {
      const s = await loadSession(sessionId);
      // Workspace-scoped sessions reference documents that live under that
      // workspace, not the caller's personal docs — /documents alone (which is
      // strictly personal-only) wouldn't resolve them, leaving the header chips empty.
      const docsRes = await api.get<Document[]>(
        s.workspace_id ? `/documents?workspace_id=${s.workspace_id}` : '/documents'
      );
      const byId = new Map(docsRes.data.map(d => [d.id, d]));
      setDocs(s.document_ids.map(id => byId.get(id)).filter((d): d is Document => !!d));
    } catch {
      router.push('/workspace/chat');
    } finally {
      setLoading(false);
    }
  }, [sessionId, router, loadSession]);

  useEffect(() => { init(); }, [init]);

  const docIds = docs.map(d => d.id);

  return (
    <div className="flex-1 flex overflow-hidden">
      <ChatHistorySidebar activeId={sessionId} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {!sessionId ? (
          <NoChatSelected />
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted">Loading chat…</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-surface border-b border-line px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
              <button onClick={() => router.push('/workspace/all')}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium flex-shrink-0">
                <ArrowLeft size={13} /> All Documents
              </button>
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                {docs.map(d => (
                  <span key={d.id} title={d.original_name}
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-surface2 text-xs text-muted max-w-[180px]">
                    <FileText size={11} className="flex-shrink-0" />
                    <span className="truncate">{d.original_name}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-surface border-b border-line px-4 sm:px-6 flex items-center gap-0">
              {(['chat', 'gaps'] as Tab[]).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted hover:text-ink'}`}>
                  {t === 'chat' ? '💬 Chat' : '🔍 Research Gaps'}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              {tab === 'chat' ? (
                <ChatInterface messages={messages} isLoading={isLoading} error={error}
                  onSend={q => sendMessage(q, docIds)} disabled={!session} />
              ) : (
                <ResearchGapPanel docIds={docIds} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ChatWorkspace() {
  return (
    <Suspense>
      <ChatWorkspaceInner />
    </Suspense>
  );
}
