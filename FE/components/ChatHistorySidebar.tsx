'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useConfirm } from '@/lib/confirm';
import { Plus, MessageSquare, Trash2, Loader2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export interface ChatSession {
  id: string;
  title: string;
  mode: string;
  message_count: number;
  created_at: string;
  document_ids: string[];
}

interface ChatHistorySidebarProps {
  activeId?: string | null;
  /** Bump this number to force a refetch (e.g. after a new chat is created). */
  refreshKey?: number;
  onDeleted?: (id: string) => void;
}

// Bucket a date into a GPT/Claude-style relative group.
function bucketFor(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 86_400_000;
  const diffDays = Math.floor((startOfToday - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / dayMs);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return 'Previous 7 days';
  if (diffDays <= 30) return 'Previous 30 days';
  return 'Older';
}

const BUCKET_ORDER = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'];

export default function ChatHistorySidebar({ activeId, refreshKey, onDeleted }: ChatHistorySidebarProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const confirm = useConfirm();

  const fetchSessions = useCallback(() => {
    setLoading(true);
    api.get<ChatSession[]>('/chat/sessions')
      .then(r => setSessions(r.data))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions, refreshKey]);

  const handleDelete = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Delete chat?',
      message: 'This conversation will be permanently deleted.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      await api.delete(`/chat/sessions/${id}`);
      setSessions(p => p.filter(s => s.id !== id));
      onDeleted?.(id);
      if (id === activeId) router.push('/workspace/chat');
    } catch { /* ignore */ }
    finally { setDeletingId(null); }
  }, [activeId, onDeleted, router, confirm]);

  // Group sessions into ordered buckets (API already returns newest-first).
  const grouped = BUCKET_ORDER
    .map(bucket => ({ bucket, items: sessions.filter(s => bucketFor(s.created_at) === bucket) }))
    .filter(g => g.items.length > 0);

  if (collapsed) {
    return (
      <div className="hidden md:flex flex-col items-center w-12 bg-surface border-r border-line py-3 flex-shrink-0">
        <button onClick={() => setCollapsed(false)} title="Show chat history"
          className="p-2 text-muted hover:text-ink hover:bg-surface2 rounded-lg transition-colors">
          <PanelLeftOpen size={18} />
        </button>
        <button onClick={() => router.push('/workspace/all')} title="New chat"
          className="mt-2 p-2 text-clay hover:bg-clay/10 rounded-lg transition-colors">
          <Plus size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="hidden md:flex flex-col w-64 bg-surface border-r border-line flex-shrink-0">
      {/* Header */}
      <div className="p-3 flex items-center gap-2 border-b border-linesoft">
        <button onClick={() => router.push('/workspace/all')}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-clay text-white text-sm font-semibold hover:bg-clay-hover transition-colors">
          <Plus size={15} /> New chat
        </button>
        <button onClick={() => setCollapsed(true)} title="Hide chat history"
          className="p-2 text-muted hover:text-ink hover:bg-surface2 rounded-lg transition-colors flex-shrink-0">
          <PanelLeftClose size={16} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="space-y-1.5 p-1">
            {[...Array(6)].map((_, i) => <div key={i} className="h-9 bg-surface2 rounded-lg animate-pulse" />)}
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center px-4 py-10">
            <MessageSquare size={26} className="mx-auto text-subtle mb-2" />
            <p className="text-xs text-muted font-medium">No chats yet</p>
            <p className="text-[11px] text-subtle mt-0.5">Start one from your documents</p>
          </div>
        ) : (
          grouped.map(({ bucket, items }) => (
            <div key={bucket} className="mb-3">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-subtle">{bucket}</p>
              {items.map(s => {
                const active = s.id === activeId;
                return (
                  <div key={s.id}
                    onClick={() => router.push(`/workspace/chat?session=${s.id}`)}
                    className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                      active ? 'bg-clay/10 text-ink' : 'text-muted hover:bg-surface2 hover:text-ink'
                    }`}>
                    <MessageSquare size={14} className={`flex-shrink-0 ${active ? 'text-clay' : 'text-subtle'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate leading-snug" title={s.title}>{s.title}</p>
                    </div>
                    <button onClick={(e) => handleDelete(e, s.id)} disabled={deletingId === s.id}
                      title="Delete chat"
                      className="opacity-0 group-hover:opacity-100 text-subtle hover:text-red-500 transition-all flex-shrink-0 p-0.5 rounded">
                      {deletingId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
