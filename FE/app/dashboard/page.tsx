'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, User } from '@/lib/auth';
import { uploadsRemaining } from '@/lib/plan';
import api from '@/lib/api';
import FileUploader from '@/components/FileUploader';
import DocumentCard from '@/components/DocumentCard';
import Toaster from '@/components/Toaster';
import { useToast } from '@/lib/toast';
import { FileText, MessageSquare, HardDrive, ArrowRight, Upload, Crown } from 'lucide-react';

interface Document {
  id: string; original_name: string; file_size_bytes: number;
  status: string; page_count?: number; created_at: string;
}
interface Session {
  id: string; title: string; mode: string; message_count: number;
  created_at: string; document_ids: string[];
}

type SortKey = 'date' | 'name' | 'size';

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-surface rounded-xl border border-line p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-ink leading-tight">{value}</p>
        <p className="text-sm text-muted">{label}</p>
        {sub && <p className="text-xs text-subtle mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function StorageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const usedMB = (used / 1024 / 1024).toFixed(1);
  const limitMB = Math.round(limit / 1024 / 1024);
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-blue-600';
  return (
    <div className="bg-surface rounded-xl border border-line p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
          <HardDrive size={16} />
        </div>
        <div className="flex-1 flex items-center justify-between">
          <span className="text-sm font-medium text-ink">Storage</span>
          <span className="text-sm text-muted">{usedMB} / {limitMB} MB</span>
        </div>
      </div>
      <div className="h-2 bg-surface2 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [showUploader, setShowUploader] = useState(false);
  const { toasts, toast, removeToast } = useToast();

  const fetchUser = useCallback(async () => { setUser(await getCurrentUser()); }, []);
  const fetchDocs = useCallback(async () => {
    try { const r = await api.get<Document[]>('/documents'); setDocs(r.data); }
    catch { /* silent */ } finally { setLoadingDocs(false); }
  }, []);
  const fetchSessions = useCallback(async () => {
    try { const r = await api.get<Session[]>('/chat/sessions'); setSessions(r.data.slice(0, 5)); }
    catch { /* silent */ }
  }, []);

  useEffect(() => { fetchUser(); fetchDocs(); fetchSessions(); }, [fetchUser, fetchDocs, fetchSessions]);

  useEffect(() => {
    if (!docs.some(d => d.status === 'processing')) return;
    const t = setInterval(() => { fetchDocs(); fetchUser(); }, 5000);
    return () => clearInterval(t);
  }, [docs, fetchDocs, fetchUser]);

  const sorted = [...docs].sort((a, b) => {
    if (sortKey === 'name') return a.original_name.localeCompare(b.original_name);
    if (sortKey === 'size') return b.file_size_bytes - a.file_size_bytes;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const readyDocs = docs.filter(d => d.status === 'ready').length;
  const totalSessions = sessions.length;
  const freeUploadsLeft = uploadsRemaining(user); // null = unlimited (paid / admin)

  const resumeSession = (s: Session) => router.push(`/workspace/chat?session=${s.id}`);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}! 👋
          </h1>
          <p className="text-muted text-sm mt-1">Your research workspace is ready.</p>
        </div>
        <button
          onClick={() => router.push('/workspace/all')}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm flex-shrink-0"
        >
          Ask AI <ArrowRight size={15} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<FileText size={18} />} label="Total Documents" value={docs.length} sub={`${readyDocs} ready`} />
        <StatCard icon={<MessageSquare size={18} />} label="Chat Sessions" value={totalSessions} />
        {user && <div className="col-span-2"><StorageBar used={user.storage_used_bytes} limit={user.storage_limit_bytes} /></div>}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Documents */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-ink">
              Documents{docs.length > 0 && <span className="text-subtle font-normal ml-1.5 text-sm">({docs.length})</span>}
            </h2>
            <div className="flex items-center gap-2">
              {docs.length > 1 && (
                <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
                  className="text-xs border border-line rounded-lg px-2 py-1 text-muted bg-surface focus:outline-none">
                  <option value="date">Date</option>
                  <option value="name">Name</option>
                  <option value="size">Size</option>
                </select>
              )}
              <button onClick={() => setShowUploader(!showUploader)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors">
                <Upload size={13} /> Upload
              </button>
            </div>
          </div>

          {showUploader && (
            <div className="mb-4">
              {freeUploadsLeft === 0 ? (
                <div className="border-2 border-dashed border-clay/40 rounded-xl p-6 text-center bg-clay/5">
                  <Crown size={24} className="mx-auto text-clay mb-2" />
                  <p className="text-sm font-medium text-ink mb-1">You&apos;ve used all 5 free uploads</p>
                  <p className="text-xs text-muted mb-3">Upgrade for unlimited PDF uploads.</p>
                  <button onClick={() => router.push('/dashboard/billing')}
                    className="px-4 py-2 bg-clay text-white rounded-lg text-sm font-semibold hover:bg-clay-hover transition-colors">
                    View plans
                  </button>
                </div>
              ) : (
                <>
                  <FileUploader onUploadSuccess={(doc) => {
                    setDocs(prev => [doc as unknown as Document, ...prev]);
                    fetchUser();
                    toast('Document uploaded — processing started');
                  }} />
                  {freeUploadsLeft !== null && (
                    <p className="mt-2 text-xs text-muted flex items-center gap-1.5">
                      <Crown size={12} className="text-clay" />
                      {freeUploadsLeft} of 5 free uploads left ·{' '}
                      <button onClick={() => router.push('/dashboard/billing')} className="text-clay hover:underline font-medium">
                        Upgrade
                      </button>
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {loadingDocs ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-surface rounded-xl border border-line animate-pulse" />)}
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-14 border-2 border-dashed border-line rounded-xl bg-surface">
              <div className="text-4xl mb-3">📄</div>
              <p className="text-muted font-medium text-sm mb-1">No documents yet</p>
              <p className="text-subtle text-xs mb-4">Upload your first research paper to get started</p>
              <button onClick={() => setShowUploader(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                Upload Paper
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map(doc => (
                <DocumentCard key={doc.id} doc={doc}
                  onDelete={(id) => { setDocs(p => p.filter(d => d.id !== id)); fetchUser(); toast('Document deleted'); }}
                  onRename={(id, name) => { setDocs(p => p.map(d => d.id === id ? { ...d, original_name: name } : d)); toast('Renamed'); }} />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar panels */}
        <div className="space-y-4">
          {/* Recent Sessions */}
          <div className="bg-surface rounded-xl border border-line p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-ink">Recent Chats</h3>
              <button onClick={() => router.push('/workspace/chat')}
                className="text-xs text-blue-600 hover:underline">View all</button>
            </div>
            {sessions.length === 0 ? (
              <div className="text-center py-6">
                <div className="text-2xl mb-2">💬</div>
                <p className="text-xs text-subtle">No chats yet</p>
                <button onClick={() => router.push('/workspace/all')}
                  className="mt-2 text-xs text-blue-600 hover:underline">Start a chat</button>
              </div>
            ) : (
              <div className="space-y-1">
                {sessions.map(s => (
                  <button key={s.id} onClick={() => resumeSession(s)}
                    className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-surface2 text-left transition-colors">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.mode === 'single' ? 'bg-blue-500' : 'bg-purple-500'}`} />
                    <span className="flex-1 text-xs text-ink truncate">{s.title}</span>
                    <span className="text-xs text-subtle flex-shrink-0">{s.message_count}m</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-surface rounded-xl border border-line p-4">
            <h3 className="text-sm font-semibold text-ink mb-3">Quick Actions</h3>
            <div className="space-y-1">
              {[
                { label: 'Systematic Review', emoji: '🔬', href: '/dashboard/review' },
                { label: 'Data Extraction', emoji: '📊', href: '/dashboard/extraction' },
                { label: 'AI Writing', emoji: '✍️', href: '/dashboard/drafts' },
                { label: 'Zotero Import', emoji: '📚', href: '/dashboard/zotero' },
              ].map(({ label, emoji, href }) => (
                <button key={label} onClick={() => router.push(href)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-ink hover:bg-surface2 transition-colors text-left">
                  <span>{emoji}</span>
                  <span>{label}</span>
                  <ArrowRight size={13} className="ml-auto text-subtle" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Toaster toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
