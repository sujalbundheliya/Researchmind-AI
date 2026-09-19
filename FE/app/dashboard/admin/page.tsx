'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, User } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/plan';
import api from '@/lib/api';
import Toaster from '@/components/Toaster';
import { useToast } from '@/lib/toast';
import {
  LayoutDashboard, Users, Mail, FileText, Activity, Loader2, ShieldAlert,
} from 'lucide-react';
import { AdminStats } from '@/components/admin/types';
import OverviewTab from '@/components/admin/OverviewTab';
import UsersTab from '@/components/admin/UsersTab';
import MessagesTab from '@/components/admin/MessagesTab';
import DocumentsTab from '@/components/admin/DocumentsTab';
import SystemTab from '@/components/admin/SystemTab';

type Tab = 'overview' | 'users' | 'messages' | 'documents' | 'system';

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'messages', label: 'Messages', icon: Mail },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'system', label: 'System', icon: Activity },
];

export default function AdminPage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);

  const refreshStats = useCallback(async () => {
    try {
      const s = await api.get<AdminStats>('/admin/stats');
      setStats(s.data);
    } catch { /* the overview tab renders its own loading state */ }
  }, []);

  const init = useCallback(async () => {
    const u: User | null = await getCurrentUser();
    if (!u) { router.push('/login'); return; }
    if (!isSuperAdmin(u)) { setAuthorized(false); setLoading(false); return; }
    setAuthorized(true);
    await refreshStats();
    setLoading(false);
  }, [router, refreshStats]);

  useEffect(() => { init(); }, [init]);

  if (authorized === false) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <ShieldAlert className="mx-auto text-red-500 mb-3" size={32} />
        <h1 className="text-xl font-bold text-ink mb-1">Not authorized</h1>
        <p className="text-muted text-sm">This area is restricted to super admins.</p>
      </div>
    );
  }
  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-clay" /></div>;
  }

  const unread = stats?.messages?.unread ?? 0;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Admin console</h1>
        <p className="text-muted text-sm mt-1">
          Manage users and plans, triage support messages, and keep an eye on the system.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line mb-6 gap-1 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === id ? 'border-clay text-clay' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Icon size={15} /> {label}
            {id === 'messages' && unread > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-clay text-white text-[10px] font-bold leading-none">
                {unread}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab stats={stats} />}
      {tab === 'users' && <UsersTab onChanged={refreshStats} toast={toast} />}
      {tab === 'messages' && <MessagesTab onCountsChange={refreshStats} toast={toast} />}
      {tab === 'documents' && <DocumentsTab onChanged={refreshStats} toast={toast} />}
      {tab === 'system' && <SystemTab toast={toast} />}

      <Toaster toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
