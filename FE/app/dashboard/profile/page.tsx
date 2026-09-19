'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User as UserIcon, Shield, BarChart3, AlertTriangle,
  Loader2, Save, KeyRound, Mail, Building2, Calendar,
  FileText, FlaskConical, Table2, FileEdit, MessageSquare,
  CheckCircle2, Chrome, CreditCard, ArrowRight,
} from 'lucide-react';
import api from '@/lib/api';
import { getCurrentUser, invalidateUserCache, User, UsageStats } from '@/lib/auth';
import { planLabel, PLAN_META, uploadsRemaining, isSuperAdmin } from '@/lib/plan';
import StorageBar from '@/components/StorageBar';
import PlanBadge from '@/components/PlanBadge';
import Toaster from '@/components/Toaster';
import { useToast } from '@/lib/toast';

type Tab = 'profile' | 'security' | 'usage';

const TABS: { id: Tab; label: string; icon: typeof UserIcon }[] = [
  { id: 'profile', label: 'Profile', icon: UserIcon },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'usage', label: 'Usage', icon: BarChart3 },
];

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function ProfilePage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();

  const [user, setUser] = useState<User | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('profile');

  // Profile form
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [bio, setBio] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Danger zone
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  const load = useCallback(async () => {
    const u = await getCurrentUser();
    if (!u) { router.push('/login'); return; }
    setUser(u);
    setName(u.name || '');
    setInstitution(u.institution || '');
    setBio(u.bio || '');
    setLoading(false);

    api.get<UsageStats>('/auth/usage')
      .then((r) => setUsage(r.data))
      .catch(() => { /* usage panel degrades to plan counters */ });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await api.patch<User>('/auth/profile', {
        name: name.trim(),
        institution: institution.trim(),
        bio: bio.trim(),
      });
      setUser(res.data);
      // The sidebar and plan badge read from the cached user — drop it so they
      // pick up the new name instead of showing the old one until it expires.
      invalidateUserCache();
      toast('Profile updated');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast(axiosErr.response?.data?.message ?? 'Could not save your profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The two new passwords do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await api.post<{ message: string }>('/auth/change-password', {
        current_password: currentPassword || undefined,
        new_password: newPassword,
      });
      toast(res.data.message);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      invalidateUserCache();
      const fresh = await getCurrentUser();
      if (fresh) setUser(fresh);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setPasswordError(axiosErr.response?.data?.message ?? 'Could not update your password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError('');
    setDeleting(true);
    try {
      await api.delete('/auth/account', { data: { password: deletePassword || undefined } });
      invalidateUserCache();
      window.location.href = '/';
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setDeleteError(axiosErr.response?.data?.message ?? 'Could not delete your account.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-clay" />
      </div>
    );
  }
  if (!user) return null;

  const hasPassword = user.has_password !== false;
  const remaining = uploadsRemaining(user);
  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="max-w-3xl mx-auto">
      <Toaster toasts={toasts} onRemove={removeToast} />

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-16 h-16 rounded-2xl bg-clay flex items-center justify-center text-xl font-bold text-white flex-shrink-0">
          {getInitials(user.name || 'U')}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-ink leading-tight mb-1">{user.name}</h1>
          <p className="text-sm text-muted flex items-center gap-1.5 mb-2">
            <Mail size={13} /> {user.email}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <PlanBadge user={user} />
            {memberSince && (
              <span className="text-xs text-subtle flex items-center gap-1">
                <Calendar size={11} /> Member since {memberSince}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line mb-6 gap-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === id ? 'border-clay text-clay' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* ── Profile tab ── */}
      {tab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="space-y-5">
          <div className="bg-surface border border-line rounded-xl p-6 space-y-5">
            <div>
              <label htmlFor="pf-name" className="block text-xs font-semibold text-ink mb-1.5">Display name</label>
              <input
                id="pf-name" type="text" value={name} onChange={(e) => setName(e.target.value)}
                maxLength={100} required
                className="w-full px-3.5 py-2.5 rounded-lg bg-canvas border border-line text-sm text-ink focus:outline-none focus:border-clay focus:ring-2 focus:ring-clay/20 transition-colors"
              />
            </div>

            <div>
              <label htmlFor="pf-email" className="block text-xs font-semibold text-ink mb-1.5">Email address</label>
              <input
                id="pf-email" type="email" value={user.email} disabled
                className="w-full px-3.5 py-2.5 rounded-lg bg-surface2 border border-line text-sm text-subtle cursor-not-allowed"
              />
              <p className="text-[11px] text-subtle mt-1.5">
                Your email links your billing and sign-in identity, so it can&apos;t be changed here.{' '}
                <Link href="/dashboard/support" className="text-clay hover:underline">Contact us</Link> if you need it moved.
              </p>
            </div>

            <div>
              <label htmlFor="pf-inst" className="block text-xs font-semibold text-ink mb-1.5">
                Institution <span className="font-normal text-subtle">(optional)</span>
              </label>
              <div className="relative">
                <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <input
                  id="pf-inst" type="text" value={institution} onChange={(e) => setInstitution(e.target.value)}
                  maxLength={200} placeholder="University of Example"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-canvas border border-line text-sm text-ink placeholder:text-subtle focus:outline-none focus:border-clay focus:ring-2 focus:ring-clay/20 transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="pf-bio" className="block text-xs font-semibold text-ink mb-1.5">
                Research focus <span className="font-normal text-subtle">(optional)</span>
              </label>
              <textarea
                id="pf-bio" value={bio} onChange={(e) => setBio(e.target.value)}
                maxLength={500} rows={4} placeholder="What do you work on?"
                className="w-full px-3.5 py-2.5 rounded-lg bg-canvas border border-line text-sm text-ink placeholder:text-subtle focus:outline-none focus:border-clay focus:ring-2 focus:ring-clay/20 transition-colors resize-y"
              />
              <p className="text-[11px] text-subtle mt-1.5 text-right">{bio.length} / 500</p>
            </div>
          </div>

          <button
            type="submit" disabled={savingProfile}
            className="flex items-center gap-2 bg-clay text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-clay-hover transition-colors disabled:opacity-60"
          >
            {savingProfile ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> Save changes</>}
          </button>
        </form>
      )}

      {/* ── Security tab ── */}
      {tab === 'security' && (
        <div className="space-y-5">
          {/* Sign-in methods */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <h2 className="text-sm font-bold text-ink mb-4">Sign-in methods</h2>
            <div className="space-y-2.5">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-canvas border border-line">
                <KeyRound size={16} className="text-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">Email &amp; password</p>
                  <p className="text-xs text-subtle">
                    {hasPassword ? 'Enabled' : 'Not set up — add a password below'}
                  </p>
                </div>
                {hasPassword && <CheckCircle2 size={16} className="text-success flex-shrink-0" />}
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-canvas border border-line">
                <Chrome size={16} className="text-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">Google</p>
                  <p className="text-xs text-subtle">{user.has_google ? 'Connected' : 'Not connected'}</p>
                </div>
                {user.has_google && <CheckCircle2 size={16} className="text-success flex-shrink-0" />}
              </div>
            </div>
          </div>

          {/* Password */}
          <form onSubmit={handleChangePassword} className="bg-surface border border-line rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-ink">{hasPassword ? 'Change password' : 'Set a password'}</h2>
              {!hasPassword && (
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Your account was created with Google. Setting a password lets you sign in with your
                  email as well — Google sign-in keeps working either way.
                </p>
              )}
            </div>

            {hasPassword && (
              <div>
                <label htmlFor="pw-current" className="block text-xs font-semibold text-ink mb-1.5">Current password</label>
                <input
                  id="pw-current" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                  required autoComplete="current-password"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-canvas border border-line text-sm text-ink focus:outline-none focus:border-clay focus:ring-2 focus:ring-clay/20 transition-colors"
                />
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="pw-new" className="block text-xs font-semibold text-ink mb-1.5">New password</label>
                <input
                  id="pw-new" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  required minLength={8} autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-canvas border border-line text-sm text-ink focus:outline-none focus:border-clay focus:ring-2 focus:ring-clay/20 transition-colors"
                />
              </div>
              <div>
                <label htmlFor="pw-confirm" className="block text-xs font-semibold text-ink mb-1.5">Confirm new password</label>
                <input
                  id="pw-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  required minLength={8} autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-canvas border border-line text-sm text-ink focus:outline-none focus:border-clay focus:ring-2 focus:ring-clay/20 transition-colors"
                />
              </div>
            </div>

            <p className="text-[11px] text-subtle">At least 8 characters.</p>

            {passwordError && (
              <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3.5 py-2.5">{passwordError}</p>
            )}

            <button
              type="submit" disabled={savingPassword}
              className="flex items-center gap-2 bg-clay text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-clay-hover transition-colors disabled:opacity-60"
            >
              {savingPassword ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><KeyRound size={15} /> {hasPassword ? 'Update password' : 'Set password'}</>}
            </button>
          </form>

          {/* Danger zone */}
          <div className="border border-danger/30 rounded-xl p-6 bg-danger/[0.03]">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={18} className="text-danger flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-bold text-ink">Delete account</h2>
                <p className="text-xs text-muted leading-relaxed mt-1">
                  Permanently removes your account, every document you&apos;ve uploaded, and all reviews,
                  extraction tables, drafts and chats. Any active subscription is cancelled immediately.
                  This cannot be undone.
                </p>
              </div>
            </div>

            {!showDelete ? (
              <button
                onClick={() => setShowDelete(true)}
                className="text-sm font-medium text-danger border border-danger/40 px-4 py-2 rounded-lg hover:bg-danger/10 transition-colors"
              >
                Delete my account
              </button>
            ) : (
              <form onSubmit={handleDeleteAccount} className="space-y-3.5 pt-2">
                <div>
                  <label htmlFor="del-confirm" className="block text-xs font-semibold text-ink mb-1.5">
                    Type <span className="font-mono text-danger">delete my account</span> to confirm
                  </label>
                  <input
                    id="del-confirm" type="text" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)}
                    autoComplete="off"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-canvas border border-line text-sm text-ink focus:outline-none focus:border-danger focus:ring-2 focus:ring-danger/20 transition-colors"
                  />
                </div>
                {hasPassword && (
                  <div>
                    <label htmlFor="del-pw" className="block text-xs font-semibold text-ink mb-1.5">Your password</label>
                    <input
                      id="del-pw" type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)}
                      autoComplete="current-password"
                      className="w-full px-3.5 py-2.5 rounded-lg bg-canvas border border-line text-sm text-ink focus:outline-none focus:border-danger focus:ring-2 focus:ring-danger/20 transition-colors"
                    />
                  </div>
                )}

                {deleteError && (
                  <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3.5 py-2.5">{deleteError}</p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={deleting || deleteConfirm !== 'delete my account'}
                    className="flex items-center gap-2 bg-danger text-white font-semibold text-sm px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {deleting ? <><Loader2 size={15} className="animate-spin" /> Deleting…</> : 'Permanently delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowDelete(false); setDeleteConfirm(''); setDeletePassword(''); setDeleteError(''); }}
                    className="text-sm font-medium text-muted px-4 py-2 rounded-lg hover:bg-surface2 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Usage tab ── */}
      {tab === 'usage' && (
        <div className="space-y-5">
          {/* Plan */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <p className="text-xs text-subtle uppercase tracking-wider font-semibold mb-1">Current plan</p>
                <p className="text-xl font-bold text-ink">{planLabel(user)}</p>
                {!isSuperAdmin(user) && (
                  <p className="text-xs text-muted mt-0.5">{PLAN_META[user.plan]?.priceLabel}</p>
                )}
                {user.plan_renews_at && (
                  <p className="text-xs text-subtle mt-1">
                    Renews {new Date(user.plan_renews_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
              <Link
                href="/dashboard/billing"
                className="flex items-center gap-1.5 text-xs font-semibold text-clay border border-clay px-3 py-1.5 rounded-lg hover:bg-clay/10 transition-colors flex-shrink-0"
              >
                <CreditCard size={13} /> Manage <ArrowRight size={12} />
              </Link>
            </div>

            <StorageBar used={user.storage_used_bytes} limit={user.storage_limit_bytes} />

            {remaining !== null && (
              <p className="text-xs text-muted mt-4 pt-4 border-t border-linesoft">
                <span className="font-semibold text-ink">{remaining}</span> of 5 lifetime PDF uploads remaining on the Free plan.
              </p>
            )}
          </div>

          {/* Activity */}
          <div className="bg-surface border border-line rounded-xl p-6">
            <h2 className="text-sm font-bold text-ink mb-4">Your activity</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Documents', value: usage?.documents, icon: FileText },
                { label: 'Reviews', value: usage?.reviews, icon: FlaskConical },
                { label: 'Extraction tables', value: usage?.extraction_tables, icon: Table2 },
                { label: 'AI drafts', value: usage?.drafts, icon: FileEdit },
                { label: 'Chat sessions', value: usage?.chat_sessions, icon: MessageSquare },
                { label: 'Failed uploads', value: usage?.documents_failed, icon: AlertTriangle },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="p-4 rounded-lg bg-canvas border border-line">
                  <Icon size={15} className="text-subtle mb-2" />
                  <p className="text-2xl font-bold text-ink leading-none">
                    {value ?? <span className="text-subtle text-base">—</span>}
                  </p>
                  <p className="text-xs text-muted mt-1.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
