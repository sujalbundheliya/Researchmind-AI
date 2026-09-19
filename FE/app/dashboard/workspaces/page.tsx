'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, User } from '@/lib/auth';
import { isPro } from '@/lib/plan';
import api from '@/lib/api';
import UpgradePrompt from '@/components/UpgradePrompt';
import { Building2, Plus, Users, FileText, X } from 'lucide-react';

interface Workspace {
  id: string;
  name: string;
  role: string;
  member_count: number;
  doc_count: number;
  created_at: string;
}

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-700',
  editor: 'bg-blue-100 text-blue-700',
  viewer: 'bg-surface2 text-muted',
};

export default function WorkspacesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const u = await getCurrentUser();
    if (!u) { router.push('/login'); return; }
    setUser(u);
    if (!isPro(u)) { setLoading(false); return; } // Pro-only — skip the gated API call
    try {
      const res = await api.get<Workspace[]>('/workspaces');
      setWorkspaces(res.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!name.trim()) { setError('Workspace name required'); return; }
    setCreating(true);
    setError('');
    try {
      const res = await api.post<{ id: string }>('/workspaces', { name: name.trim() });
      router.push(`/workspaces/${res.data.id}`);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to create workspace');
      setCreating(false);
    }
  };

  if (user && !isPro(user)) {
    return (
      <UpgradePrompt
        icon={Building2}
        requiredPlan="pro"
        title="Shared Workspaces is a Pro feature"
        description="Collaborate with your team in shared research spaces — pool documents, chat sessions, and findings, with owner / editor / viewer roles."
        bullets={['Invite collaborators by email', 'Owner, editor & viewer roles', 'Shared documents & chat sessions', '50 GB team storage']}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Workspaces</h1>
          <p className="text-muted text-sm mt-1">Shared research spaces for you and your collaborators.</p>
        </div>
        <button
          onClick={() => { setName(''); setError(''); setShowCreate(true); }}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-clay text-white rounded-xl text-sm font-semibold hover:bg-clay-hover transition-colors shadow-sm flex-shrink-0"
        >
          <Plus size={16} /> New Workspace
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {[...Array(2)].map((_, i) => <div key={i} className="h-28 bg-surface rounded-xl border border-line animate-pulse" />)}
        </div>
      ) : workspaces.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-line rounded-xl bg-surface">
          <Building2 size={32} className="mx-auto text-subtle mb-3" />
          <p className="text-muted font-medium text-sm mb-1">No workspaces yet</p>
          <p className="text-subtle text-xs">Create one to start collaborating with your team.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {workspaces.map(ws => (
            <Link
              key={ws.id}
              href={`/workspaces/${ws.id}`}
              className="group bg-surface border border-line rounded-xl p-5 hover:border-clay hover:shadow-sm transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold">{ws.name[0]?.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink truncate group-hover:text-clay transition-colors">{ws.name}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${ROLE_BADGE[ws.role] || ROLE_BADGE.viewer}`}>
                    {ws.role}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4 text-xs text-muted">
                <span className="flex items-center gap-1"><Users size={13} /> {ws.member_count} member{ws.member_count !== 1 ? 's' : ''}</span>
                <span className="flex items-center gap-1"><FileText size={13} /> {ws.doc_count} doc{ws.doc_count !== 1 ? 's' : ''}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-line">
              <h3 className="text-base font-semibold text-ink">New Workspace</h3>
              <button onClick={() => setShowCreate(false)} className="text-subtle hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-ink mb-1 block">Workspace Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !creating) handleCreate(); }}
                  autoFocus
                  maxLength={100}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clay"
                  placeholder="e.g. Systematic Review — Q3"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                onClick={handleCreate}
                disabled={creating}
                className="w-full py-2.5 bg-clay text-white rounded-lg text-sm font-medium hover:bg-clay-hover disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create Workspace'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
