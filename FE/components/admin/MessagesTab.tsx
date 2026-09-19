'use client';

import { useEffect, useState, useCallback } from 'react';
import { Mail, MailOpen, MailCheck, Archive, Trash2, Loader2, Inbox, CornerUpLeft, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { useConfirm } from '@/lib/confirm';
import { ContactMessage, MessageStatus, formatDate } from './types';

const FILTERS: { id: MessageStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'Unread' },
  { id: 'read', label: 'Read' },
  { id: 'replied', label: 'Replied' },
  { id: 'archived', label: 'Archived' },
];

const STATUS_STYLES: Record<MessageStatus, string> = {
  new: 'bg-clay/15 text-clay',
  read: 'bg-surface2 text-muted',
  replied: 'bg-success/15 text-success',
  archived: 'bg-surface2 text-subtle',
};

interface Props {
  onCountsChange?: () => void;
  toast: (msg: string, type?: 'success' | 'error') => void;
}

export default function MessagesTab({ onCountsChange, toast }: Props) {
  const confirm = useConfirm();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<MessageStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (status: MessageStatus | 'all') => {
    setLoading(true);
    try {
      const res = await api.get<{ messages: ContactMessage[]; byStatus: Record<string, number> }>(
        '/admin/contact-messages',
        { params: { ...(status !== 'all' && { status }), limit: 100 } }
      );
      setMessages(res.data.messages);
      setByStatus(res.data.byStatus);
    } catch {
      toast('Could not load messages', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(filter); }, [filter, load]);

  const setStatus = async (msg: ContactMessage, status: MessageStatus) => {
    setBusyId(msg.id);
    try {
      const res = await api.patch<ContactMessage>(`/admin/contact-messages/${msg.id}`, { status });
      setMessages((prev) =>
        // Drop the row when it no longer matches the active filter.
        filter !== 'all' && status !== filter
          ? prev.filter((m) => m.id !== msg.id)
          : prev.map((m) => (m.id === msg.id ? { ...res.data, handled_by_name: m.handled_by_name } : m))
      );
      setByStatus((prev) => ({
        ...prev,
        [msg.status]: Math.max(0, (prev[msg.status] || 0) - 1),
        [status]: (prev[status] || 0) + 1,
      }));
      onCountsChange?.();
    } catch {
      toast('Could not update the message', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (msg: ContactMessage) => {
    const ok = await confirm({
      title: 'Delete this message?',
      message: `From ${msg.name} — "${msg.subject}". This cannot be undone.`,
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/contact-messages/${msg.id}`);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      setByStatus((prev) => ({ ...prev, [msg.status]: Math.max(0, (prev[msg.status] || 0) - 1) }));
      onCountsChange?.();
    } catch {
      toast('Delete failed', 'error');
    }
  };

  // Opening an unread message marks it read, matching how every mail client behaves.
  const toggleExpand = (msg: ContactMessage) => {
    const opening = expandedId !== msg.id;
    setExpandedId(opening ? msg.id : null);
    if (opening && msg.status === 'new') setStatus(msg, 'read');
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {FILTERS.map(({ id, label }) => {
          const count = id === 'all'
            ? Object.values(byStatus).reduce((a, b) => a + b, 0)
            : byStatus[id] || 0;
          return (
            <button
              key={id}
              onClick={() => { setFilter(id); setExpandedId(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === id ? 'bg-clay text-white' : 'bg-surface2 text-muted hover:text-ink'
              }`}
            >
              {label}
              {count > 0 && <span className={`ml-1.5 ${filter === id ? 'opacity-80' : 'text-subtle'}`}>{count}</span>}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-clay" /></div>
      ) : messages.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-line rounded-xl">
          <Inbox size={28} className="mx-auto text-subtle mb-3" />
          <p className="text-sm text-muted">
            {filter === 'all' ? 'No messages yet.' : `No ${filter} messages.`}
          </p>
          <p className="text-xs text-subtle mt-1">
            Messages sent from the public contact page land here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => {
            const expanded = expandedId === msg.id;
            return (
              <div
                key={msg.id}
                className={`bg-surface border rounded-xl transition-colors ${
                  msg.status === 'new' ? 'border-clay/40' : 'border-line'
                }`}
              >
                <button
                  onClick={() => toggleExpand(msg)}
                  className="w-full text-left p-4 flex items-start gap-3"
                >
                  <div className="mt-0.5 flex-shrink-0 text-subtle">
                    {msg.status === 'new' ? <Mail size={16} className="text-clay" />
                      : msg.status === 'replied' ? <MailCheck size={16} className="text-success" />
                      : <MailOpen size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className={`text-sm truncate ${msg.status === 'new' ? 'font-bold text-ink' : 'font-medium text-ink'}`}>
                        {msg.subject}
                      </p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[msg.status]}`}>
                        {msg.status}
                      </span>
                      {!msg.email_sent && (
                        <span
                          title="Stored in the database, but not emailed — SMTP is not configured."
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-warning/15 text-warning"
                        >
                          <AlertCircle size={9} /> not emailed
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted truncate">
                      {msg.name} · {msg.email}
                    </p>
                    {!expanded && (
                      <p className="text-xs text-subtle truncate mt-1">{msg.message}</p>
                    )}
                  </div>
                  <span className="text-[11px] text-subtle flex-shrink-0 whitespace-nowrap">
                    {formatDate(msg.created_at)}
                  </span>
                </button>

                {expanded && (
                  <div className="px-4 pb-4 pt-0">
                    <div className="pl-7">
                      <div className="p-3.5 rounded-lg bg-canvas border border-line text-sm text-ink leading-relaxed whitespace-pre-wrap mb-3">
                        {msg.message}
                      </div>

                      {msg.handled_by_name && msg.handled_at && (
                        <p className="text-[11px] text-subtle mb-3">
                          Handled by {msg.handled_by_name} · {formatDate(msg.handled_at)}
                        </p>
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={`mailto:${msg.email}?subject=${encodeURIComponent(`Re: ${msg.subject}`)}`}
                          onClick={() => msg.status !== 'replied' && setStatus(msg, 'replied')}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-clay text-white px-3 py-1.5 rounded-lg hover:bg-clay-hover transition-colors"
                        >
                          <CornerUpLeft size={12} /> Reply by email
                        </a>
                        {msg.status !== 'replied' && (
                          <button
                            onClick={() => setStatus(msg, 'replied')}
                            disabled={busyId === msg.id}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted border border-line px-3 py-1.5 rounded-lg hover:text-ink hover:bg-surface2 transition-colors disabled:opacity-50"
                          >
                            <MailCheck size={12} /> Mark replied
                          </button>
                        )}
                        {msg.status !== 'archived' && (
                          <button
                            onClick={() => setStatus(msg, 'archived')}
                            disabled={busyId === msg.id}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted border border-line px-3 py-1.5 rounded-lg hover:text-ink hover:bg-surface2 transition-colors disabled:opacity-50"
                          >
                            <Archive size={12} /> Archive
                          </button>
                        )}
                        <button
                          onClick={() => remove(msg)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-danger border border-danger/30 px-3 py-1.5 rounded-lg hover:bg-danger/10 transition-colors ml-auto"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
