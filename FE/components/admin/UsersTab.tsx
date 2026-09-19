'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, RotateCcw, Trash2, Loader2, Crown } from 'lucide-react';
import api from '@/lib/api';
import { useConfirm } from '@/lib/confirm';
import { AdminUser, formatBytes, formatDate } from './types';

const PLANS = ['free', 'individual', 'pro'];
const ROLES = ['user', 'admin', 'super_admin'];

interface Props {
  onChanged?: () => void;
  toast: (msg: string, type?: 'success' | 'error') => void;
}

export default function UsersTab({ onChanged, toast }: Props) {
  const confirm = useConfirm();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const res = await api.get<{ users: AdminUser[] }>('/admin/users', { params: { search: q, limit: 100 } });
      setUsers(res.data.users);
    } catch {
      toast('Could not load users', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(''); }, [load]);

  const patchUser = async (id: string, patch: Record<string, string>) => {
    setSavingId(id);
    try {
      const res = await api.patch<AdminUser>(`/admin/users/${id}`, patch);
      setUsers((prev) => prev.map((u) => (u.id === id ? res.data : u)));
      toast('User updated');
      onChanged?.();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast(axiosErr.response?.data?.message ?? 'Update failed', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const resetUsage = async (id: string) => {
    try {
      const res = await api.post<AdminUser>(`/admin/users/${id}/reset-usage`);
      setUsers((prev) => prev.map((u) => (u.id === id ? res.data : u)));
      toast('Usage counters reset');
    } catch {
      toast('Reset failed', 'error');
    }
  };

  const deleteUser = async (u: AdminUser) => {
    const ok = await confirm({
      title: `Delete ${u.name}?`,
      message: `${u.email} — this permanently removes the account along with every document, review, extraction table and draft they own. This cannot be undone.`,
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/users/${u.id}`);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      toast('User deleted');
      onChanged?.();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast(axiosErr.response?.data?.message ?? 'Delete failed', 'error');
    }
  };

  const onSearch = (e: React.FormEvent) => { e.preventDefault(); load(search); };

  return (
    <div>
      <form onSubmit={onSearch} className="mb-4 flex items-center gap-2 max-w-sm">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="w-full border border-line rounded-lg pl-9 pr-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-clay"
          />
        </div>
        <button type="submit" className="px-3 py-2 text-sm font-medium bg-surface2 text-ink rounded-lg hover:bg-line transition-colors">
          Search
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-clay" /></div>
      ) : (
        <div className="bg-surface border border-line rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[880px]">
            <thead>
              <tr className="text-left text-xs text-subtle uppercase tracking-wider border-b border-line">
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold" title="uploads / extractions / reviews / drafts">
                  Usage (up/ex/rv/dr)
                </th>
                <th className="px-4 py-3 font-semibold">Storage</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0 hover:bg-surface2/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink truncate max-w-[200px] flex items-center gap-1.5">
                      {u.role === 'super_admin' && <Crown size={12} className="text-clay flex-shrink-0" />}
                      {u.name}
                    </p>
                    <p className="text-xs text-subtle truncate max-w-[200px]">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.plan}
                      disabled={savingId === u.id}
                      onChange={(e) => patchUser(u.id, { plan: e.target.value })}
                      className="border border-line rounded-lg px-2 py-1 text-xs bg-surface focus:outline-none focus:ring-1 focus:ring-clay capitalize"
                    >
                      {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      disabled={savingId === u.id}
                      onChange={(e) => patchUser(u.id, { role: e.target.value })}
                      className="border border-line rounded-lg px-2 py-1 text-xs bg-surface focus:outline-none focus:ring-1 focus:ring-clay"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted tabular-nums whitespace-nowrap">
                    {u.lifetime_uploads} / {u.extractions_used} / {u.reviews_used} / {u.drafts_used}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted tabular-nums whitespace-nowrap">
                    {formatBytes(u.storage_used_bytes)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => resetUsage(u.id)} title="Reset usage counters"
                        className="p-1.5 text-subtle hover:text-clay hover:bg-clay/10 rounded-lg transition-colors">
                        <RotateCcw size={14} />
                      </button>
                      <button onClick={() => deleteUser(u)} title="Delete user"
                        className="p-1.5 text-subtle hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-subtle text-sm">No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
