'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { useChat } from '@/lib/hooks/useChat';
import ChatInterface from '@/components/ChatInterface';
import FindingsPanel from '@/components/FindingsPanel';
import CitationPanel from '@/components/CitationPanel';
import { ArrowLeft, FileText, Layers, Quote } from 'lucide-react';

interface Document {
  id: string; original_name: string; file_size_bytes: number;
  status: string; page_count?: number; created_at: string;
}
type Tab = 'chat' | 'findings';

export default function SingleDocWorkspace() {
  const { docId } = useParams<{ docId: string }>();
  const router = useRouter();
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('chat');
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showCite, setShowCite] = useState(false);
  const { session, messages, isLoading, error, createSession, sendMessage } = useChat();

  const init = useCallback(async () => {
    const u = await getCurrentUser();
    if (!u) { router.push('/login'); return; }
    try {
      const res = await api.get<Document>(`/documents/${docId}`);
      setDoc(res.data);
      if (res.data.status === 'ready') await createSession('single', [docId], res.data.original_name);
    } catch { router.push('/dashboard'); }
    finally { setLoading(false); }
  }, [docId, router, createSession]);

  useEffect(() => { init(); }, [init]);

  const handleSummarize = async () => {
    setSummarizing(true); setShowModal(true); setSummary('');
    try {
      const r = await api.post<{ summary: string }>(`/chat/summarize/${docId}`);
      setSummary(r.data.summary);
    } catch { setSummary('Failed to generate summary.'); }
    finally { setSummarizing(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-canvas">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted">Loading workspace…</p>
      </div>
    </div>
  );

  if (!doc || doc.status !== 'ready') return (
    <div className="flex items-center justify-center h-screen bg-canvas">
      <div className="text-center">
        <div className="text-4xl mb-3">⏳</div>
        <p className="text-muted font-medium mb-1">Document not ready</p>
        <p className="text-subtle text-sm mb-4">Processing may still be in progress.</p>
        <button onClick={() => router.push('/dashboard')} className="text-blue-600 hover:underline text-sm">← Back to Dashboard</button>
      </div>
    </div>
  );

  const sizeMB = (doc.file_size_bytes / 1024 / 1024).toFixed(1);

  return (
    <div className="flex h-screen bg-canvas overflow-hidden">
      {/* Left panel */}
      <div className="w-64 bg-surface border-r border-line flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-linesoft">
          <button onClick={() => router.push('/dashboard')}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 mb-3 font-medium">
            <ArrowLeft size={13} /> Dashboard
          </button>
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-red-500">PDF</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink leading-snug line-clamp-2" title={doc.original_name}>{doc.original_name}</p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-2">
          {[
            { label: 'Size', value: `${sizeMB} MB` },
            { label: 'Pages', value: doc.page_count ? `${doc.page_count} pages` : '—' },
            { label: 'Added', value: new Date(doc.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs text-subtle">{label}</span>
              <span className="text-xs font-medium text-muted">{value}</span>
            </div>
          ))}
        </div>

        <div className="mt-auto p-4 border-t border-linesoft space-y-2">
          <button onClick={handleSummarize} disabled={summarizing}
            className="w-full py-2 px-3 bg-clay text-white rounded-lg text-sm font-medium hover:bg-clay-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            <Layers size={14} /> {summarizing ? 'Summarizing…' : 'Summarize Paper'}
          </button>
          <button onClick={() => setShowCite(true)}
            className="w-full py-2 px-3 border border-line text-muted rounded-lg text-sm font-medium hover:bg-surface2 hover:text-ink transition-colors flex items-center justify-center gap-2">
            <Quote size={14} /> Cite Paper
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tabs */}
        <div className="bg-surface border-b border-line px-6 flex items-center">
          {(['chat', 'findings'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted hover:text-ink'}`}>
              {t === 'chat' ? <><span>💬</span> Chat</> : <><FileText size={14} /> Key Findings</>}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {tab === 'chat' ? (
            <ChatInterface messages={messages} isLoading={isLoading} error={error}
              onSend={q => sendMessage(q, [docId])} disabled={!session} />
          ) : (
            <FindingsPanel docId={docId} />
          )}
        </div>
      </div>

      {/* Summary modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h3 className="text-base font-semibold text-ink">Paper Summary</h3>
              <button onClick={() => setShowModal(false)} className="text-subtle hover:text-ink text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {summarizing ? (
                <div className="flex items-center gap-3 text-muted text-sm">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  Generating summary…
                </div>
              ) : (
                <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{summary}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Citation panel */}
      {showCite && (
        <CitationPanel docId={docId} docName={doc.original_name} onClose={() => setShowCite(false)} />
      )}
    </div>
  );
}
